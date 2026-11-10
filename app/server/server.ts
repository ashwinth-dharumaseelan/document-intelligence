import { createApp, analytics, files, genie, server } from '@databricks/appkit';
import { agents, aiSearch } from '@databricks/appkit/beta';

/** Read a small JSON request body (the server does not parse JSON for custom routes). */
async function readJson(req: AsyncIterable<Buffer | string>): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (raw.length > 200_000) return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

interface QuickAnswerRequest {
  question?: unknown;
  sources?: { file_name?: unknown; text?: unknown }[];
}

// Everything a person does in the app runs with their own Databricks identity (on-behalf-of-user),
// so Unity Catalog grants decide what each person can search, open and ask about.
await createApp({
  plugins: [
    agents(),
    aiSearch({
      indexes: {
        // Index name comes from DATABRICKS_VS_INDEX_NAME (document_intelligence.silver.document_chunks_index).
        documents: {
          columns: ['document_id', 'chunk_to_retrieve', 'file_name', 'document_type', 'path'],
          queryType: 'hybrid',
          numResults: 20,
          auth: 'on-behalf-of-user',
        },
      },
    }),
    analytics(),
    files({
      volumes: {
        // DATABRICKS_VOLUME_FILES: the source volume the pipeline ingests from.
        // People may open, download and upload documents; nobody deletes through the app.
        files: {
          auth: 'on-behalf-of-user',
          maxUploadSize: 100_000_000,
          policy: (action) => action !== 'delete' && action !== 'mkdir',
        },
      },
    }),
    genie({ spaces: { records: process.env.DATABRICKS_GENIE_SPACE_ID ?? '' } }),
    server(),
  ],
  onPluginsReady(appkit) {
    appkit.server.extend((app) => {
      // Who is signed in (headers injected by Databricks Apps).
      app.get('/api/whoami', (req, res) => {
        res.json({
          email: req.header('x-forwarded-email') ?? null,
          user: req.header('x-forwarded-user') ?? null,
        });
      });

      // Quick answer for the Search page: one short, cited answer drawn ONLY from the passages the
      // search already returned. Runs with the signed-in user's token (model-serving scope).
      app.post('/api/quick-answer', async (req, res) => {
        const payload = ((req.body as unknown) ?? (await readJson(req))) as QuickAnswerRequest | null;
        const token = req.header('x-forwarded-access-token');
        const rawHost = process.env.DATABRICKS_HOST ?? '';
        const endpoint = process.env.DATABRICKS_SERVING_ENDPOINT_NAME ?? '';
        const asText = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
        const question = asText(payload?.question, 500);
        const sources = (Array.isArray(payload?.sources) ? payload.sources : [])
          .slice(0, 6)
          .map((src) => ({ file_name: asText(src?.file_name, 200), text: asText(src?.text, 2500) }))
          .filter((src) => src.text);
        if (!token || !rawHost || !endpoint) return res.status(503).json({ error: 'Quick answer is not available here.' });
        if (!question || sources.length === 0) return res.status(400).json({ error: 'Question and sources are required.' });

        const host = rawHost.startsWith('http') ? rawHost : `https://${rawHost}`;
        const context = sources.map((s, i) => `[${i + 1}] ${s.file_name}\n${s.text}`).join('\n\n');
        try {
          const r = await fetch(`${host.replace(/\/$/, '')}/serving-endpoints/${endpoint}/invocations`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              max_tokens: 220,
              temperature: 0,
              messages: [
                {
                  role: 'system',
                  content:
                    'You answer questions about company records using ONLY the numbered sources given. ' +
                    'Reply in at most two short sentences, quote exact wording for amounts, dates and clauses, ' +
                    'and end each sentence with the source number in square brackets, e.g. [1]. ' +
                    'If the sources do not answer the question, reply exactly: NO_ANSWER',
                },
                { role: 'user', content: `Sources:\n${context}\n\nQuestion: ${question}` },
              ],
            }),
          });
          if (!r.ok) return res.status(502).json({ error: `Model call failed (${r.status})` });
          const body = (await r.json()) as { choices?: { message?: { content?: string } }[] };
          const answer = body.choices?.[0]?.message?.content?.trim() ?? '';
          return res.json({ answer: !answer || answer.includes('NO_ANSWER') ? null : answer });
        } catch (err) {
          return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
        }
      });
    });
  },
});

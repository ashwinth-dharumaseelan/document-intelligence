import { createApp, analytics, files, genie, server } from '@databricks/appkit';
import { agents, aiSearch } from '@databricks/appkit/beta';

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
    });
  },
});

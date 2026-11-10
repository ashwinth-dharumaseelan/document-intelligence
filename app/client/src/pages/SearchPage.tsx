import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert, AlertDescription, Skeleton, useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useAiSearchQuery } from '@databricks/appkit-ui/react/beta';
import {
  AlarmClock,
  ArrowRight,
  BadgeCheck,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  History,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { IMAGE_EXTENSIONS, formatAmount, originalFileUrl, typeLabel } from '../lib/records';
import { typeIcon } from '../lib/typeIcons';

interface ChunkRow extends Record<string, unknown> {
  document_id: string;
  chunk_to_retrieve: string;
  file_name: string;
  document_type: string;
  path: string;
}

interface DocumentHit {
  documentId: string;
  fileName: string;
  documentType: string;
  path: string;
  bestScore: number;
  passages: string[];
}

const SUGGESTIONS = [
  'termination notice period',
  'amount awarded by the court',
  'who can act on behalf of Al Noor',
  'laptops issued to employees',
  'licence expiry date',
];

const STOP_WORDS = new Set(
  'the and for with from that this what when where which who whom how are was were has have had can our your their about into than then them they its not any all per'.split(' '),
);

const RECENT_KEY = 'records.recentSearches';

function loadRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private window: recent searches simply are not remembered */
  }
}

/** Wrap the meaningful words of the query in <mark> so matches stand out. */
function highlight(text: string, query: string): ReactNode {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter(
    (w) => w.length >= 3 && !STOP_WORDS.has(w),
  );
  if (words.length === 0) return text;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'giu');
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** Pick the 2–3 lines of a passage that contain the most query words. */
function bestSnippet(passage: string, query: string): string {
  const words = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3);
  const clean = passage.replace(/\s+/g, ' ').trim();
  if (words.length === 0 || clean.length <= 320) return clean;
  const sentences = clean.split(/(?<=[.;:])\s+/);
  let best = 0;
  let bestScore = -1;
  sentences.forEach((s, i) => {
    const lower = s.toLowerCase();
    const score = words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  const snippet = sentences.slice(Math.max(0, best - 1), best + 2).join(' ');
  return (best > 1 ? '…' : '') + (snippet.length > 360 ? `${snippet.slice(0, 360)}…` : snippet);
}

function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso.replace(' ', 'T')).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Search home: hero search, document-type tiles, what needs attention, then cited results. */
export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [type, setType] = useState('ALL');
  const [active, setActive] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const { search, data, loading, error } = useAiSearchQuery<ChunkRow>({ alias: 'documents' });
  const types = useAnalyticsQuery('document_types', {});
  const kpis = useAnalyticsQuery('kpi_overview', {});
  const dates = useAnalyticsQuery('key_dates', {});
  const inputRef = useRef<HTMLInputElement>(null);

  const run = (text: string, docType: string = type) => {
    const q = text.trim();
    if (!q && docType === 'ALL') {
      inputRef.current?.focus();
      return;
    }
    setQuery(q);
    setSubmitted(q);
    setType(docType);
    setActive(true);
    if (q) {
      const next = [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 5);
      setRecent(next);
      saveRecent(next);
    }
    void search({
      queryText: q || typeLabel(docType),
      numResults: q ? 20 : 200,
      ...(docType !== 'ALL' ? { filters: { document_type: docType } } : {}),
    });
  };

  // Links from other pages (e.g. a cited file in the Assistant) open Search with ?q=... already run.
  const startQuery = useRef(new URLSearchParams(window.location.search).get('q'));
  useEffect(() => {
    if (startQuery.current) run(startQuery.current, 'ALL');
    // run once on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearSearch = () => {
    setQuery('');
    setSubmitted('');
    setType('ALL');
    setActive(false);
    inputRef.current?.focus();
  };

  // One card per document: best-scoring passage first.
  const hits = useMemo<DocumentHit[]>(() => {
    const byDoc = new Map<string, DocumentHit>();
    for (const r of data?.results ?? []) {
      const d = r.data;
      const hit = byDoc.get(d.document_id) ?? {
        documentId: d.document_id,
        fileName: d.file_name,
        documentType: d.document_type,
        path: d.path,
        bestScore: r.score,
        passages: [],
      };
      hit.bestScore = Math.max(hit.bestScore, r.score);
      if (d.chunk_to_retrieve) hit.passages.push(d.chunk_to_retrieve.trim());
      byDoc.set(d.document_id, hit);
    }
    return [...byDoc.values()].sort((a, b) => b.bestScore - a.bestScore);
  }, [data]);

  const topScore = hits[0]?.bestScore ?? 1;

  // Key facts for the result cards, fetched in one query for all documents on screen.
  const cardParams = useMemo(
    () => ({ ids: sql.string(hits.length ? hits.map((h) => h.documentId).join(',') : '-') }),
    [hits],
  );
  const cards = useAnalyticsQuery('document_cards', cardParams);
  const facts = useMemo(() => new Map((cards.data ?? []).map((c) => [c.document_id, c])), [cards.data]);

  // Quick answer: a short cited answer from the top passages (text queries only).
  const [answer, setAnswer] = useState<
    { state: 'idle' } | { state: 'loading' } | { state: 'done'; text: string | null; sources: string[] }
  >({ state: 'idle' });
  const answerFor = useRef(0);

  useEffect(() => {
    if (!active || !submitted || loading || hits.length === 0) {
      setAnswer({ state: 'idle' });
      return;
    }
    const top = hits.slice(0, 5);
    const id = ++answerFor.current;
    setAnswer({ state: 'loading' });
    fetch('/api/quick-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: submitted,
        sources: top.map((h) => ({ file_name: h.fileName, text: h.passages.slice(0, 2).join('\n') })),
      }),
    })
      .then((r) => (r.ok ? r.json() : { answer: null }))
      .then((b: { answer?: string | null }) => {
        if (id === answerFor.current) setAnswer({ state: 'done', text: b.answer ?? null, sources: top.map((h) => h.fileName) });
      })
      .catch(() => {
        if (id === answerFor.current) setAnswer({ state: 'done', text: null, sources: [] });
      });
  }, [hits, submitted, loading, active]);

  const kpi = kpis.data?.[0];
  const updated = timeAgo(kpi?.last_ingested_at);
  const overdue = (dates.data ?? []).filter((d) => d.days_left < 0).length;
  const soon = (dates.data ?? []).filter((d) => d.days_left >= 0 && d.days_left <= 30).length;
  const totalDocs = (types.data ?? []).reduce((n, t) => n + Number(t.documents), 0);
  const typeTiles = (types.data ?? []).filter((t) => t.document_type !== 'other');
  const hasResults = active && Boolean(data) && !loading;
  const showHome = !active;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Hero search */}
      <section
        className={`rs-hero rounded-3xl border px-5 sm:px-10 text-center transition-all duration-500 ${
          showHome ? 'py-12 sm:py-16' : 'py-6'
        }`}
      >
        {showHome && (
          <>
            <p className="rs-fade text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {totalDocs > 0 ? `${totalDocs} documents · ${typeTiles.length} types` : 'Records'}
              {updated ? ` · updated ${updated}` : ''}
            </p>
            <h2 className="rs-fade rs-d1 mt-3 text-3xl sm:text-5xl font-bold text-foreground">
              Every document. <span className="text-primary">Found in a second.</span>
            </h2>
            <p className="rs-fade rs-d2 mt-3 text-sm sm:text-base text-muted-foreground">
              Search by meaning, number or name, across scans, photos, PDFs and Word files.
            </p>
          </>
        )}

        <form
          className={`rs-fade rs-d2 mx-auto flex items-center gap-2 rounded-full border bg-card p-1.5 pl-5 shadow-lg shadow-primary/5 focus-within:ring-4 focus-within:ring-primary/15 transition ${
            showHome ? 'mt-8 max-w-2xl' : 'max-w-3xl'
          }`}
          onSubmit={(e) => {
            e.preventDefault();
            run(query);
          }}
        >
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="How much notice to end the records agreement?"
            aria-label="Search your records"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted-foreground/70"
          />
          {(query || active) && (
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-full p-2 text-muted-foreground hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <select
            value={type}
            onChange={(e) => run(query, e.target.value)}
            aria-label="Document type"
            className="hidden sm:block max-w-40 rounded-full border-0 bg-muted px-3 py-2 text-sm text-foreground outline-none"
          >
            <option value="ALL">All types</option>
            {(types.data ?? []).map((t) => (
              <option key={t.document_type} value={t.document_type}>
                {typeLabel(t.document_type)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="hidden sm:inline">{loading ? 'Searching' : 'Search'}</span>
          </button>
        </form>

        {showHome && (
          <div className="rs-fade rs-d3 mt-5 flex flex-wrap justify-center gap-2">
            {recent.map((r) => (
              <button key={`r-${r}`} type="button" onClick={() => run(r)} className="rs-chip">
                <History className="h-3.5 w-3.5" aria-hidden="true" /> {r}
              </button>
            ))}
            {SUGGESTIONS.filter((s) => !recent.includes(s))
              .slice(0, Math.max(2, 5 - recent.length))
              .map((s) => (
                <button key={`s-${s}`} type="button" onClick={() => run(s)} className="rs-chip">
                  <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {s}
                </button>
              ))}
          </div>
        )}
      </section>

      {showHome && (
        <>
          {/* What needs attention */}
          {(overdue > 0 || soon > 0) && (
            <Link
              to="/key-dates"
              className="rs-fade rs-d3 group flex items-center gap-3 rounded-2xl border border-warning/60 bg-accent px-5 py-3.5 hover:shadow-md transition"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-warning text-warning-foreground">
                <AlarmClock className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="flex-1 text-sm text-foreground">
                {overdue > 0 && (
                  <strong className="font-semibold">
                    {overdue} item{overdue !== 1 ? 's' : ''} overdue
                  </strong>
                )}
                {overdue > 0 && soon > 0 && ' · '}
                {soon > 0 && `${soon} due in the next 30 days`}
              </span>
              <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                Key dates <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          )}

          {/* Browse by type */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Browse by type</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {types.loading &&
                Array.from({ length: 8 }, (_, i) => <Skeleton key={`t-${i}`} className="h-24 rounded-2xl" />)}
              {typeTiles.map((t, i) => {
                const Icon = typeIcon(t.document_type);
                return (
                  <button
                    key={t.document_type}
                    type="button"
                    onClick={() => run('', t.document_type)}
                    className="rs-tile rs-fade group text-left"
                    style={{ animationDelay: `${120 + i * 40}ms` }}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="mt-3 block text-sm font-semibold text-foreground">{typeLabel(t.document_type)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.documents} document{Number(t.documents) !== 1 ? 's' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}

      {active && error && (
        <Alert variant="destructive">
          <AlertDescription>Search did not work this time: {error}. Try again in a moment.</AlertDescription>
        </Alert>
      )}

      {active && loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={`sk-${i}`} className="flex gap-4 rounded-2xl border bg-card p-4">
              <Skeleton className="h-24 w-20 rounded-xl" />
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {hasResults && hits.length === 0 && (
        <div className="rounded-2xl border bg-card px-6 py-10 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-semibold text-foreground">No documents match that yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Try fewer or different words, or ask the Assistant.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.slice(0, 3).map((s) => (
              <button key={s} type="button" onClick={() => run(s, 'ALL')} className="rs-chip">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => navigate(`/assistant?${new URLSearchParams({ q: submitted })}`)}
              className="rs-chip"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Ask the Assistant
            </button>
          </div>
        </div>
      )}

      {hasResults && hits.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{hits.length}</span> document
              {hits.length !== 1 ? 's' : ''}
              {type !== 'ALL' && ` · ${typeLabel(type)}`} · {data?.queryTimeMs} ms
            </p>
          </div>

          {/* Quick answer */}
          {submitted && answer.state !== 'idle' && !(answer.state === 'done' && !answer.text) && (
            <section className="rs-answer rs-fade rounded-2xl border p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Quick answer
              </div>
              {answer.state === 'loading' ? (
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-3.5 w-11/12" />
                  <Skeleton className="h-3.5 w-3/5" />
                </div>
              ) : (
                answer.state === 'done' &&
                answer.text && (
                  <>
                    <p className="mt-2 text-[15px] leading-relaxed text-foreground">
                      {answer.text.split(/(\[\d+\])/).map((part, i) => {
                        const m = part.match(/^\[(\d+)\]$/);
                        if (!m) return <Fragment key={i}>{part}</Fragment>;
                        const n = Number(m[1]);
                        const hit = hits[n - 1];
                        return (
                          <button
                            key={i}
                            type="button"
                            title={hit?.fileName}
                            onClick={() => hit && navigate(`/documents/${hit.documentId}`)}
                            className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 align-text-top text-[11px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
                          >
                            {n}
                          </button>
                        );
                      })}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      AI-generated from the documents below. Check the original before acting on it.
                    </p>
                  </>
                )
              )}
            </section>
          )}

          {hits.map((hit, i) => {
            const f = facts.get(hit.documentId);
            const Icon = typeIcon(hit.documentType);
            const ext = hit.fileName.split('.').pop()?.toLowerCase() ?? '';
            const isImage = IMAGE_EXTENSIONS.has(ext);
            const match = Math.round((hit.bestScore / (topScore || 1)) * 100);
            const factLine = [
              f?.issuer_name,
              f?.document_number,
              f?.document_date,
              f?.total_amount != null ? formatAmount(f.total_amount, f.currency) : null,
            ].filter(Boolean);
            return (
              <article
                key={hit.documentId}
                className="rs-result rs-fade group grid grid-cols-[5rem_minmax(0,1fr)] gap-4 rounded-2xl border bg-card p-4 sm:p-5"
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/documents/${hit.documentId}`)}
                  className="relative h-28 w-20 overflow-hidden rounded-xl border bg-muted"
                  aria-label={`Open details for ${hit.fileName}`}
                >
                  {isImage ? (
                    <img
                      src={originalFileUrl(hit.path, 'raw')}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-primary">
                      {ext === 'pdf' ? <FileText className="h-7 w-7" /> : <FileImage className="h-7 w-7" />}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{ext}</span>
                    </span>
                  )}
                </button>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {typeLabel(hit.documentType)}
                    </span>
                    {f?.processing_status === 'PASSED' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified
                      </span>
                    )}
                    {f?.processing_status === 'NEEDS_REVIEW' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/30 px-2.5 py-0.5 text-xs font-semibold text-foreground">
                        Needs review
                      </span>
                    )}
                    {submitted && (
                      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="hidden sm:block h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${match}%` }} />
                        </span>
                        {match}% match
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/documents/${hit.documentId}`)}
                    className="mt-1.5 block max-w-full truncate text-left text-base font-semibold text-foreground hover:text-primary"
                  >
                    {hit.fileName}
                  </button>
                  {factLine.length > 0 ? (
                    <p className="truncate text-xs text-muted-foreground">{factLine.join(' · ')}</p>
                  ) : (
                    cards.loading && <Skeleton className="mt-1 h-3 w-1/2" />
                  )}

                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-foreground/85">
                    {submitted
                      ? highlight(bestSnippet(hit.passages[0] ?? '', submitted), submitted)
                      : f?.summary ?? bestSnippet(hit.passages[0] ?? '', '')}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => navigate(`/documents/${hit.documentId}`)} className="rs-action rs-action-primary">
                      Details
                    </button>
                    <a href={originalFileUrl(hit.path, 'raw')} target="_blank" rel="noopener noreferrer" className="rs-action">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open
                    </a>
                    <a href={originalFileUrl(hit.path, 'download')} className="rs-action">
                      <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/assistant?${new URLSearchParams({ q: `In ${hit.fileName}: ${submitted || 'summarise the key points'}` })}`,
                        )
                      }
                      className="rs-action"
                    >
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Ask about this
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          <p className="pt-2 text-center text-xs text-muted-foreground">
            Showing every matching document you have access to.
          </p>
        </div>
      )}
    </div>
  );
}

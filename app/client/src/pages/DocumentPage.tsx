import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Alert,
  AlertDescription,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Hash,
  Languages,
  MessageSquare,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  IMAGE_EXTENSIONS,
  formatAmount,
  formatFieldValue,
  isTrue,
  originalFileUrl,
  parseJson,
  typeLabel,
} from '../lib/records';
import { typeIcon } from '../lib/typeIcons';

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </div>
      <div className="mt-1 break-words text-sm font-semibold text-foreground">{value || '—'}</div>
    </div>
  );
}

/** Ring showing how many validation checks passed. */
function CheckRing({ passed, total }: { passed: number; total: number }) {
  const pct = total ? passed / total : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  const ok = passed === total;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${passed} of ${total} checks passed`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--muted)" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={ok ? 'var(--success)' : 'var(--primary)'}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 32 32)"
        className="rs-ring"
      />
      <text x="32" y="37" textAnchor="middle" className="fill-foreground text-[15px] font-bold">
        {passed}/{total}
      </text>
    </svg>
  );
}

/** One document: the original beside everything the pipeline extracted and checked. */
export function DocumentPage() {
  const navigate = useNavigate();
  const { documentId = '' } = useParams();
  const params = useMemo(() => ({ document_id: sql.string(documentId) }), [documentId]);
  const detail = useAnalyticsQuery('document_detail', params);
  const fields = useAnalyticsQuery('document_fields', params);
  const [copied, setCopied] = useState(false);
  const doc = detail.data?.[0];

  const checks = Object.entries(parseJson<Record<string, unknown>>(doc?.checks_json, {})).map(([name, v]) => ({
    name,
    passed: isTrue(v),
  }));
  const passedCount = checks.filter((c) => c.passed).length;
  const parties = parseJson<string[]>(doc?.parties_json, []);
  const ext = (doc?.file_extension ?? '').toLowerCase();
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isPdf = ext === 'pdf';
  const Icon = typeIcon(doc?.document_type);

  const fieldRows = (fields.data ?? []).map((f) => ({
    name: f.field_name.replace(/_/g, ' '),
    value: isTrue(f.is_missing) ? '' : formatFieldValue(f.field_value),
  }));
  const found = fieldRows.filter((f) => f.value);
  const missing = fieldRows.filter((f) => !f.value);

  const copyFields = () => {
    const text = found.map((f) => `${f.name}: ${f.value}`).join('\n');
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to search
      </Link>

      {detail.loading && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Skeleton className="h-[560px] rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      )}

      {detail.error && (
        <Alert variant="destructive">
          <AlertDescription>This document didn't load: {detail.error}</AlertDescription>
        </Alert>
      )}

      {!detail.loading && !detail.error && !doc && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Document not found</EmptyTitle>
            <EmptyDescription>It may have been removed, or you may not have access to it.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {doc && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Original */}
          <aside className="rs-fade lg:sticky lg:top-4 self-start">
            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Original</span>
                <span className="text-xs text-muted-foreground">
                  {ext.toUpperCase()} · {doc.page_count} page{doc.page_count !== 1 ? 's' : ''} ·{' '}
                  {(doc.file_size_bytes / 1024).toFixed(0)} KB
                </span>
              </div>
              <div className="bg-muted/40">
                {isImage && (
                  <a href={originalFileUrl(doc.path, 'raw')} target="_blank" rel="noopener noreferrer">
                    <img
                      src={originalFileUrl(doc.path, 'raw')}
                      alt={`Original of ${doc.file_name}`}
                      className="mx-auto max-h-[70vh] w-full object-contain"
                    />
                  </a>
                )}
                {isPdf && (
                  <iframe title={`Original of ${doc.file_name}`} src={originalFileUrl(doc.path, 'raw')} className="h-[70vh] w-full" />
                )}
                {!isImage && !isPdf && (
                  <div className="flex h-72 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Icon className="h-10 w-10 text-primary" aria-hidden="true" />
                    <span className="text-sm">{ext.toUpperCase()} file: open it to view</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 border-t p-3">
                <a
                  href={originalFileUrl(doc.path, 'raw')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rs-action rs-action-primary flex-1 justify-center"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open original
                </a>
                <a href={originalFileUrl(doc.path, 'download')} className="rs-action flex-1 justify-center">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download
                </a>
              </div>
            </div>
          </aside>

          {/* Details */}
          <div className="space-y-5 min-w-0">
            <header className="rs-hero rs-fade rounded-2xl border p-5">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                      {typeLabel(doc.document_type)}
                    </span>
                    {doc.processing_status === 'PASSED' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified
                      </span>
                    )}
                    {doc.processing_status === 'NEEDS_REVIEW' && (
                      <span className="rounded-full bg-warning/40 px-2.5 py-0.5 text-xs font-semibold text-foreground">
                        Needs review
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 break-all text-2xl font-bold text-foreground">{doc.file_name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Added {doc.ingested_at?.slice(0, 16).replace('T', ' ')} · {doc.chunk_count} searchable passages
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rs-action"
                  onClick={() =>
                    navigate(`/assistant?${new URLSearchParams({ q: `In ${doc.file_name}: what are the key points?` })}`)
                  }
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Ask about this document
                </button>
                <button type="button" className="rs-action" onClick={copyFields} disabled={found.length === 0}>
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy fields'}
                </button>
              </div>
            </header>

            {doc.summary && (
              <section className="rs-answer rs-fade rounded-2xl border p-5" style={{ animationDelay: '60ms' }}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Summary
                </div>
                <p className="mt-2 text-[15px] leading-relaxed text-foreground">{doc.summary}</p>
                <p className="mt-2 text-xs text-muted-foreground">AI-generated. Check the original for anything important.</p>
              </section>
            )}

            <section className="rs-fade grid grid-cols-2 gap-3 md:grid-cols-3" style={{ animationDelay: '120ms' }}>
              <Fact icon={Hash} label="Number" value={doc.document_number} />
              <Fact icon={CalendarDays} label="Date" value={doc.document_date} />
              <Fact
                icon={Wallet}
                label="Amount"
                value={doc.total_amount != null ? formatAmount(doc.total_amount, doc.currency) : null}
              />
              <Fact icon={Building2} label="Issued by" value={doc.issuer_name} />
              <Fact icon={UserRound} label="Issued to" value={doc.recipient_name} />
              <Fact icon={Languages} label="Language" value={doc.language} />
              {parties.length > 0 && (
                <div className="col-span-2 md:col-span-3">
                  <Fact icon={Users} label="Parties" value={parties.join(' · ')} />
                </div>
              )}
            </section>

            {/* Validation */}
            <section className="rs-fade rounded-2xl border bg-card p-5" style={{ animationDelay: '180ms' }}>
              <div className="flex items-center gap-4">
                {checks.length > 0 && <CheckRing passed={passedCount} total={checks.length} />}
                <div>
                  <h3 className="text-base font-semibold text-foreground">Validation checks</h3>
                  <p className="text-sm text-muted-foreground">
                    {checks.length === 0
                      ? 'No business rules are defined for this document type.'
                      : passedCount === checks.length
                        ? `Every ${typeLabel(doc.document_type).toLowerCase()} rule passed.`
                        : `${checks.length - passedCount} rule${checks.length - passedCount !== 1 ? 's' : ''} need attention.`}
                  </p>
                </div>
              </div>
              {checks.length > 0 && (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {checks.map((c) => (
                    <li
                      key={c.name}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                        c.passed ? 'bg-success/10 text-foreground' : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {c.passed ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                      <span className="first-letter:uppercase">{c.name.replace(/_/g, ' ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Extracted fields */}
            <section className="rs-fade rounded-2xl border bg-card p-5" style={{ animationDelay: '240ms' }}>
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-base font-semibold text-foreground">Extracted fields</h3>
                {fields.data && (
                  <span className="text-xs text-muted-foreground">
                    {found.length} found{missing.length ? ` · ${missing.length} not on the document` : ''}
                  </span>
                )}
              </div>
              {fields.loading && <Skeleton className="mt-3 h-40 w-full" />}
              {fields.error && <p className="mt-3 text-sm text-destructive">Fields didn't load: {fields.error}</p>}
              {found.length > 0 && (
                <dl className="mt-3 divide-y">
                  {found.map((f) => (
                    <div key={f.name} className="grid gap-1 py-2.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground first-letter:uppercase sm:pt-0.5">
                        {f.name}
                      </dt>
                      <dd className="whitespace-pre-wrap break-words text-sm text-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {missing.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="text-xs text-muted-foreground">Not on the document:</span>
                  {missing.map((f) => (
                    <span key={f.name} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {f.name}
                    </span>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

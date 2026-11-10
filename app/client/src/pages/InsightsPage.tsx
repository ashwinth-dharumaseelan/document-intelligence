import { useMemo } from 'react';
import {
  Alert,
  AlertDescription,
  BarChart,
  DonutChart,
  GenieChat,
  Skeleton,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import {
  Check,
  FileCheck2,
  FileSearch,
  FileType2,
  ListChecks,
  ScanText,
  ShieldCheck,
  Tags,
  Target,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { typeLabel, useWhoAmI } from '../lib/records';

/** Gauge ring: value against a best-practice target. */
function Gauge({ value, target }: { value: number; target?: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const meets = target === undefined || value >= target;
  const tAngle = target !== undefined ? (target / 100) * 360 - 90 : 0;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--muted)" strokeWidth="8" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke={meets ? 'var(--success)' : 'var(--primary)'}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 38 38)"
        className="rs-ring"
      />
      {target !== undefined && (
        <line
          x1="38"
          y1="4"
          x2="38"
          y2="14"
          stroke="var(--foreground)"
          strokeWidth="2.5"
          strokeLinecap="round"
          transform={`rotate(${tAngle + 90} 38 38)`}
        />
      )}
    </svg>
  );
}

interface Kpi {
  label: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  gauge?: { value: number; target?: number };
  target?: string;
  meets?: boolean;
  note: string;
}

const STAGES: Record<string, { label: string; icon: LucideIcon }> = {
  supported_format: { label: 'Received', icon: FileType2 },
  parsed_successfully: { label: 'Read (OCR)', icon: ScanText },
  classified: { label: 'Classified', icon: Tags },
  fields_extracted: { label: 'Extracted', icon: FileCheck2 },
  chunked_for_search: { label: 'Searchable', icon: FileSearch },
};

/** Executive view: programme KPIs against best practice, document mix, accuracy, pipeline health and Genie. */
export function InsightsPage() {
  const kpis = useAnalyticsQuery('kpi_overview', {});
  const types = useAnalyticsQuery('document_types', {});
  const quality = useAnalyticsQuery('quality_overview', {});
  const me = useWhoAmI();
  const k = kpis.data?.[0];

  const typeData = useMemo(
    () => (types.data ?? []).map((t) => ({ type: typeLabel(t.document_type), documents: Number(t.documents) })),
    [types.data],
  );
  const stages = (quality.data ?? []).filter((q) => q.kind === 'stage');
  const rules = (quality.data ?? []).find((q) => q.kind === 'rules');

  const cards: Kpi[] = k
    ? [
        {
          label: 'Documents digitised',
          value: `${k.digitised_pct ?? 0}`,
          unit: '%',
          icon: FileCheck2,
          gauge: { value: k.digitised_pct ?? 0, target: 75 },
          target: 'Best practice 75%',
          meets: (k.digitised_pct ?? 0) >= 75,
          note: `${k.documents_digitised} of ${k.files_received} files`,
        },
        {
          label: 'Record accuracy',
          value: `${k.record_accuracy_pct ?? '—'}`,
          unit: '%',
          icon: Target,
          gauge: { value: k.record_accuracy_pct ?? 0, target: 98 },
          target: 'Best practice 98%',
          meets: (k.record_accuracy_pct ?? 0) >= 98,
          note: `${k.record_accuracy_incl_partial_pct ?? '—'}% incl. partial · ${k.accuracy_sample_size} docs checked`,
        },
        {
          label: 'Business rules passed',
          value: rules ? `${rules.pass_rate_pct}` : '—',
          unit: rules ? '%' : undefined,
          icon: ShieldCheck,
          gauge: rules ? { value: rules.pass_rate_pct } : undefined,
          note: rules ? `${rules.passed_rows} of ${rules.total_rows} checks` : 'Loading checks…',
        },
        {
          label: 'Needs review',
          value: `${k.needs_review}`,
          unit: k.needs_review === 1 ? 'doc' : 'docs',
          icon: TriangleAlert,
          note: `${k.searchable_chunks} passages searchable`,
        },
      ]
    : [];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <section className="rs-hero rs-fade rounded-3xl border px-6 py-7 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Programme insights</p>
        <h2 className="mt-2 text-3xl font-bold text-foreground">Data cleansing and document digitisation</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Legal and Operations · Records domain
          {k?.last_ingested_at && <> · data as of {k.last_ingested_at.slice(0, 16).replace('T', ' ')} UTC</>}
        </p>
      </section>

      {kpis.error && (
        <Alert variant="destructive">
          <AlertDescription>KPIs didn't load: {kpis.error}</AlertDescription>
        </Alert>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.loading
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={`k-${i}`} className="h-40 rounded-2xl" />)
          : cards.map((c, i) => (
              <div
                key={c.label}
                className="rs-tile rs-fade flex flex-col"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <c.icon className="h-3.5 w-3.5" aria-hidden="true" /> {c.label}
                    </div>
                    <div className="mt-2 text-4xl font-bold tabular-nums text-foreground">
                      {c.value}
                      {c.unit && <span className="ml-1 text-base font-medium text-muted-foreground">{c.unit}</span>}
                    </div>
                  </div>
                  {c.gauge && <Gauge value={c.gauge.value} target={c.gauge.target} />}
                </div>
                <div className="mt-auto pt-3 space-y-1">
                  {c.target && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        c.meets ? 'bg-success/15 text-success' : 'bg-warning/40 text-foreground'
                      }`}
                    >
                      {c.meets && <Check className="h-3 w-3" aria-hidden="true" />}
                      {c.target} · {c.meets ? 'met' : 'not yet'}
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground">{c.note}</p>
                </div>
              </div>
            ))}
      </div>

      {/* Pipeline health */}
      <section className="rs-fade rounded-2xl border bg-card p-5" style={{ animationDelay: '200ms' }}>
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-base font-semibold text-foreground">Pipeline health</h3>
          <span className="text-xs text-muted-foreground">Every file through every stage</span>
        </div>
        {quality.loading && <Skeleton className="mt-4 h-20 w-full" />}
        {stages.length > 0 && (
          <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stages.map((s, i) => {
              const meta = STAGES[s.check_name] ?? { label: s.check_name, icon: ListChecks };
              const ok = s.pass_rate_pct >= 100;
              return (
                <li key={s.check_name} className="relative flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      ok ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'
                    }`}
                  >
                    <meta.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-xs text-muted-foreground">
                      {i + 1}. {meta.label}
                    </span>
                    <span className="block text-sm font-semibold tabular-nums text-foreground">
                      {s.passed_rows}/{s.total_rows} · {s.pass_rate_pct}%
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rs-fade min-w-0 rounded-2xl border bg-card p-5" style={{ animationDelay: '260ms' }}>
          <h3 className="text-base font-semibold text-foreground">What's in the records</h3>
          <p className="text-xs text-muted-foreground">Documents by type</p>
          {types.loading ? (
            <Skeleton className="mt-4 h-[300px] w-full" />
          ) : (
            <DonutChart data={typeData} xKey="type" yKey="documents" innerRadius={55} height={320} colorPalette="categorical" />
          )}
        </section>
        <section className="rs-fade min-w-0 rounded-2xl border bg-card p-5" style={{ animationDelay: '320ms' }}>
          <h3 className="text-base font-semibold text-foreground">Extraction accuracy by type</h3>
          <p className="text-xs text-muted-foreground">Answer-key fields matched exactly, and including partial matches (%)</p>
          <BarChart
            queryKey="accuracy_by_type"
            parameters={{}}
            xKey="document_type"
            yKey={['exact_pct', 'incl_partial_pct']}
            colorPalette="categorical"
            height={320}
          />
        </section>
      </div>

      <section className="rs-fade rounded-2xl border bg-card p-5" style={{ animationDelay: '380ms' }}>
        <h3 className="text-base font-semibold text-foreground">Ask the data</h3>
        <p className="text-sm text-muted-foreground">
          Counts, totals, vendors, expiries and review status, answered by the Records Genie space. Each answer shows
          the SQL it ran{me?.email ? ` and runs as ${me.email}` : ''}, with your own permissions.
        </p>
        <div className="mt-4 h-[560px]">
          <GenieChat alias="records" placeholder="Which trade licences expire in the next 12 months?" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">AI-generated. Review the SQL before relying on a result.</p>
      </section>
    </div>
  );
}

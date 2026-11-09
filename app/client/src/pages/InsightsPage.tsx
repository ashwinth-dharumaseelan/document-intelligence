import {
  Alert,
  AlertDescription,
  BarChart,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  GenieChat,
  Skeleton,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { useWhoAmI } from '../lib/records';

interface Kpi {
  label: string;
  value: string;
  unit?: string;
  /** Best-practice benchmark from the use case (Records digitisation programme). */
  target?: { value: number; text: string };
  actual?: number;
  note: string;
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const meets = kpi.target && kpi.actual !== undefined ? kpi.actual >= kpi.target.value : undefined;
  return (
    <Card className="f1-edge-yellow">
      <CardHeader className="pb-1">
        <CardDescription>{kpi.label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {kpi.value}
          {kpi.unit && <span className="text-base font-normal text-muted-foreground ml-1">{kpi.unit}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {kpi.target && (
          <p className={`text-xs ${meets ? 'text-success' : 'text-warning'}`}>
            Best practice {kpi.target.text} · {meets ? 'meets' : 'below'}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{kpi.note}</p>
      </CardContent>
    </Card>
  );
}

/** Programme KPIs from the use case, document mix, accuracy by type, and ad-hoc questions via Genie. */
export function InsightsPage() {
  const kpis = useAnalyticsQuery('kpi_overview', {});
  const me = useWhoAmI();
  const k = kpis.data?.[0];

  const cards: Kpi[] = k
    ? [
        {
          label: 'Documents digitised',
          value: `${k.digitised_pct ?? 0}`,
          unit: '%',
          actual: k.digitised_pct ?? 0,
          target: { value: 75, text: '75%' },
          note: `${k.documents_digitised} of ${k.files_received} files received`,
        },
        {
          label: 'Record accuracy (exact)',
          value: `${k.record_accuracy_pct ?? '—'}`,
          unit: '%',
          actual: k.record_accuracy_pct ?? 0,
          target: { value: 98, text: '98%' },
          note: `${k.record_accuracy_incl_partial_pct ?? '—'}% incl. partial matches · answer key of ${k.accuracy_sample_size} documents`,
        },
        {
          label: 'Needs review',
          value: `${k.needs_review}`,
          unit: 'docs',
          note: `${k.not_processed} not processed (unsupported or failed)`,
        },
        {
          label: 'Searchable passages',
          value: `${k.searchable_chunks}`,
          note: 'Indexed for search and the Assistant',
        },
      ]
    : [];

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div>
        <h2 className="f1-title text-3xl font-bold text-foreground">Programme insights</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Data cleansing & document digitisation — Legal / Operations, Records domain.
          {k?.last_ingested_at && <> Data as of last ingestion {k.last_ingested_at.slice(0, 16).replace('T', ' ')} UTC.</>}
        </p>
      </div>

      {kpis.error && (
        <Alert variant="destructive">
          <AlertDescription>Could not load KPIs: {kpis.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.loading
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={`k-${i}`} className="h-32 w-full" />)
          : cards.map((c) => <KpiCard key={c.label} kpi={c} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Invoices dominate the digitised records</CardTitle>
            <CardDescription>Documents by type</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              queryKey="document_types"
              parameters={{}}
              xKey="document_type"
              yKey="documents"
              orientation="horizontal"
              colorPalette="categorical"
              height={300}
            />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Extraction accuracy by document type</CardTitle>
            <CardDescription>% of answer-key fields matched exactly vs incl. partial matches</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              queryKey="accuracy_by_type"
              parameters={{}}
              xKey="document_type"
              yKey={['exact_pct', 'incl_partial_pct']}
              colorPalette="categorical"
              height={300}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ask the data</CardTitle>
          <CardDescription>
            Questions about counts, totals, vendors, expiries and review status, answered by the Records Genie space.
            Each answer shows the SQL Genie ran. Runs as {me?.email ?? 'you'} with your own permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[560px]">
            <GenieChat alias="records" placeholder="e.g. Which trade licences expire in the next 12 months?" />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            AI-generated from your data via Genie — review the generated SQL before relying on a result.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

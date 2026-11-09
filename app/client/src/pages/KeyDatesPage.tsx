import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { AlertTriangle, CalendarClock, Gavel, ShieldCheck } from 'lucide-react';
import { typeLabel } from '../lib/records';

const BUCKETS = ['Overdue', 'Within 30 days', 'Within 90 days', 'Within 12 months', 'Later'] as const;
const TEAMS = ['All', 'Legal', 'Compliance', 'HR', 'Admin'] as const;

/** Semantic token classes per urgency: overdue = destructive, soon = warning, later = muted. */
function urgencyClass(urgency: string): string {
  if (urgency === 'Overdue') return 'bg-destructive text-destructive-foreground';
  if (urgency === 'Within 30 days' || urgency === 'Within 90 days') return 'bg-warning text-warning-foreground';
  return 'bg-muted text-muted-foreground';
}

function daysText(days: number): string {
  const d = Number(days);
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'today';
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Every date someone must act on: expiries, renewal-notice deadlines, hearings and deadlines. */
export function KeyDatesPage() {
  const navigate = useNavigate();
  const [team, setTeam] = useState<(typeof TEAMS)[number]>('All');
  const { data, loading, error } = useAnalyticsQuery('key_dates', {});

  const rows = useMemo(() => (data ?? []).filter((r) => team === 'All' || r.team === team), [data, team]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.urgency] = (c[r.urgency] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      <div>
        <h2 className="f1-title text-3xl font-bold text-foreground">Key dates</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Expiries, renewal-notice deadlines, hearings and deadlines found in the records. A weekly email lists anything
          due within 90 days.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Overdue', icon: AlertTriangle, n: counts['Overdue'] ?? 0, edge: 'f1-edge' },
          { label: 'Within 30 days', icon: CalendarClock, n: counts['Within 30 days'] ?? 0, edge: 'f1-edge-yellow' },
          { label: 'Within 90 days', icon: Gavel, n: counts['Within 90 days'] ?? 0, edge: 'f1-edge-yellow' },
          { label: 'Within 12 months', icon: ShieldCheck, n: counts['Within 12 months'] ?? 0, edge: '' },
        ].map((k) => (
          <Card key={k.label} className={k.edge}>
            <CardContent className="pt-4 flex items-center gap-3">
              <k.icon className="h-6 w-6 text-primary shrink-0" />
              <div>
                <div className="text-2xl font-bold tabular-nums font-display">{loading ? '…' : k.n}</div>
                <div className="text-xs text-muted-foreground">{k.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by team">
        {TEAMS.map((t) => (
          <Button key={t} size="sm" variant={team === t ? 'default' : 'outline'} onClick={() => setTeam(t)}>
            {t}
          </Button>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Could not load key dates: {error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={`sk-${i}`} className="h-16 w-full" />
          ))}
        </div>
      )}

      {data && rows.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No key dates</EmptyTitle>
            <EmptyDescription>Nothing is due for this team.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {BUCKETS.map((bucket) => {
        const items = rows.filter((r) => r.urgency === bucket);
        if (!items.length) return null;
        return (
          <section key={bucket} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{bucket}</h3>
            {items.map((r) => (
              <Card
                key={`${r.document_id}-${r.date_type}`}
                className={`cursor-pointer hover:shadow-md transition-shadow ${bucket === 'Overdue' ? 'f1-edge' : bucket.startsWith('Within 3') || bucket.startsWith('Within 9') ? 'f1-edge-yellow' : ''}`}
                onClick={() => navigate(`/documents/${r.document_id}`)}
              >
                <CardContent className="py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="w-28 shrink-0">
                    <div className="font-semibold tabular-nums">{formatDate(r.key_date)}</div>
                    <div className="text-xs text-muted-foreground">{daysText(r.days_left)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.date_type}</div>
                    <div className="text-sm text-muted-foreground truncate" title={r.subject}>
                      {r.subject} · {r.file_name}
                    </div>
                  </div>
                  <Badge variant="outline">{typeLabel(r.document_type)}</Badge>
                  <Badge variant="secondary">{r.team}</Badge>
                  <Badge className={urgencyClass(r.urgency)}>{r.urgency}</Badge>
                </CardContent>
              </Card>
            ))}
          </section>
        );
      })}
    </div>
  );
}

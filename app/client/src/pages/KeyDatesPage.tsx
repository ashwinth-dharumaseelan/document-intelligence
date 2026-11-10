import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
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
import { AlarmClock, CalendarCheck, CalendarClock, CalendarRange, ChevronRight, Hourglass } from 'lucide-react';
import { typeLabel } from '../lib/records';
import { typeIcon } from '../lib/typeIcons';

const BUCKETS = ['Overdue', 'Within 30 days', 'Within 90 days', 'Within 12 months', 'Later'] as const;
type Bucket = (typeof BUCKETS)[number];
const TEAMS = ['All', 'Legal', 'Compliance', 'HR', 'Admin'] as const;

/** Colour per urgency: overdue = red, soon = amber, later = calm. */
const TONE: Record<Bucket, { dot: string; pill: string; tile: string; icon: typeof AlarmClock }> = {
  Overdue: { dot: 'bg-destructive', pill: 'bg-destructive text-destructive-foreground', tile: 'border-destructive/40', icon: AlarmClock },
  'Within 30 days': { dot: 'bg-warning', pill: 'bg-warning text-warning-foreground', tile: 'border-warning/70', icon: CalendarClock },
  'Within 90 days': { dot: 'bg-warning/60', pill: 'bg-warning/40 text-foreground', tile: 'border-warning/40', icon: Hourglass },
  'Within 12 months': { dot: 'bg-success', pill: 'bg-success/15 text-success', tile: 'border-success/30', icon: CalendarRange },
  Later: { dot: 'bg-muted-foreground/40', pill: 'bg-muted text-muted-foreground', tile: '', icon: CalendarCheck },
};

function countdown(days: number): string {
  const d = Number(days);
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  return `${d} day${d === 1 ? '' : 's'} left`;
}

function dateParts(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { day: '?', month: iso, year: '' };
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString(undefined, { month: 'short' }),
    year: String(d.getFullYear()),
  };
}

/** Every date someone must act on, as a timeline from overdue to later. */
export function KeyDatesPage() {
  const navigate = useNavigate();
  const [team, setTeam] = useState<(typeof TEAMS)[number]>('All');
  const [bucket, setBucket] = useState<Bucket | 'All'>('All');
  const { data, loading, error } = useAnalyticsQuery('key_dates', {});

  const byTeam = useMemo(() => (data ?? []).filter((r) => team === 'All' || r.team === team), [data, team]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of byTeam) c[r.urgency] = (c[r.urgency] ?? 0) + 1;
    return c;
  }, [byTeam]);
  const rows = byTeam.filter((r) => bucket === 'All' || r.urgency === bucket);
  const next = byTeam.find((r) => r.days_left >= 0);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <section className="rs-hero rs-fade rounded-3xl border px-6 py-7 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Key dates</p>
        <h2 className="mt-2 text-3xl font-bold text-foreground">
          {loading ? 'Checking your dates…' : counts['Overdue'] ? (
            <>
              <span className="text-primary">{counts['Overdue']} overdue</span>
              {counts['Within 30 days'] ? `, ${counts['Within 30 days']} due this month` : ''}
            </>
          ) : counts['Within 30 days'] ? (
            `${counts['Within 30 days']} due in the next 30 days`
          ) : (
            'Nothing urgent. You are on track'
          )}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Expiries, renewal-notice deadlines, hearings and deadlines found in your records.
          {next && (
            <>
              {' '}
              Next up: <span className="font-medium text-foreground">{next.date_type}</span> ·{' '}
              {countdown(next.days_left).toLowerCase()}.
            </>
          )}{' '}
          A weekly email lists everything due within 90 days.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(['Overdue', 'Within 30 days', 'Within 90 days', 'Within 12 months'] as const).map((b) => {
            const tone = TONE[b];
            const active = bucket === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => setBucket(active ? 'All' : b)}
                aria-pressed={active}
                className={`rs-tile text-left ${tone.tile} ${active ? 'ring-2 ring-primary' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <tone.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                </div>
                <div className="mt-2 text-3xl font-bold tabular-nums text-foreground">{loading ? '–' : counts[b] ?? 0}</div>
                <div className="text-xs text-muted-foreground">{b}</div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by team">
        {TEAMS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTeam(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              team === t ? 'bg-primary text-primary-foreground shadow-sm' : 'border bg-card text-foreground hover:bg-muted'
            }`}
          >
            {t}
          </button>
        ))}
        {bucket !== 'All' && (
          <button type="button" onClick={() => setBucket('All')} className="ml-auto text-sm text-primary hover:underline">
            Show all dates
          </button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Key dates didn't load: {error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={`sk-${i}`} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {data && rows.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing due here</EmptyTitle>
            <EmptyDescription>No dates for this team and period. Try another filter.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Timeline */}
      <div className="space-y-8">
        {BUCKETS.map((b) => {
          const items = rows.filter((r) => r.urgency === b);
          if (!items.length) return null;
          const tone = TONE[b];
          return (
            <section key={b} className="rs-fade">
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${tone.dot}`} />
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{b}</h3>
                <span className="text-xs text-muted-foreground">· {items.length}</span>
              </div>
              <ol className="relative ml-[1.45rem] space-y-3 border-l-2 border-dashed border-border pl-6">
                {items.map((r, i) => {
                  const Icon = typeIcon(r.document_type);
                  const p = dateParts(r.key_date);
                  return (
                    <li
                      key={`${r.document_id}-${r.date_type}-${r.key_date}`}
                      className="rs-fade relative"
                      style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                    >
                      <span
                        className={`absolute -left-[2.15rem] top-6 h-3.5 w-3.5 rounded-full border-2 border-background ${tone.dot}`}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => navigate(`/documents/${r.document_id}`)}
                        className="rs-result group flex w-full items-center gap-4 rounded-2xl border bg-card p-3.5 text-left"
                      >
                        <span className="flex w-14 shrink-0 flex-col items-center rounded-xl border bg-background py-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">{p.month}</span>
                          <span className="text-xl font-bold leading-none tabular-nums text-foreground">{p.day}</span>
                          <span className="text-[10px] text-muted-foreground">{p.year}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">{r.date_type}</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone.pill}`}>
                              {countdown(r.days_left)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-muted-foreground" title={r.subject}>
                            {r.subject}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                              <Icon className="h-3 w-3" aria-hidden="true" /> {typeLabel(r.document_type)}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5">{r.team}</span>
                            <span className="truncate">{r.file_name}</span>
                          </span>
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}

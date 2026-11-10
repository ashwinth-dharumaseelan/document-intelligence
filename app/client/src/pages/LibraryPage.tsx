import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert, AlertDescription, Skeleton, useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  CloudUpload,
  FileText,
  LayoutGrid,
  List,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { IMAGE_EXTENSIONS, formatAmount, originalFileUrl, typeLabel, uploadUrl } from '../lib/records';
import { typeIcon } from '../lib/typeIcons';

type View = 'grid' | 'list';
type SortKey = 'file_name' | 'document_type' | 'issuer_name' | 'document_date' | 'total_amount';

const VIEW_KEY = 'records.libraryView';
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,.ppt,.pptx,.txt,.csv,.html,.eml';

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

/** Every verified document, as a visual grid or a sortable list, with drag-and-drop upload. */
export function LibraryPage() {
  const navigate = useNavigate();
  const [type, setType] = useState('ALL');
  const [text, setText] = useState('');
  const [applied, setApplied] = useState('');
  const [view, setView] = useState<View>(loadView);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'document_date', dir: -1 });
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const params = useMemo(() => ({ document_type: sql.string(type), text: sql.string(applied) }), [type, applied]);
  const list = useAnalyticsQuery('document_list', params);
  const types = useAnalyticsQuery('document_types', {});

  const rows = useMemo(() => {
    const data = [...(list.data ?? [])];
    data.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * sort.dir;
    });
    return data;
  }, [list.data, sort]);

  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not remembered in private windows */
    }
  };

  const upload = async (files: FileList | File[]) => {
    const all = Array.from(files);
    if (all.length === 0) return;
    setUploadMessage(null);
    let done = 0;
    try {
      for (const file of all) {
        setUploading(file.name);
        const res = await fetch(uploadUrl(file.name), { method: 'POST', body: file });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(`${file.name}: ${body.error ?? `upload failed (${res.status})`}`);
        }
        done += 1;
      }
      setUploadMessage({
        ok: true,
        text: `${done === 1 ? all[0].name : `${done} files`} uploaded. Digitised automatically and listed here in a few minutes.`,
      });
    } catch (err) {
      setUploadMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'document_date' ? -1 : 1 }));

  const sortHead = (k: SortKey, label: string, right = false) => (
    <th key={k} className={`px-4 py-3 font-semibold ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <div
      className="w-full max-w-7xl mx-auto space-y-5"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <section className="rs-hero rs-fade rounded-3xl border px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Document library</p>
            <h2 className="mt-2 text-3xl font-bold text-foreground">
              {list.data ? `${list.data.length} verified document${list.data.length !== 1 ? 's' : ''}` : 'Your verified documents'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Every document here passed all its checks. Open one for details and the original.</p>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-full border bg-card p-1" role="group" aria-label="View">
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => chooseView(v)}
                aria-pressed={view === v}
                aria-label={v === 'grid' ? 'Grid view' : 'List view'}
                className={`rounded-full p-2 transition ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {v === 'grid' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>

        <form
          className="mt-5 flex items-center gap-2 rounded-full border bg-card p-1.5 pl-4 focus-within:ring-4 focus-within:ring-primary/15"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(text.trim());
          }}
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Filter by file name, issuer, recipient or number"
            aria-label="Filter documents"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          {applied && (
            <button
              type="button"
              onClick={() => {
                setText('');
                setApplied('');
              }}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Clear filter"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Filter
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Document type">
          {[{ document_type: 'ALL', documents: 0 }, ...(types.data ?? [])].map((t) => {
            const active = type === t.document_type;
            const Icon = t.document_type === 'ALL' ? FileText : typeIcon(t.document_type);
            return (
              <button
                key={t.document_type}
                type="button"
                onClick={() => setType(t.document_type)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active ? 'bg-primary text-primary-foreground shadow-sm' : 'border bg-card text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {t.document_type === 'ALL' ? 'All types' : typeLabel(t.document_type)}
              </button>
            );
          })}
        </div>
      </section>

      {/* Upload */}
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={Boolean(uploading)}
        className={`rs-fade flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-5 py-5 text-sm transition ${
          dragging ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
        }`}
      >
        {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <CloudUpload className="h-5 w-5 text-primary" />}
        {uploading ? (
          <span>Uploading {uploading}…</span>
        ) : (
          <span>
            <span className="font-semibold text-foreground">Drop files here</span> or click to add documents: PDF, scans, photos,
            Word, PowerPoint or email
          </span>
        )}
      </button>
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        accept={ACCEPT}
        onChange={(e) => e.target.files && void upload(e.target.files)}
      />

      {uploadMessage && (
        <Alert variant={uploadMessage.ok ? 'default' : 'destructive'}>
          <AlertDescription>{uploadMessage.text}</AlertDescription>
        </Alert>
      )}

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription>Documents didn't load: {list.error}</AlertDescription>
        </Alert>
      )}

      {list.loading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={`sk-${i}`} className="h-64 rounded-2xl" />
          ))}
        </div>
      )}

      {list.data && rows.length === 0 && (
        <div className="rounded-2xl border bg-card px-6 py-10 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-semibold text-foreground">No documents match</p>
          <p className="mt-1 text-sm text-muted-foreground">Clear the filters or try another name.</p>
        </div>
      )}

      {/* Grid */}
      {!list.loading && rows.length > 0 && view === 'grid' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((d, i) => {
            const Icon = typeIcon(d.document_type);
            const ext = (d.file_extension ?? '').toLowerCase();
            return (
              <button
                key={d.document_id}
                type="button"
                onClick={() => navigate(`/documents/${d.document_id}`)}
                className="rs-result rs-fade group flex flex-col overflow-hidden rounded-2xl border bg-card text-left"
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              >
                <div className="relative h-36 overflow-hidden bg-muted">
                  {IMAGE_EXTENSIONS.has(ext) && d.path ? (
                    <img
                      src={originalFileUrl(d.path, 'raw')}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5">
                      <Icon className="h-9 w-9 text-primary/80" aria-hidden="true" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{ext}</span>
                    </div>
                  )}
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-card/95 px-2 py-0.5 text-[11px] font-semibold text-primary shadow-sm">
                    <Icon className="h-3 w-3" aria-hidden="true" /> {typeLabel(d.document_type)}
                  </span>
                  <span className="absolute right-2 top-2 rounded-full bg-success p-1 text-success-foreground shadow-sm" title="Verified">
                    <BadgeCheck className="h-3 w-3" aria-label="Verified" />
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary" title={d.file_name}>
                    {d.file_name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{d.issuer_name ?? 'Issuer not stated'}</span>
                  <span className="mt-auto flex items-center justify-between pt-2 text-xs">
                    <span className="text-muted-foreground">{d.document_date ?? '—'}</span>
                    {d.total_amount != null && (
                      <span className="font-semibold tabular-nums text-foreground">{formatAmount(d.total_amount, d.currency)}</span>
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      {!list.loading && rows.length > 0 && view === 'list' && (
        <div className="rs-fade overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                {sortHead('file_name', 'Document')}
                {sortHead('document_type', 'Type')}
                {sortHead('issuer_name', 'Issued by')}
                <th className="px-4 py-3 text-left font-semibold">Number</th>
                {sortHead('document_date', 'Date')}
                {sortHead('total_amount', 'Amount', true)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((d) => {
                const Icon = typeIcon(d.document_type);
                return (
                  <tr
                    key={d.document_id}
                    onClick={() => navigate(`/documents/${d.document_id}`)}
                    className="cursor-pointer transition-colors hover:bg-primary/5"
                  >
                    <td className="max-w-64 truncate px-4 py-3 font-medium text-foreground" title={d.file_name}>
                      {d.file_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        <Icon className="h-3 w-3" aria-hidden="true" /> {typeLabel(d.document_type)}
                      </span>
                    </td>
                    <td className="max-w-56 truncate px-4 py-3 text-muted-foreground" title={d.issuer_name ?? ''}>
                      {d.issuer_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{d.document_number ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{d.document_date ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                      {formatAmount(d.total_amount, d.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {list.data && list.data.length === 500 && (
        <p className="text-xs text-muted-foreground">Showing the first 500 documents. Narrow the filters to see others.</p>
      )}
    </div>
  );
}

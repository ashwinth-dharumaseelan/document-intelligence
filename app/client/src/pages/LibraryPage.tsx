import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  AlertDescription,

  Button,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { Loader2, Upload } from 'lucide-react';
import { formatAmount, typeLabel, uploadUrl } from '../lib/records';

/** Browse every digitised document with filters, and add new documents for digitisation. */
export function LibraryPage() {
  const navigate = useNavigate();
  const [type, setType] = useState('ALL');
  const [text, setText] = useState('');
  const [applied, setApplied] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const params = useMemo(
    () => ({ document_type: sql.string(type), text: sql.string(applied) }),
    [type, applied],
  );
  const list = useAnalyticsQuery('document_list', params);
  const types = useAnalyticsQuery('document_types', {});

  const upload = async (file: File) => {
    setUploading(true);
    setUploadMessage(null);
    try {
      const res = await fetch(uploadUrl(file.name), { method: 'POST', body: file });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      setUploadMessage({
        ok: true,
        text: `${file.name} uploaded. It is digitised automatically and appears here within a few minutes.`,
      });
    } catch (err) {
      setUploadMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="f1-title text-3xl font-bold text-foreground">Document library</h2>
          <p className="text-sm text-muted-foreground mt-1">Documents that passed every check. Click a row for details and the original file.</p>
        </div>
        <div className="ml-auto">
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,.ppt,.pptx,.txt,.csv,.html,.eml"
            onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
          />
          <Button variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {uploading ? 'Uploading…' : 'Add document'}
          </Button>
        </div>
      </div>

      {uploadMessage && (
        <Alert variant={uploadMessage.ok ? 'default' : 'destructive'}>
          <AlertDescription>{uploadMessage.text}</AlertDescription>
        </Alert>
      )}

      <form
        className="flex flex-col md:flex-row gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(text.trim());
        }}
      >
        <Input
          placeholder="File name, issuer, recipient or document number"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1"
          aria-label="Filter text"
        />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="md:w-52" aria-label="Document type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {(types.data ?? []).map((t) => (
              <SelectItem key={t.document_type} value={t.document_type}>
                {typeLabel(t.document_type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit">Filter</Button>
      </form>

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription>Could not load documents: {list.error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {list.loading && (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={`sk-${i}`} className="h-6 w-full" />
              ))}
            </div>
          )}
          {list.data && list.data.length === 0 && (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyTitle>No documents match</EmptyTitle>
                <EmptyDescription>Clear the filters or try another name.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {list.data && list.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Issued by</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                                  </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((d) => (
                  <TableRow
                    key={d.document_id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/documents/${d.document_id}`)}
                  >
                    <TableCell className="font-medium max-w-64 truncate" title={d.file_name}>
                      {d.file_name}
                    </TableCell>
                    <TableCell>{typeLabel(d.document_type)}</TableCell>
                    <TableCell className="max-w-56 truncate" title={d.issuer_name ?? ''}>
                      {d.issuer_name ?? '—'}
                    </TableCell>
                    <TableCell>{d.document_number ?? '—'}</TableCell>
                    <TableCell>{d.document_date ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(d.total_amount, d.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {list.data && list.data.length === 500 && (
        <p className="text-xs text-muted-foreground">Showing the first 500 documents — narrow the filters to see others.</p>
      )}
    </div>
  );
}

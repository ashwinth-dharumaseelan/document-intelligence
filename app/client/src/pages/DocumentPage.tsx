import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
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
import { ArrowLeft, CheckCircle2, Download, ExternalLink, XCircle } from 'lucide-react';
import {
  IMAGE_EXTENSIONS,
  formatAmount,
  originalFileUrl,
  formatFieldValue,
  isTrue,
  parseJson,
  statusClass,
  statusLabel,
  typeLabel,
} from '../lib/records';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words">{value ?? '—'}</dd>
    </div>
  );
}

/** One document: what the pipeline extracted, how it validated, and the original file. */
export function DocumentPage() {
  const { documentId = '' } = useParams();
  const params = useMemo(() => ({ document_id: sql.string(documentId) }), [documentId]);
  const detail = useAnalyticsQuery('document_detail', params);
  const fields = useAnalyticsQuery('document_fields', params);
  const doc = detail.data?.[0];

  const checks = parseJson<Record<string, boolean>>(doc?.checks_json, {});
  const parties = parseJson<string[]>(doc?.parties_json, []);
  const isImage = doc ? IMAGE_EXTENSIONS.has((doc.file_extension ?? '').toLowerCase()) : false;

  return (
    <div className="space-y-6 w-full max-w-6xl mx-auto">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to search
        </Link>
      </Button>

      {detail.loading && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {detail.error && (
        <Alert variant="destructive">
          <AlertDescription>Could not load this document: {detail.error}</AlertDescription>
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
        <>
          <div className="flex flex-wrap items-start gap-3">
            <div className="space-y-1 min-w-0">
              <h2 className="text-3xl font-bold text-foreground break-all">{doc.file_name}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{typeLabel(doc.document_type)}</Badge>
                <Badge className={statusClass(doc.processing_status)}>{statusLabel(doc.processing_status)}</Badge>
                <span className="text-xs text-muted-foreground">
                  {doc.page_count} page{doc.page_count !== 1 ? 's' : ''} · {(doc.file_size_bytes / 1024).toFixed(0)} KB ·
                  ingested {doc.ingested_at?.slice(0, 16).replace('T', ' ')} · schema v{doc.schema_version}
                </span>
              </div>
            </div>
            <div className="ml-auto flex gap-2">
              <Button asChild>
                <a href={originalFileUrl(doc.path, 'raw')} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open original
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={originalFileUrl(doc.path, 'download')}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </a>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                  <CardDescription>AI-generated from the document text — check the original for anything important.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground">{doc.summary ?? 'No summary available.'}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Key details</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Document number" value={doc.document_number} />
                    <Field label="Document date" value={doc.document_date} />
                    <Field label="Issued by" value={doc.issuer_name} />
                    <Field label="Issued to" value={doc.recipient_name} />
                    <Field label="Amount" value={formatAmount(doc.total_amount, doc.currency)} />
                    <Field label="Language" value={doc.language} />
                    <Field label="Parties" value={parties.length ? parties.join(', ') : '—'} />
                    <Field label="Searchable passages" value={doc.chunk_count} />
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>All extracted fields</CardTitle>
                  <CardDescription>Every field the pipeline extracted for this document type.</CardDescription>
                </CardHeader>
                <CardContent>
                  {fields.loading && <Skeleton className="h-40 w-full" />}
                  {fields.error && <p className="text-sm text-destructive">Could not load fields: {fields.error}</p>}
                  {fields.data && fields.data.length === 0 && (
                    <p className="text-sm text-muted-foreground">No extracted fields for this document.</p>
                  )}
                  {fields.data && fields.data.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-1/3">Field</TableHead>
                          <TableHead>Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fields.data.map((f) => (
                          <TableRow key={f.field_name}>
                            <TableCell className="font-medium align-top">{f.field_name.replace(/_/g, ' ')}</TableCell>
                            <TableCell className="whitespace-pre-wrap break-words text-muted-foreground">
                              {isTrue(f.is_missing) || !formatFieldValue(f.field_value)
                                ? 'Not on document'
                                : formatFieldValue(f.field_value)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Validation</CardTitle>
                  <CardDescription>Business rules for {typeLabel(doc.document_type).toLowerCase()} documents.</CardDescription>
                </CardHeader>
                <CardContent>
                  {Object.keys(checks).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No rules defined for this type.</p>
                  ) : (
                    <ul className="space-y-2">
                      {Object.entries(checks).map(([name, value]) => ({ name, passed: isTrue(value) })).map(({ name, passed }) => (
                        <li key={name} className="flex items-center gap-2 text-sm">
                          {passed ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <span className={passed ? 'text-foreground' : 'text-destructive'}>{name.replace(/_/g, ' ')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Original</CardTitle>
                </CardHeader>
                <CardContent>
                  {isImage ? (
                    <a href={originalFileUrl(doc.path, 'raw')} target="_blank" rel="noopener noreferrer">
                      <img
                        src={originalFileUrl(doc.path, 'raw')}
                        alt={`Original scan of ${doc.file_name}`}
                        className="w-full rounded-md border"
                      />
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {doc.file_extension?.toUpperCase()} file — use Open original to view it in a new tab.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

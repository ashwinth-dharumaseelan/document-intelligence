import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { useAiSearchQuery } from '@databricks/appkit-ui/react/beta';
import { Download, ExternalLink, Search } from 'lucide-react';
import { originalFileUrl, typeLabel } from '../lib/records';

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

const EXAMPLES = [
  'termination notice period',
  'amount awarded by the court',
  'who can act on behalf of Al Noor',
  'titanium dioxide invoices',
  'licence expiry date',
];

/** Search console: hybrid (semantic + keyword) search over every indexed passage, grouped by document. */
export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('ALL');
  const { search, data, loading, error } = useAiSearchQuery<ChunkRow>({ alias: 'documents' });
  const types = useAnalyticsQuery('document_types', {});

  // A type on its own is a valid search: it lists that type's documents (the type name is the query).
  const run = (text: string, docType: string = type) => {
    const q = text.trim();
    if (!q && docType === 'ALL') return;
    setQuery(q);
    void search({
      queryText: q || typeLabel(docType),
      numResults: q ? 20 : 200,
      ...(docType !== 'ALL' ? { filters: { document_type: docType } } : {}),
    });
  };

  const chooseType = (docType: string) => {
    setType(docType);
    if (docType !== 'ALL' || query.trim()) run(query, docType);
  };

  // One card per document: best-scoring passage first, other matching passages underneath.
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

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      <div>
        <h2 className="f1-title text-3xl font-bold text-foreground">Search records</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Search inside every digitised document by meaning or exact words (invoice numbers, case numbers, names).
          Open a result to see its extracted details and the original file.
        </p>
      </div>

      <form
        className="flex flex-col sm:flex-row gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <Input
          placeholder="e.g. how much notice to terminate the records agreement?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
          aria-label="Search query"
        />
        <Select value={type} onValueChange={chooseType}>
          <SelectTrigger className="sm:w-52" aria-label="Document type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All document types</SelectItem>
            {(types.data ?? []).map((t) => (
              <SelectItem key={t.document_type} value={t.document_type}>
                {typeLabel(t.document_type)} ({t.documents})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={loading || (!query.trim() && type === 'ALL')}>
          <Search className="h-4 w-4 mr-2" />
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {!data && !loading && !error && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">Try:</span>
          {EXAMPLES.map((ex) => (
            <Button key={ex} variant="outline" size="sm" onClick={() => run(ex)}>
              {ex}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Search failed: {error}. Try again, or contact the records team if it persists.</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={`sk-${i}`}>
              <CardContent className="pt-4 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && !loading && hits.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No matching documents</EmptyTitle>
            <EmptyDescription>
              Try other words, remove the type filter, or ask the Assistant a full question.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {data && !loading && hits.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {hits.length} document{hits.length !== 1 ? 's' : ''} · {data.results.length} matching passages ·{' '}
            {data.queryTimeMs} ms
          </p>
          {hits.map((hit) => (
            <Card key={hit.documentId} className="shadow-sm f1-edge">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="text-left text-primary underline-offset-4 hover:underline"
                    onClick={() => navigate(`/documents/${hit.documentId}`)}
                  >
                    {hit.fileName}
                  </button>
                  <Badge variant="outline">{typeLabel(hit.documentType)}</Badge>
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    relevance {hit.bestScore.toFixed(3)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-5">{hit.passages[0]}</p>
                {hit.passages.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    +{hit.passages.length - 1} more matching passage{hit.passages.length > 2 ? 's' : ''} in this document
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => navigate(`/documents/${hit.documentId}`)}>
                    Details
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={originalFileUrl(hit.path, 'raw')} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open original
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={originalFileUrl(hit.path, 'download')}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

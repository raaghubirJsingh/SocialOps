import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RAW_DATA_SOURCE_LABELS, type RawDataDto } from '@/types/content';

/**
 * RawData intake list - read-only.
 *
 * There is no edit or delete affordance anywhere, because the backend exposes
 * no such route: intake records are immutable provenance. The server-computed
 * integrity hash is shown short-form so it can be compared, and a linked
 * Content item is shown by short id (the title lookup belongs to the caller).
 */
export function RawDataList({
  records,
  title = 'Raw data',
  description = 'Immutable intake records (text and metadata only). There is no object storage in this phase, so nothing here is a file.',
}: {
  records: RawDataDto[];
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {records.length === 0 ? (
          <p className="text-sm text-slate-400">No raw intake recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {records.map((record) => (
              <li
                key={record.id}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">
                    {RAW_DATA_SOURCE_LABELS[record.source]}
                  </Badge>
                  <span className="font-mono text-xs text-slate-500">
                    sha256:{record.contentHash.slice(0, 12)}…
                  </span>
                  {record.contentId && (
                    <span className="font-mono text-xs text-slate-500">
                      content {record.contentId.slice(0, 8)}…
                    </span>
                  )}
                </div>

                {record.extractedText && (
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-300">
                    {record.extractedText}
                  </p>
                )}

                {record.metadata ? (
                  <pre className="mt-2 max-h-40 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400">
                    {JSON.stringify(record.metadata, null, 2)}
                  </pre>
                ) : null}

                <p className="mt-2 text-xs text-slate-500">
                  captured {new Date(record.capturedAt).toLocaleString()}
                  {record.mimeType ? ` · ${record.mimeType}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
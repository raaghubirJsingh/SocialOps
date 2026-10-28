import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RawDataSummary } from '@/components/raw-data/raw-data-summary';
import {
  RAW_DATA_SOURCE_LABELS,
  type ClientContentRequestDto,
  type RawDataDto,
} from '@/types/content';

/**
 * RawData intake list - read-only.
 *
 * There is no edit or delete affordance anywhere, because the backend exposes
 * no such route: intake records are immutable provenance. The server-computed
 * integrity hash is shown short-form so it can be compared, and a linked
 * Content item is shown by short id (the title lookup belongs to the caller).
 *
 * Agency callers may pass `draftHref` to offer a manual, human-initiated
 * "Draft from intake" navigation per record. The draft itself is created on
 * the Content page through the existing Content create mutation — this list
 * never creates Content.
 *
 * Two presentation variants (label-only; the records are never transformed):
 *   - 'agency' (default): today's operational view — source badge, integrity
 *     hash, linked content id, "captured" wording.
 *   - 'client': the client-facing Content Request view — draft availability,
 *     "Submitted" wording, and no technical debug details.
 */
export function RawDataList({
  records,
  title = 'Raw data',
  description = 'Immutable intake records (text and metadata only). There is no object storage in this phase, so nothing here is a file.',
  draftHref,
  detailHref,
  variant = 'agency',
}: {
  records: (RawDataDto | ClientContentRequestDto)[];
  title?: string;
  description?: string;
  draftHref?: (rawDataId: string) => string;
  detailHref?: (rawDataId: string) => string;
  variant?: 'agency' | 'client';
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {records.length === 0 ? (
          <p className="text-sm text-slate-400">
            {variant === 'client' ? 'No requests yet.' : 'No raw intake recorded yet.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {records.map((record) => {
              const linkedDraft =
                'requestedContent' in record ? record.requestedContent : null;
              const clientState =
                linkedDraft?.state === 'confirmed'
                  ? 'Content confirmed'
                  : linkedDraft?.state === 'ready_for_review'
                    ? 'Ready for your review'
                    : linkedDraft
                      ? 'Draft in progress'
                      : 'Waiting for draft';

              return (
                <li
                  key={record.id}
                  className="surface-panel rounded-lg px-4 py-3"
                >
                <div className="flex flex-wrap items-center gap-2">
                  {variant === 'client' ? (
                    <Badge variant={linkedDraft ? 'info' : 'neutral'}>
                      {clientState}
                    </Badge>
                  ) : 'source' in record ? (
                    <Badge variant="neutral">
                      {RAW_DATA_SOURCE_LABELS[record.source]}
                    </Badge>
                  ) : null}
                  {variant === 'agency' && 'contentHash' in record && (
                    <span className="font-mono text-xs text-slate-400">
                      sha256:{record.contentHash.slice(0, 12)}…
                    </span>
                  )}
                  {variant === 'agency' &&
                    'contentId' in record &&
                    record.contentId && (
                    <span className="font-mono text-xs text-slate-400">
                      content {record.contentId.slice(0, 8)}…
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <RawDataSummary record={record} />
                </div>

                {variant === 'client' && linkedDraft ? (
                  <p className="mt-3 text-xs text-slate-300">
                    SocialOps draft available: {linkedDraft.title}
                  </p>
                ) : null}

                <p className="mt-2 text-xs text-slate-400">
                  {variant === 'client' ? 'Submitted' : 'captured'}{' '}
                  {new Date(record.capturedAt).toLocaleString()}
                  {variant === 'agency' && record.mimeType
                    ? ` · ${record.mimeType}`
                    : ''}
                </p>

                {draftHref || detailHref ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detailHref ? (
                      <Button asChild size="sm" variant="secondary">
                        <Link href={detailHref(record.id)}>
                          {variant === 'client' ? 'Open request' : 'View intake'}
                        </Link>
                      </Button>
                    ) : null}
                    {draftHref ? (
                      <Button asChild size="sm">
                        <Link href={draftHref(record.id)}>Draft from intake</Link>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
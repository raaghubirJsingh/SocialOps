import { Badge } from '@/components/ui/badge';
import { describeFieldValue } from '@/lib/raw-data-derivation';
import type { RawDataDto } from '@/types/content';

type RawDataSummaryRecord = Pick<
  RawDataDto,
  | 'metadata'
  | 'originalFileName'
  | 'mimeType'
  | 'byteSize'
  | 'extractedText'
>;

type MetadataRecord = Record<string, unknown>;

function asMetadataRecord(value: unknown): MetadataRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as MetadataRecord;
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function listText(value: unknown): string | null {
  if (typeof value === 'string') return textValue(value);
  if (!Array.isArray(value)) return null;
  const parts = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
  return parts.length > 0 ? parts.join(', ') : null;
}

function fieldText(value: unknown): string | null {
  if (typeof value === 'string' || Array.isArray(value)) {
    return describeFieldValue(value as string | string[]) || null;
  }
  return null;
}

interface SummaryRow {
  key: string;
  label: string;
  value: string;
}

/**
 * Human-readable RawData summary (presentation only).
 *
 * RawData remains immutable provenance: this component never edits, deletes,
 * reorders, or invents stored data. It renders `extractedText` prominently,
 * surfaces the approved brief metadata vocabulary as label/value rows, keeps
 * file/source/timestamp context visible, and leaves every unknown or unclear
 * metadata key available under collapsed raw JSON.
 */
export function RawDataSummary({
  record,
}: {
  record: RawDataSummaryRecord;
}) {
  const metadata = asMetadataRecord(record.metadata);
  const rows: SummaryRow[] = [];
  const seen = new Set<string>();

  const add = (key: string, label: string, value: string | null) => {
    if (!value || seen.has(key)) return;
    seen.add(key);
    rows.push({ key, label, value });
  };

  if (metadata) {
    add('contentPurpose', 'Purpose', fieldText(metadata.contentPurpose));
    add('contentCategory', 'Category', fieldText(metadata.contentCategory));
    add('contentType', 'Content type', fieldText(metadata.contentType));
    add('platform', 'Platform(s)', fieldText(metadata.platform));
    add('priority', 'Priority', fieldText(metadata.priority));
    add('targetAudience', 'Audience', fieldText(metadata.targetAudience));
    add('customerType', 'Customer type', fieldText(metadata.customerType));
    add('ageGroup', 'Age group', fieldText(metadata.ageGroup));
    add('gender', 'Gender focus', fieldText(metadata.gender));
    add('language', 'Language', fieldText(metadata.language));
    add('tone', 'Tone', fieldText(metadata.tone));
    add('writingStyle', 'Writing style', fieldText(metadata.writingStyle));
    add('creativeStyle', 'Creative style', fieldText(metadata.creativeStyle));
    add('topic', 'Topic', fieldText(metadata.topic));
    add('keyMessage', 'Key message', textValue(metadata.keyMessage));
    add('keyPoints', 'Key points', listText(metadata.keyPoints));
    add('cta', 'Call to action', fieldText(metadata.cta));
    add('customCtaText', 'Custom call to action', textValue(metadata.customCtaText));
    add('campaignOccasion', 'Campaign / occasion', fieldText(metadata.campaignOccasion));
    add('referenceLinkUrls', 'Reference links', textValue(metadata.referenceLinkUrls));
    add('materialPurpose', 'Material purpose', textValue(metadata.materialPurpose));
    add('specialInstructions', 'Special instructions', textValue(metadata.specialInstructions));
    add('additionalInformation', 'Additional information', textValue(metadata.additionalInformation));
  }

  const attachment = record.originalFileName ?? record.mimeType ?? record.byteSize;
  const rawJson = metadata ? JSON.stringify(record.metadata, null, 2) : null;

  return (
    <div className="space-y-3">
      {record.extractedText?.trim() ? (
        <section aria-label="Request brief">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Request
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
            {record.extractedText.trim()}
          </p>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section aria-label="Request details">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Details
          </p>
          <dl className="grid gap-1.5 sm:grid-cols-2">
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs"
              >
                <dt className="min-w-0 flex-1 text-slate-400">{row.label}</dt>
                <dd className="min-w-0 whitespace-pre-wrap text-right text-slate-200 break-words">
                  {row.key === 'platform' ? (
                    <span className="flex flex-wrap justify-end gap-1">
                      {row.value.split(', ').map((platform) => (
                        <Badge key={platform} variant="muted">
                          {platform}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {attachment ? (
        <section aria-label="Attachment information">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Attachment
          </p>
          <p className="text-xs text-slate-300">
            {[record.originalFileName, record.mimeType].filter(Boolean).join(' · ')}
            {record.byteSize !== null && record.byteSize !== undefined
              ? ` · ${(record.byteSize / 1024).toFixed(1)} KB`
              : ''}
          </p>
        </section>
      ) : null}

      {rawJson ? (
        <details className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-slate-300 hover:text-slate-100">
            View original details
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-300">
            {rawJson}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

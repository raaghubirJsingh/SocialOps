'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SELECT_CLASSES, Textarea } from '@/components/ui/textarea';
import {
  RAW_DATA_SOURCES,
  RAW_DATA_SOURCE_LABELS,
  type CreateRawDataRequest,
  type RawDataSource,
} from '@/types/content';

interface RawDataIntakeFormProps {
  /** Optional link target: the client's own Content items. */
  contentOptions?: Array<{ id: string; title: string }>;
  onSubmit: (body: CreateRawDataRequest) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * RawData intake form - PASTE ONLY.
 *
 * Deliberate scope limits (docs/APPROVED_DECISIONS.md Decision 008):
 *   - there is NO file upload control, because S3-compatible object storage is
 *     deferred; V1 captures pasted text and/or structured metadata;
 *   - `contentHash` is not an input: the server computes it from the payload;
 *   - `storageRef` is not sent (no storage phase exists yet);
 *   - the record is immutable once created - there is no edit path.
 */
export function RawDataIntakeForm({
  contentOptions,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: RawDataIntakeFormProps) {
  const [source, setSource] = useState<RawDataSource>('CLIENT_FORM');
  const [contentId, setContentId] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [metadataText, setMetadataText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    const trimmedText = extractedText.trim();
    let metadata: Record<string, unknown> | undefined;

    if (metadataText.trim().length > 0) {
      try {
        const parsed: unknown = JSON.parse(metadataText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setLocalError('Metadata must be a JSON object, for example {"channel":"instagram"}.');
          return;
        }
        metadata = parsed as Record<string, unknown>;
      } catch {
        setLocalError('Metadata is not valid JSON.');
        return;
      }
    }

    if (trimmedText.length === 0 && !metadata) {
      setLocalError('Provide pasted text and/or a metadata object.');
      return;
    }

    await onSubmit({
      source,
      ...(contentId ? { contentId } : {}),
      ...(trimmedText.length > 0 ? { extractedText: trimmedText } : {}),
      ...(metadata ? { metadata } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="raw-source" className="text-sm font-medium text-slate-300">
          Source
        </Label>
        <select
          id="raw-source"
          className={SELECT_CLASSES}
          value={source}
          onChange={(event) => setSource(event.target.value as RawDataSource)}
          disabled={isSubmitting}
        >
          {RAW_DATA_SOURCES.map((value) => (
            <option key={value} value={value}>
              {RAW_DATA_SOURCE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      {contentOptions && contentOptions.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="raw-content" className="text-sm font-medium text-slate-300">
            Link to content <span className="text-slate-500">(optional)</span>
          </Label>
          <select
            id="raw-content"
            className={SELECT_CLASSES}
            value={contentId}
            onChange={(event) => setContentId(event.target.value)}
            disabled={isSubmitting}
          >
            <option value="">Not linked</option>
            {contentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="raw-text" className="text-sm font-medium text-slate-300">
          Pasted text <span className="text-slate-500">(optional)</span>
        </Label>
        <Textarea
          id="raw-text"
          rows={6}
          value={extractedText}
          onChange={(event) => setExtractedText(event.target.value)}
          placeholder="Paste the brief, transcript, or notes here. No file upload exists in this phase."
          disabled={isSubmitting}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="raw-metadata" className="text-sm font-medium text-slate-300">
          Metadata JSON <span className="text-slate-500">(optional)</span>
        </Label>
        <Textarea
          id="raw-metadata"
          rows={4}
          value={metadataText}
          onChange={(event) => setMetadataText(event.target.value)}
          placeholder='{"channel":"instagram","campaign":"launch"}'
          disabled={isSubmitting}
        />
      </div>

      {(localError || error) && (
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
        >
          {localError ?? error}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Recording…' : 'Record intake'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
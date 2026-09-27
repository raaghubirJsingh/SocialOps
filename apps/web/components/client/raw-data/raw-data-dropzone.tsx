'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  isAllowedUploadContentType,
  type UploadedFileRef,
} from '@/types/content';

/**
 * Raw-media dropzone for the intake wizard (presigned-PUT, zero-buffer).
 *
 * The browser PUTs the bytes DIRECTLY to object storage; the API only ever
 * mints the URL and records the resulting key. No file content ever passes
 * through our own backend.
 *
 * Pre-flight here is a convenience, not a control: type and size are mirrored
 * from the server allowlist so an obviously-bad file is refused instantly, but
 * the server re-validates everything and the signed URL pins the type AND the
 * length, so a mismatched PUT is rejected at the bucket.
 *
 * A failed upload never clears the uploaded list, so the user's other work is
 * preserved.
 */

const ACCEPT_ATTR = ALLOWED_UPLOAD_CONTENT_TYPES.join(',');

const MAX_MIB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface RawDataDropzoneProps {
  /** Performs the real upload (mint + PUT) and resolves the storage ref. */
  onUpload: (file: File) => Promise<UploadedFileRef>;
  uploaded: UploadedFileRef[];
  onRemove?: (storageRef: string) => void;
  disabled?: boolean;
}

export function RawDataDropzone({
  onUpload,
  uploaded,
  onRemove,
  disabled = false,
}: RawDataDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const handleFiles = React.useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setBusy(true);
      try {
        for (const file of Array.from(files)) {
          // Pre-flight mirrors the server allowlist / ceiling.
          if (file.size === 0) {
            setError('That file is empty. Please choose another file.');
            continue;
          }
          if (file.size > MAX_UPLOAD_BYTES) {
            setError(
              `"${file.name}" is larger than ${MAX_MIB} MB. Please choose a smaller file.`,
            );
            continue;
          }
          if (!isAllowedUploadContentType(file.type)) {
            setError(
              `"${file.name}" is not a supported type. Use JPEG, PNG, WebP, or PDF.`,
            );
            continue;
          }
          try {
            await onUpload(file);
          } catch (uploadError) {
            // Surface the failure but KEEP everything already uploaded and
            // keep the wizard text intact - the user can retry just this file.
            setError(
              uploadError instanceof Error
                ? uploadError.message
                : `Upload of "${file.name}" failed.`,
            );
          }
        }
      } finally {
        setBusy(false);
        // Allow re-picking the same file after a failure.
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onUpload],
  );

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Add supporting files"
        aria-disabled={disabled || busy}
        onClick={() => {
          if (!disabled && !busy) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled && !busy) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled && !busy) void handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${
          dragging
            ? 'border-blue-400 bg-blue-950/30'
            : 'border-white/15 bg-white/[0.02] hover:border-white/30'
        } ${disabled || busy ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <p className="text-sm text-slate-200">
          {busy ? 'Uploading…' : 'Drop files here, or click to choose'}
        </p>
        <p className="text-xs text-slate-500">
          JPEG, PNG, WebP or PDF · up to {MAX_MIB} MB per file · uploaded
          directly to secure storage
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          disabled={disabled || busy}
          onChange={(e) => {
            void handleFiles(e.target.files);
          }}
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}

      {uploaded.length > 0 && (
        <ul className="space-y-2">
          {uploaded.map((file) => (
            <li
              key={file.storageRef}
              className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-slate-100">
                  {file.originalFileName}
                </p>
                <p className="text-xs text-slate-500">
                  {file.mimeType} · {formatBytes(file.byteSize)}
                </p>
              </div>
              {onRemove && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemove(file.storageRef)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}



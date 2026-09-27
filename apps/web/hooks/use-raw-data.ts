'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useActiveOrganization } from '@/hooks/use-active-organization';
import { useSession } from '@/hooks/use-session';
import { queryKeys } from '@/lib/query-keys';
import { rawDataApi, uploadFileBytes } from '@/lib/raw-data-api';
import {
  isAllowedUploadContentType,
  MAX_UPLOAD_BYTES,
  type AllowedUploadContentType,
  type CreateRawDataRequest,
  type RawDataDto,
  type UploadedFileRef,
} from '@/types/content';

export type RawDataScope = 'agency' | 'mine';

/** Why a file was refused. Checked locally BEFORE any URL is minted. */
export type UploadRejection =
  | 'unsupported-type'
  | 'too-large'
  | 'empty'
  | 'upload-failed';

/**
 * TanStack Query hooks for RawData intake (Client Operations V1).
 *
 * INSERT-ONLY by construction: there is no update or delete hook here (and no
 * such backend route), so the UI cannot offer one. `contentHash` is computed by
 * the server from the payload it receives, and `storageRef` is never sent
 * because S3-compatible storage is deferred - V1 intake is pasted text and/or
 * structured metadata only, with NO file upload.
 */
export function useRawData(scope: RawDataScope, clientId: string) {
  const { activeOrganizationId } = useActiveOrganization();
  const { isAuthenticated, isLoading } = useSession();

  const enabled =
    !isLoading &&
    isAuthenticated &&
    Boolean(clientId) &&
    (scope === 'agency' ? Boolean(activeOrganizationId) : true);

  return useQuery<RawDataDto[]>({
    queryKey: queryKeys.rawData(scope, activeOrganizationId, clientId),
    queryFn: () =>
      scope === 'agency'
        ? rawDataApi.listForClient(clientId)
        : rawDataApi.listMine(clientId),
    enabled,
    retry: 0,
  });
}

export function useCreateRawData(scope: RawDataScope, clientId: string) {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useActiveOrganization();

  return useMutation<RawDataDto, Error, CreateRawDataRequest>({
    mutationFn: (body) =>
      scope === 'agency'
        ? rawDataApi.createForClient(clientId, body)
        : rawDataApi.createMine(clientId, body),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.rawData(scope, activeOrganizationId, clientId),
      }),
  });
}

/**
 * Mint a presigned PUT URL. Metadata only - no bytes.
 *
 * Split from the byte transfer so a caller can pre-flight, show progress, or
 * cancel independently. Most callers want `useRawDataUpload`, which composes
 * this with the transfer and enforces the ordering.
 */
export function useCreateRawDataUploadUrl(
  scope: RawDataScope,
  clientId: string,
) {
  return useMutation<
    import('@/types/content').PresignedUploadResponse,
    Error,
    { filename: string; contentType: AllowedUploadContentType; contentLength: number }
  >({
    mutationFn: (body) =>
      scope === 'agency'
        ? rawDataApi.createUploadUrlForClient(clientId, body)
        : rawDataApi.createUploadUrlMine(clientId, body),
    retry: 0,
  });
}

/**
 * Full upload orchestration: pre-flight -> mint -> PUT bytes -> return the
 * reference for the intake record.
 *
 * The local pre-flight mirrors the server allowlist and the 10 MiB ceiling so
 * an obviously-bad file is refused without minting a URL. This is a
 * convenience, never the control: the server re-validates everything, and the
 * signed URL pins both type and length so a mismatched PUT fails at the bucket.
 */
export function useRawDataUpload(scope: RawDataScope, clientId: string) {
  const [lastRejection, setLastRejection] = React.useState<UploadRejection | null>(
    null,
  );
  const { mutateAsync: mintAsync } = useCreateRawDataUploadUrl(
    scope,
    clientId,
  );

  const uploadFile = React.useCallback(
    async (file: File): Promise<UploadedFileRef> => {
      setLastRejection(null);

      if (file.size === 0) {
        setLastRejection('empty');
        throw new Error('That file is empty. Please choose another file.');
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setLastRejection('too-large');
        throw new Error(
          'That file is larger than 10 MB. Please choose a smaller file.',
        );
      }
      if (!isAllowedUploadContentType(file.type)) {
        setLastRejection('unsupported-type');
        throw new Error(
          'Only JPEG, PNG, WebP, or PDF files can be uploaded.',
        );
      }

      const contentType = file.type;
      const { uploadUrl, objectKey } = await mintAsync({
        filename: file.name,
        contentType,
        contentLength: file.size,
      });

      try {
        const ref = await uploadFileBytes(uploadUrl, file, contentType);
        // The STORAGE REF is the internal object key, never the presigned URL.
        return { ...ref, storageRef: objectKey };
      } catch (error) {
        setLastRejection('upload-failed');
        throw error;
      }
    },
    [mintAsync],
  );

  return { uploadFile, lastRejection };
}
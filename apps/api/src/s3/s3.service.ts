import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  CONTENT_TYPE_EXTENSIONS,
  DEFAULT_PRESIGNED_URL_TTL_SECONDS,
  RAW_DATA_KEY_SEGMENT,
  type AllowedUploadContentType,
} from './s3.constants.js';
import type { PresignedUploadResult } from './dto/presigned-upload.dto.js';

/**
 * Zero-buffer S3-compatible storage service.
 *
 * The backend NEVER receives file bytes. It mints short-lived presigned PUT
 * URLs so the browser uploads directly to the bucket; the NestJS process only
 * ever handles upload METADATA (filename, content type, length).
 *
 * Tenant isolation (AGENTS.md §6-§7): object keys are constructed strictly as
 *   `{organizationId}/{clientId}/raw-data/{uuid}.{ext}`
 * where BOTH tenant segments are verified server-side context, never request
 * input. `storageRef` stores this internal key - never a URL - and media is
 * read back later through signed GETs (planned) against a PRIVATE bucket.
 *
 * The client is initialised lazily so the application (and CI, which has no
 * S3 credentials) can boot without storage configured; the first upload-url
 * request fails fast with a clear 503 instead of crashing bootstrap.
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client | null = null;

  /** Resolve presigned URL TTL from env (bounded: 60s .. 1h). */
  private get ttlSeconds(): number {
    const raw = Number(process.env.S3_PRESIGNED_URL_TTL_SECONDS);
    if (!Number.isFinite(raw) || raw <= 0) {
      return DEFAULT_PRESIGNED_URL_TTL_SECONDS;
    }
    return Math.min(Math.max(Math.floor(raw), 60), 3600);
  }

  private getClient(): S3Client {
    if (this.client) return this.client;

    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!region || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException(
        'Object storage is not configured (AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing)',
      );
    }

    this.client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }

  private getBucket(): string {
    const bucket = process.env.S3_RAW_DATA_BUCKET;
    if (!bucket) {
      throw new ServiceUnavailableException(
        'Object storage is not configured (S3_RAW_DATA_BUCKET missing)',
      );
    }
    return bucket;
  }

  /**
   * Build the internal object key from VERIFIED tenant context only.
   *
   * `organizationId` and `clientId` are caller-verified values (JWT org
   * context / ClientAccessGuard binding / ACTIVE relationship). The
   * extension is derived from the validated content type, never from the
   * client-supplied filename.
   */
  buildObjectKey(
    organizationId: string,
    clientId: string,
    contentType: AllowedUploadContentType,
  ): string {
    if (!organizationId || !clientId) {
      // Defense-in-depth: never mint a key without the full tenant prefix.
      throw new BadRequestException('Tenant context is required');
    }
    const extension = CONTENT_TYPE_EXTENSIONS[contentType];
    return `${organizationId}/${clientId}/${RAW_DATA_KEY_SEGMENT}/${randomUUID()}.${extension}`;
  }

  /**
   * Mint a short-lived presigned PUT URL for `objectKey`.
   *
   * Content type is pinned into the signed request, so the URL can only be
   * used for exactly the negotiated upload. The presigner does not touch the
   * object - no bytes flow through this process.
   */
  async createPresignedPutUrl(
    objectKey: string,
    contentType: AllowedUploadContentType,
  ): Promise<PresignedUploadResult> {
    const client = this.getClient();
    const bucket = this.getBucket();
    const expiresIn = this.ttlSeconds;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    });

    try {
      const uploadUrl = await getSignedUrl(client, command, { expiresIn });
      this.logger.debug(
        `Minted presigned PUT URL (ttl=${expiresIn}s) for key ${objectKey}`,
      );
      return { uploadUrl, objectKey, expiresIn };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Presigning failed for key ${objectKey}: ${message}`);
      throw new ServiceUnavailableException(
        'Unable to create an upload URL at this time',
      );
    }
  }

  /**
   * Validate a caller-supplied `storageRef` against the tenant prefix.
   *
   * A valid storageRef is the INTERNAL object key minted by this service:
   *   `{organizationId}/{clientId}/raw-data/{uuid}.{ext}`
   * Anything else - most importantly any URL-shaped value - is rejected, so
   * the reserved column can never be turned into a public-URL field.
   */
  assertValidStorageRef(
    storageRef: string,
    organizationId: string,
    clientId: string,
  ): void {
    if (/^https?:\/\//i.test(storageRef) || storageRef.includes('//')) {
      throw new BadRequestException(
        'storageRef must be the internal object key, never a URL',
      );
    }
    const prefix = `${organizationId}/${clientId}/${RAW_DATA_KEY_SEGMENT}/`;
    if (!storageRef.startsWith(prefix)) {
      throw new BadRequestException(
        'storageRef does not belong to this tenant scope',
      );
    }
    // The remainder must be a server-minted key: uuid.ext, no path tricks.
    const relative = storageRef.slice(prefix.length);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i.test(
        relative,
      )
    ) {
      throw new BadRequestException('storageRef is not a valid object key');
    }
  }
}
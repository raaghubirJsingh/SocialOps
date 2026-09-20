import { Module } from '@nestjs/common';

import { S3Service } from './s3.service.js';

/**
 * S3-compatible object storage (approved AGENTS.md §13 override for raw-data
 * media). Provides presigned PUT URL minting only - the backend never buffers
 * file bytes. Import this module wherever upload URLs are issued.
 */
@Module({
  providers: [S3Service],
  exports: [S3Service],
})
export class S3Module {}
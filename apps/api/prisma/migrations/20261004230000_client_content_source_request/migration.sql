-- Create a server-authoritative link from a Content Request to its draft.
ALTER TABLE "Content" ADD COLUMN "sourceRequestId" UUID;

CREATE UNIQUE INDEX "Content_sourceRequestId_key"
    ON "Content"("sourceRequestId");

ALTER TABLE "Content"
    ADD CONSTRAINT "Content_sourceRequestId_fkey"
    FOREIGN KEY ("sourceRequestId") REFERENCES "RawData"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

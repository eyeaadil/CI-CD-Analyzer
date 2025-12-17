-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "LogChunk" ADD COLUMN "embedding" vector(768);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "logchunk_embedding_idx" ON "LogChunk" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- CreateTable
CREATE TABLE "LogChunk" (
    "id" SERIAL NOT NULL,
    "workflowRunId" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "stepName" TEXT,
    "content" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,
    "tokenCount" INTEGER,
    "hasErrors" BOOLEAN NOT NULL DEFAULT false,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogChunk_workflowRunId_idx" ON "LogChunk"("workflowRunId");

-- CreateIndex
CREATE INDEX "LogChunk_stepName_idx" ON "LogChunk"("stepName");

-- CreateIndex
CREATE INDEX "LogChunk_hasErrors_idx" ON "LogChunk"("hasErrors");

-- CreateIndex
CREATE UNIQUE INDEX "LogChunk_workflowRunId_chunkIndex_key" ON "LogChunk"("workflowRunId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "LogChunk" ADD CONSTRAINT "LogChunk_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

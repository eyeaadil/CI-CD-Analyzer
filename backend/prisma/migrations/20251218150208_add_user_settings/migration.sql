-- DropIndex
DROP INDEX "logchunk_embedding_idx";

-- AlterTable
ALTER TABLE "AnalysisResult" ADD COLUMN     "failureType" TEXT,
ADD COLUMN     "priority" INTEGER,
ADD COLUMN     "usedAI" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" SERIAL NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "emailDigest" TEXT NOT NULL DEFAULT 'weekly',
    "slackWebhook" TEXT,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnSuccess" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");

-- CreateIndex
CREATE INDEX "WorkflowRun_createdAt_idx" ON "WorkflowRun"("createdAt");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

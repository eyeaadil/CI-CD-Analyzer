import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { LogParserService } from '../services/logParser.js';
import { AIAnalyzerService } from '../services/aiAnalyzer.js';
import { FailureClassifierService } from '../services/failureClassifier.js';  // Deterministic classifier
import { EmbeddingService } from '../services/embeddingService.js';  // Phase 2
import { VectorSearchService } from '../services/vectorSearch.js';  // Phase 2
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'log-processing',
  async (job) => {
    const { repoFullName, runId, installationId } = job.data;
    console.log(`Processing job for run ID: ${runId} in repo: ${repoFullName}`);

    try {
      // 1. Authenticate as the GitHub App Installation
      // Dynamic import for ESM packages
      const { App } = await import('@octokit/app');
      const { Octokit } = await import('@octokit/rest');

      // const app = new App({
      //   appId: process.env.GITHUB_APP_ID,
      //   privateKey: process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n'),
      //   Octokit,
      // });

      const privateKey = process.env.GITHUB_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error("GITHUB_PRIVATE_KEY is not set");
      }

      const app = new App({
        appId: process.env.GITHUB_APP_ID,
        privateKey: privateKey.replace(/\\n/g, '\n'),
        Octokit,
      });


      const octokit = await app.getInstallationOctokit(installationId);
      const [owner, repo] = repoFullName.split('/');

      // 2. Get the workflow run logs URL
      const response = await octokit.actions.downloadWorkflowRunLogs({
        owner,
        repo,
        run_id: runId,
      });

      // The response.url is a temporary URL to the log zip file
      console.log(`Successfully fetched log URL for run ${runId}: ${response.url}`);

      // 3. Download and Unzip Logs
      console.log(`Downloading logs from: ${response.url}`);
      const logResponse = await axios.get(response.url, { responseType: 'arraybuffer' });
      const zip = new AdmZip(Buffer.from(logResponse.data));
      const zipEntries = zip.getEntries();

      let fullLogText = '';

      // Combine all .txt files from the zip
      for (const entry of zipEntries) {
        if (!entry.isDirectory && entry.entryName.endsWith('.txt')) {
          const text = entry.getData().toString('utf8');
          fullLogText += `\n--- Log File: ${entry.entryName} ---\n`;
          fullLogText += text;
        }
      }

      if (!fullLogText) {
        throw new Error('No .txt log files found in the downloaded zip.');
      }

      console.log(`Extracted ${fullLogText.length} characters of log data.`);

      // Ensure runId is a string for the DB query (as per schema)
      const githubRunId = String(runId);

      // 4. Parse logs with ENHANCED parser (Phase 1: Smart Chunking)
      const logParser = new LogParserService();
      const aiAnalyzer = new AIAnalyzerService();

      console.log('🔍 Parsing logs with smart chunking...');
      const parseResult = logParser.parse(fullLogText);

      console.log(`📊 Parsed into ${parseResult.totalChunks} chunks from ${parseResult.totalLines} lines`);
      console.log(`❌ Found ${parseResult.detectedErrors.length} errors`);

      // 5. Save chunks to database (Phase 1)
      console.log('💾 Saving log chunks to database...');
      const workflowRun = await prisma.workflowRun.findUnique({
        where: { githubRunId },
      });

      if (!workflowRun) {
        console.warn(`WorkflowRun with githubRunId ${githubRunId} not found in DB. Skipping.`);
        return;
      }

      // Delete existing chunks for this workflow run (if re-processing)
      const deletedCount = await prisma.logChunk.deleteMany({
        where: { workflowRunId: workflowRun.id }
      });

      if (deletedCount.count > 0) {
        console.log(`🗑️  Deleted ${deletedCount.count} old chunks (re-processing)`);
      }

      // Save all chunks
      for (const chunk of parseResult.chunks) {
        await prisma.logChunk.create({
          data: {
            workflowRunId: workflowRun.id,
            chunkIndex: chunk.chunkIndex,
            stepName: chunk.stepName,
            content: chunk.content,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            tokenCount: chunk.tokenCount,
            hasErrors: chunk.hasErrors,
            errorCount: chunk.errorCount,
          },
        });
      }
      console.log(`✅ Saved ${parseResult.chunks.length} chunks to database`);

      // Phase 2: Generate embeddings for chunks
      console.log('🧬 Generating embeddings for chunks...');
      const embeddingService = new EmbeddingService();
      const vectorSearch = new VectorSearchService();

      let embeddedCount = 0;
      for (const chunk of parseResult.chunks) {
        try {
          // Generate embedding for chunk content
          const embedding = await embeddingService.generateEmbedding(chunk.content);

          // Find the database ID for this chunk
          const dbChunk = await prisma.logChunk.findUnique({
            where: {
              workflowRunId_chunkIndex: {
                workflowRunId: workflowRun.id,
                chunkIndex: chunk.chunkIndex,
              },
            },
          });

          if (dbChunk) {
            await vectorSearch.updateChunkEmbedding(dbChunk.id, embedding);
            embeddedCount++;
          }

          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Failed to generate embedding for chunk ${chunk.chunkIndex}:`, error.message);
          // Continue with other chunks
        }
      }
      console.log(`✅ Generated embeddings for ${embeddedCount}/${parseResult.chunks.length} chunks`);

      // Find chunks with errors
      const errorChunks = parseResult.chunks.filter(c => c.hasErrors);

      // Always include the last 2 chunks as they often contain the final exit status/summary
      const lastChunks = parseResult.chunks.slice(-2);

      // Combine and deduplicate by chunkIndex
      const uniqueChunkIndices = new Set([
        ...errorChunks.map(c => c.chunkIndex),
        ...lastChunks.map(c => c.chunkIndex)
      ]);

      const chunksToAnalyze = parseResult.chunks.filter(c => uniqueChunkIndices.has(c.chunkIndex));

      // Convert chunks to format for AI analyzer
      const steps = chunksToAnalyze.map(chunk => ({
        id: chunk.chunkIndex,
        name: chunk.stepName,
        logLines: chunk.content.split('\n'),
        duration: 'N/A',
        status: chunk.hasErrors ? 'failure' : 'info',
      }));

      // 6. DETERMINISTIC CLASSIFICATION (runs BEFORE AI)
      console.log('🔬 Running deterministic failure classification...');
      const classifier = new FailureClassifierService();
      const classification = classifier.classify(parseResult.chunks, parseResult.detectedErrors);

      console.log(`📊 Classification: ${classification.failureType} (P${classification.priority})`);

      let analysisResult;

      // 7. DECISION: Skip AI or Run AI based on classification
      if (classification.skipAI) {
        // INTENTIONAL FAILURE - AI is skipped completely
        console.log('⚡ Deterministic result - AI SKIPPED');
        console.log('--- Deterministic Analysis Result ---');
        console.log('Root Cause:', classification.rootCause);
        console.log('Failure Stage:', classification.failureStage);
        console.log('Suggested Fix:', classification.suggestedFix);
        console.log(`📊 Confidence: ${(classification.confidence.score * 100).toFixed(0)}% - ${classification.confidence.reason}`);
        console.log('-------------------------------------');

        analysisResult = {
          rootCause: classification.rootCause,
          failureStage: classification.failureStage,
          suggestedFix: classification.suggestedFix,
          confidence: classification.confidence,
          usedAI: false,
          classification: classification.failureType,
          priority: classification.priority,
        };
      } else {
        // Run AI with classification context
        console.log('🤖 Running AI analysis with priority context...');

        const classificationContext = {
          failureType: classification.failureType,
          priority: classification.priority,
        };

        // Phase 3: Pass chunks for RAG context + classification context
        const aiResult = await aiAnalyzer.analyzeFailure(
          steps,
          parseResult.detectedErrors,
          parseResult.chunks,
          classificationContext  // NEW: Pass classification context
        );

        console.log('--- AI Analysis Result ---');
        console.log('Root Cause:', aiResult.rootCause);
        console.log('Suggested Fix:', aiResult.suggestedFix);
        if (aiResult.usedRAG) {
          console.log(`🎯 RAG Enhanced: Found ${aiResult.similarCasesCount} similar past case(s)`);
        }
        console.log(`📊 Classification: ${classification.failureType} (P${classification.priority})`);
        console.log('--------------------------');

        analysisResult = {
          ...aiResult,
          usedAI: true,
          classification: classification.failureType,
          priority: classification.priority,
        };
      }

      // 8. Save analysis results to database
      console.log('💾 Saving analysis results...');
      await prisma.analysisResult.upsert({
        where: { workflowRunId: workflowRun.id },
        update: {
          rootCause: analysisResult.rootCause,
          failureStage: analysisResult.failureStage || 'Unknown',
          suggestedFix: analysisResult.suggestedFix,
          priority: analysisResult.priority,
          failureType: analysisResult.classification,
          usedAI: analysisResult.usedAI !== false,
          detectedErrors: JSON.stringify(parseResult.detectedErrors || []),
          steps: JSON.stringify(steps),
        },
        create: {
          workflowRunId: workflowRun.id,
          rootCause: analysisResult.rootCause,
          failureStage: analysisResult.failureStage || 'Unknown',
          suggestedFix: analysisResult.suggestedFix,
          priority: analysisResult.priority,
          failureType: analysisResult.classification,
          usedAI: analysisResult.usedAI !== false,
          detectedErrors: JSON.stringify(parseResult.detectedErrors || []),
          steps: JSON.stringify(steps),
        },
      });

      console.log(`✅ Analysis saved for run ${runId}`);
      console.log(`📊 Stats: ${parseResult.totalChunks} chunks, ${parseResult.detectedErrors.length} errors, AI used: ${analysisResult.usedAI}`);

    } catch (error) {
      console.error(`Failed to process job for run ID ${runId}:`, error);
      throw error; // This will cause the job to be retried
    }
  },
  {
    connection: redisConnection,
    // Fix: Better worker settings for reliability
    lockDuration: 600000, // 10 minutes (for long processing)
    stalledInterval: 30000, // Check every 30 seconds
    maxStalledCount: 3 // Retry stalled jobs 3 times
  }
);

console.log('Log processing worker started.');

// Enhanced event handlers
worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  if (job) {
    console.error(`❌ Job ${job.id} failed with error: ${err.message}`);
  } else {
    console.error(`❌ An unknown job failed with error: ${err.message}`);
  }
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️  Job ${jobId} stalled - will be retried`);
});

worker.on('active', (job) => {
  console.log(`🔄 Job ${job.id} started processing`);
});

worker.on('error', (err) => {
  console.error('❌ Worker error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
});

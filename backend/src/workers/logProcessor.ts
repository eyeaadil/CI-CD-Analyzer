import { Worker } from 'bullmq';
import IORedis from 'ioredis';
// import { App } from '@octokit/app';
// import { Octokit } from '@octokit/rest';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { LogProcessingJobData } from '../queues/logProcessingQueue';
import { LogParserService } from '../services/logParser';
import { AIAnalyzerService } from '../services/aiAnalyzer';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker<LogProcessingJobData>(
  'log-processing',
  async (job) => {
    const { repoFullName, runId, installationId } = job.data;
    console.log(`Processing job for run ID: ${runId} in repo: ${repoFullName}`);

    try {
      // 1. Authenticate as the GitHub App Installation
      // Dynamic import for ESM packages
      const { App } = await import('@octokit/app');
      const { Octokit } = await import('@octokit/rest');

      const app = new App({
        appId: process.env.GITHUB_APP_ID!,
        privateKey: process.env.GITHUB_PRIVATE_KEY!.replace(/\\n/g, '\n'),
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

      // 4. Analyze Logs
      const logParser = new LogParserService();
      const aiAnalyzer = new AIAnalyzerService();

      const parsedResult = logParser.parse(fullLogText);
      const aiResult = await aiAnalyzer.analyzeFailure(parsedResult.steps || [], parsedResult.detectedErrors || []);

      console.log('--- Analysis Result ---');
      console.log('Root Cause:', aiResult.rootCause);
      console.log('Suggested Fix:', aiResult.suggestedFix);
      console.log('-----------------------');

      // 5. Save results to Database
      console.log('Saving analysis results to database...');

      // Ensure runId is a string for the DB query (as per schema)
      const githubRunId = String(runId);

      // Find the workflow run in our DB to get its internal ID
      const workflowRun = await prisma.workflowRun.findUnique({
        where: { githubRunId },
      });

      if (!workflowRun) {
        console.warn(`WorkflowRun with githubRunId ${githubRunId} not found in DB. Skipping save.`);
        // In a real scenario, we might want to upsert it or handle this gracefully.
        return;
      }

      await prisma.analysisResult.create({
        data: {
          workflowRunId: workflowRun.id,
          rootCause: aiResult.rootCause || 'Unknown',
          failureStage: aiResult.failureStage || 'Unknown',
          suggestedFix: aiResult.suggestedFix || 'Unknown',
          detectedErrors: parsedResult.detectedErrors as any, // Cast to any for JSON
          steps: parsedResult.steps as any, // Cast to any for JSON
        },
      });

      console.log(`Analysis saved for run ${runId}`);


    } catch (error) {
      console.error(`Failed to process job for run ID ${runId}:`, error);
      throw error; // This will cause the job to be retried
    }
  },
  { connection: redisConnection }
);

console.log('Log processing worker started.');

worker.on('failed', (job, err) => {
  if (job) {
    console.error(`Job ${job.id} failed with error: ${err.message}`);
  } else {
    console.error(`An unknown job failed with error: ${err.message}`);
  }
});

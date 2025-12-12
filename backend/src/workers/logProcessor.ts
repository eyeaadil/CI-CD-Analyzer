import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';
import { LogProcessingJobData } from '../queues/logProcessingQueue';

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
      const app = new App({
        appId: process.env.GITHUB_APP_ID!,
        privateKey: process.env.GITHUB_PRIVATE_KEY!.replace(/\\n/g, '\n'),
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

      // TODO: In the next step, we will:
      // 1. Download the zip file from response.url
      // 2. Unzip it to get the log text
      // 3. Save the log text to S3
      // 4. Update our database with the log URL
      // 5. Pass the log text to the analysis services

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

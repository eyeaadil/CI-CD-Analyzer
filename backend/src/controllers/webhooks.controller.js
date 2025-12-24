// import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logProcessingQueue } from '../queues/logProcessingQueue.js';

const prisma = new PrismaClient();

export const WebhooksController = {
  github: async (req, res) => {
    const event = req.headers['x-github-event'];
    const payload = req.body;

    // ----------------------------
    // Debug logs (keep for now)
    // ----------------------------
    console.log('📩 WEBHOOK RECEIVED');
    console.log('Event:', event);
    console.log('Action:', payload?.action);
    console.log('Conclusion:', payload?.workflow_run?.conclusion);

    // ----------------------------
    // Handle workflow_run completions (both success and failure)
    // ----------------------------
    if (
      event === 'workflow_run' &&
      payload.action === 'completed' &&
      payload.workflow_run?.conclusion // success, failure, or cancelled
    ) {
      const run = payload.workflow_run;
      const repo = payload.repository;
      const installation = payload.installation;

      if (!run || !repo) {
        console.warn('⚠️ Missing required webhook fields, skipping');
        return res.status(200).send('Incomplete payload');
      }

      const githubRunId = String(run.id);
      const isFailure = run.conclusion === 'failure';

      console.log(`--- ${isFailure ? '❌ Workflow Run Failed' : '✅ Workflow Run Succeeded'} ---`);
      console.log('Repo:', repo.full_name);
      console.log('Run ID:', githubRunId);
      console.log('Conclusion:', run.conclusion);

      try {
        // ----------------------------
        // 1️⃣ Save WorkflowRun in DB (both success and failure)
        // ----------------------------
        await prisma.workflowRun.upsert({
          where: { githubRunId },
          update: {
            status: run.conclusion,
          },
          create: {
            githubRunId,
            workflowName: run.name ?? 'unknown',
            status: run.conclusion ?? 'unknown',
            triggerEvent: run.event ?? 'unknown',

            // ✅ REQUIRED FIELDS
            commitSha: run.head_sha ?? 'unknown',
            branch: run.head_branch ?? 'unknown',
            actor: run.actor?.login ?? 'unknown',

            runUrl: run.html_url,

            repo: {
              connectOrCreate: {
                where: {
                  githubId: String(repo.id),
                },
                create: {
                  githubId: String(repo.id),
                  owner: repo.owner.login,
                  name: repo.name,
                  isPrivate: repo.private,
                  userId: 1, // TEMP: replace with actual user later
                },
              },
            },
          },
        });

        console.log('✅ WorkflowRun saved in DB:', githubRunId);

        // ----------------------------
        // 2️⃣ Only queue log processing for FAILURES
        // ----------------------------
        if (isFailure && installation) {
          // Use unique jobId with timestamp to allow re-processing of same run ID
          const jobId = `${run.id}-${Date.now()}`;
          await logProcessingQueue.add('log-processing', {
            repoFullName: repo.full_name,
            runId: run.id,
            installationId: installation.id,
          }, {
            jobId: jobId,  // Unique ID prevents deduplication
            removeOnComplete: 100,  // Keep last 100 completed jobs
            removeOnFail: 50,       // Keep last 50 failed jobs
          });

          console.log('🚀 Job queued for run:', githubRunId, '(jobId:', jobId, ')');
        }

      } catch (err) {
        console.error('❌ Webhook processing failed:', err);
      }
    }

    // Always acknowledge webhook
    return res.status(200).send('Event received');
  },
};


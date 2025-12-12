import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Define the structure of the data our job will carry
export interface LogProcessingJobData {
  repoFullName: string;
  runId: number;
  installationId: number;
}

// Create a connection to Redis
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Important for BullMQ
});

// Create and export the queue
export const logProcessingQueue = new Queue<LogProcessingJobData>('log-processing', {
  connection: redisConnection,
});

console.log('Log processing queue initialized.');

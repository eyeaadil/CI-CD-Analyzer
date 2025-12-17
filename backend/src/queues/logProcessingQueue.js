import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Create a connection to Redis
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Important for BullMQ
});

// Create and export the queue
export const logProcessingQueue = new Queue('log-processing', {
  connection: redisConnection,
});

console.log('Log processing queue initialized.');

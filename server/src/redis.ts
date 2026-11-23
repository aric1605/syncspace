import { Redis } from 'ioredis';
import { config } from './config.js';

let hasLoggedRedisError = false;

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
  retryStrategy(times: number) {
    if (times > 3) {
      return null; // Stop retrying quickly to avoid spamming Upstash
    }
    return Math.min(times * 200, 2000);
  },
});

redis.on('error', (err: Error) => {
  if (!hasLoggedRedisError) {
    console.warn('⚠️ Redis connection error (presence/rate-limiting will degrade gracefully):', err.message);
    hasLoggedRedisError = true;
  }
});

redis.on('connect', () => {
  hasLoggedRedisError = false;
});

export async function getRedisClient(): Promise<Redis> {
  if (redis.status === 'wait') {
    try {
      await redis.connect();
    } catch (err: any) {
      if (!hasLoggedRedisError) {
        console.warn('⚠️ Failed to connect to Redis on demand:', err.message);
        hasLoggedRedisError = true;
      }
    }
  }
  return redis;
}

export async function checkRedis(timeoutMs = 2000): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const pingPromise = client.ping();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis check timeout')), timeoutMs)
    );
    const result = await Promise.race([pingPromise, timeoutPromise]);
    return result === 'PONG';
  } catch (err) {
    return false;
  }
}

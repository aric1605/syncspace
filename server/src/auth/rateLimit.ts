import { getRedisClient } from '../redis.js';

const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 600; // 10 minutes

export async function checkLoginRateLimit(ip: string, email: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    const cleanEmail = email.trim().toLowerCase();
    const key = `ratelimit:login:${ip}:${cleanEmail}`;

    const attempts = await redis.incr(key);
    if (attempts === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }

    return attempts <= MAX_ATTEMPTS;
  } catch (err: any) {
    // Fail open if Redis is down or unreachable
    return true;
  }
}

export async function clearLoginRateLimit(ip: string, email: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    const cleanEmail = email.trim().toLowerCase();
    const key = `ratelimit:login:${ip}:${cleanEmail}`;
    await redis.del(key);
  } catch (err) {
    // Ignore Redis errors
  }
}

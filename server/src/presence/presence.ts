import { getRedisClient } from '../redis.js';

export async function setUserPresence(workspaceId: string, userId: string, ttlSeconds = 60): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.set(`presence:${workspaceId}:${userId}`, '1', 'EX', ttlSeconds);
  } catch (err: any) {
    // Fail silently / graceful degradation
  }
}

export async function removeUserPresence(workspaceId: string, userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(`presence:${workspaceId}:${userId}`);
  } catch (err: any) {
    // Fail silently
  }
}

export async function getOnlineUsers(
  workspaceId: string,
  userIds: string[]
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  if (userIds.length === 0) return result;

  // Default to offline
  for (const id of userIds) {
    result[id] = false;
  }

  try {
    const redis = await getRedisClient();
    const keys = userIds.map((id) => `presence:${workspaceId}:${id}`);
    const values = await redis.mget(...keys);

    values.forEach((val, idx) => {
      const id = userIds[idx];
      if (id && val === '1') {
        result[id] = true;
      }
    });
  } catch (err: any) {
    // Return all false if Redis fails
  }

  return result;
}

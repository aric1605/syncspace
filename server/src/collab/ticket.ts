import crypto from 'crypto';
import { getRedisClient } from '../redis.js';
import { Role } from '../workspaces/roles.js';

export interface TicketData {
  userId: string;
  workspaceId: string;
  role: Role;
  name: string;
  color: string;
}

// In-memory fallback if Redis is down
const memoryTickets = new Map<string, { data: TicketData; expiresAt: number }>();

export async function createWsTicket(data: TicketData): Promise<string> {
  const ticket = crypto.randomBytes(24).toString('hex');
  const serialized = JSON.stringify(data);

  try {
    const redis = await getRedisClient();
    await redis.set(`ticket:${ticket}`, serialized, 'EX', 30); // 30 seconds TTL
  } catch (err) {
    // Fallback to memory
    memoryTickets.set(ticket, {
      data,
      expiresAt: Date.now() + 30 * 1000,
    });
  }

  return ticket;
}

export async function consumeWsTicket(ticket: string): Promise<TicketData | null> {
  if (!ticket) return null;

  try {
    const redis = await getRedisClient();
    // Use GETDEL if supported, otherwise GET + DEL
    let raw: string | null = null;
    if (typeof (redis as any).getdel === 'function') {
      raw = await (redis as any).getdel(`ticket:${ticket}`);
    } else {
      raw = await redis.get(`ticket:${ticket}`);
      if (raw) {
        await redis.del(`ticket:${ticket}`);
      }
    }

    if (raw) {
      return JSON.parse(raw) as TicketData;
    }
  } catch (err) {
    // If Redis fails, check in-memory fallback
  }

  const mem = memoryTickets.get(ticket);
  if (mem) {
    memoryTickets.delete(ticket);
    if (mem.expiresAt > Date.now()) {
      return mem.data;
    }
  }

  return null;
}

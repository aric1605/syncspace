import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { TicketData } from '../collab/ticket.js';

describe('WebSocket One-Time Ticket Flow (Fake Redis)', () => {
  class FakeRedisTicketStore {
    private store = new Map<string, { value: string; expiresAt: number }>();

    async set(key: string, value: string, ttlMs: number) {
      this.store.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
    }

    async getdel(key: string): Promise<string | null> {
      const entry = this.store.get(key);
      if (!entry) return null;

      // Single-use: delete immediately on retrieval
      this.store.delete(key);

      if (entry.expiresAt < Date.now()) {
        return null;
      }

      return entry.value;
    }
  }

  it('guarantees tickets are single-use', async () => {
    const redis = new FakeRedisTicketStore();
    const ticketId = crypto.randomBytes(16).toString('hex');
    const ticketData: TicketData = {
      userId: 'user-123',
      workspaceId: 'ws-456',
      role: 'editor',
      name: 'Alice',
      color: '#6C7BFF',
    };

    await redis.set(`ticket:${ticketId}`, JSON.stringify(ticketData), 30000);

    // First consumption: succeeds
    const firstConsume = await redis.getdel(`ticket:${ticketId}`);
    expect(firstConsume).not.toBeNull();
    const parsed = JSON.parse(firstConsume!);
    expect(parsed.userId).toBe('user-123');
    expect(parsed.role).toBe('editor');

    // Second consumption: fails (single-use)
    const secondConsume = await redis.getdel(`ticket:${ticketId}`);
    expect(secondConsume).toBeNull();
  });

  it('rejects expired tickets', async () => {
    const redis = new FakeRedisTicketStore();
    const ticketId = crypto.randomBytes(16).toString('hex');
    const ticketData: TicketData = {
      userId: 'user-789',
      workspaceId: 'ws-456',
      role: 'viewer',
      name: 'Bob',
      color: '#3DD68C',
    };

    // Store with 0ms or negative TTL to simulate expiration
    await redis.set(`ticket:${ticketId}`, JSON.stringify(ticketData), -100);

    const consumed = await redis.getdel(`ticket:${ticketId}`);
    expect(consumed).toBeNull();
  });
});

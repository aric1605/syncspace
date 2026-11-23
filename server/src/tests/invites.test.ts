import { describe, it, expect } from 'vitest';
import { Role, isHigherRole } from '../workspaces/roles.js';

describe('Invite Validation and Role Downgrade Prevention', () => {
  interface FakeInvite {
    id: string;
    token: string;
    role: 'editor' | 'viewer';
    expiresAt: Date;
    revoked: boolean;
  }

  class FakeInviteService {
    private members = new Map<string, Role>();
    private invites = new Map<string, FakeInvite>();

    addInvite(invite: FakeInvite) {
      this.invites.set(invite.token, invite);
    }

    setMember(userId: string, role: Role) {
      this.members.set(userId, role);
    }

    getMember(userId: string): Role | undefined {
      return this.members.get(userId);
    }

    acceptInvite(token: string, userId: string): { ok: boolean; role: Role; error?: string } {
      const invite = this.invites.get(token);
      if (!invite) {
        return { ok: false, role: 'viewer', error: 'NOT_FOUND' };
      }

      if (invite.revoked) {
        return { ok: false, role: 'viewer', error: 'INVITE_REVOKED' };
      }

      if (invite.expiresAt < new Date()) {
        return { ok: false, role: 'viewer', error: 'INVITE_EXPIRED' };
      }

      const existingRole = this.members.get(userId);
      if (!existingRole) {
        this.members.set(userId, invite.role);
        return { ok: true, role: invite.role };
      }

      // Never downgrade an existing higher role
      if (isHigherRole(existingRole, invite.role)) {
        return { ok: true, role: existingRole };
      }

      // Upgrade if invite role is higher
      if (isHigherRole(invite.role, existingRole)) {
        this.members.set(userId, invite.role);
        return { ok: true, role: invite.role };
      }

      return { ok: true, role: existingRole };
    }
  }

  it('rejects expired invites', () => {
    const service = new FakeInviteService();
    const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    service.addInvite({
      id: 'inv-1',
      token: 'token-expired',
      role: 'editor',
      expiresAt: pastDate,
      revoked: false,
    });

    const result = service.acceptInvite('token-expired', 'user-1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVITE_EXPIRED');
  });

  it('rejects revoked invites', () => {
    const service = new FakeInviteService();
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24); // tomorrow
    service.addInvite({
      id: 'inv-2',
      token: 'token-revoked',
      role: 'editor',
      expiresAt: futureDate,
      revoked: true,
    });

    const result = service.acceptInvite('token-revoked', 'user-1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVITE_REVOKED');
  });

  it('never downgrades an existing higher role', () => {
    const service = new FakeInviteService();
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
    service.addInvite({
      id: 'inv-viewer',
      token: 'token-viewer',
      role: 'viewer',
      expiresAt: futureDate,
      revoked: false,
    });

    // 1. Existing owner accepts a viewer invite -> remains owner
    service.setMember('owner-user', 'owner');
    const ownerResult = service.acceptInvite('token-viewer', 'owner-user');
    expect(ownerResult.ok).toBe(true);
    expect(ownerResult.role).toBe('owner');
    expect(service.getMember('owner-user')).toBe('owner');

    // 2. Existing editor accepts a viewer invite -> remains editor
    service.setMember('editor-user', 'editor');
    const editorResult = service.acceptInvite('token-viewer', 'editor-user');
    expect(editorResult.ok).toBe(true);
    expect(editorResult.role).toBe('editor');
    expect(service.getMember('editor-user')).toBe('editor');
  });

  it('upgrades a lower role when accepting a higher invite', () => {
    const service = new FakeInviteService();
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
    service.addInvite({
      id: 'inv-editor',
      token: 'token-editor',
      role: 'editor',
      expiresAt: futureDate,
      revoked: false,
    });

    // Existing viewer accepts an editor invite -> upgraded to editor
    service.setMember('viewer-user', 'viewer');
    const result = service.acceptInvite('token-editor', 'viewer-user');
    expect(result.ok).toBe(true);
    expect(result.role).toBe('editor');
    expect(service.getMember('viewer-user')).toBe('editor');
  });
});

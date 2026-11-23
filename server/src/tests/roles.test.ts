import { describe, it, expect } from 'vitest';
import { Role, isRoleSufficient, isHigherRole } from '../workspaces/roles.js';

describe('Role Hierarchy and Rules', () => {
  it('correctly orders owner > editor > viewer permissions', () => {
    // Owner can perform all actions
    expect(isRoleSufficient('owner', 'owner')).toBe(true);
    expect(isRoleSufficient('owner', 'editor')).toBe(true);
    expect(isRoleSufficient('owner', 'viewer')).toBe(true);

    // Editor can perform editor and viewer actions, but not owner
    expect(isRoleSufficient('editor', 'owner')).toBe(false);
    expect(isRoleSufficient('editor', 'editor')).toBe(true);
    expect(isRoleSufficient('editor', 'viewer')).toBe(true);

    // Viewer can only perform viewer actions
    expect(isRoleSufficient('viewer', 'owner')).toBe(false);
    expect(isRoleSufficient('viewer', 'editor')).toBe(false);
    expect(isRoleSufficient('viewer', 'viewer')).toBe(true);
  });

  it('correctly determines higher roles', () => {
    expect(isHigherRole('owner', 'editor')).toBe(true);
    expect(isHigherRole('owner', 'viewer')).toBe(true);
    expect(isHigherRole('editor', 'viewer')).toBe(true);
    expect(isHigherRole('editor', 'owner')).toBe(false);
    expect(isHigherRole('viewer', 'editor')).toBe(false);
    expect(isHigherRole('viewer', 'viewer')).toBe(false);
  });

  describe('Last Owner Protection (Fake Repository)', () => {
    // In-memory fake repository implementation
    class FakeWorkspaceRepo {
      private members = new Map<string, { role: Role }>();

      addMember(userId: string, role: Role) {
        this.members.set(userId, { role });
      }

      countOwners(): number {
        let count = 0;
        for (const m of this.members.values()) {
          if (m.role === 'owner') count++;
        }
        return count;
      }

      demoteMember(userId: string, newRole: Role) {
        const current = this.members.get(userId);
        if (!current) throw new Error('Member not found');

        if (current.role === 'owner' && newRole !== 'owner') {
          if (this.countOwners() <= 1) {
            throw new Error('Cannot demote the last owner of the workspace');
          }
        }
        current.role = newRole;
      }

      removeMember(userId: string) {
        const current = this.members.get(userId);
        if (!current) throw new Error('Member not found');

        if (current.role === 'owner') {
          if (this.countOwners() <= 1) {
            throw new Error('Cannot remove the last owner of the workspace');
          }
        }
        this.members.delete(userId);
      }
    }

    it('prevents demoting the last owner', () => {
      const repo = new FakeWorkspaceRepo();
      repo.addMember('user-1', 'owner');
      repo.addMember('user-2', 'editor');

      expect(() => repo.demoteMember('user-1', 'editor')).toThrow(
        'Cannot demote the last owner of the workspace'
      );

      // Adding a second owner allows demotion of one
      repo.addMember('user-3', 'owner');
      expect(() => repo.demoteMember('user-1', 'editor')).not.toThrow();
    });

    it('prevents removing the last owner', () => {
      const repo = new FakeWorkspaceRepo();
      repo.addMember('user-1', 'owner');

      expect(() => repo.removeMember('user-1')).toThrow(
        'Cannot remove the last owner of the workspace'
      );

      repo.addMember('user-2', 'owner');
      expect(() => repo.removeMember('user-1')).not.toThrow();
    });
  });
});

import * as Y from 'yjs';
import { query } from '../db.js';
import { Role, isHigherRole } from './roles.js';

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  color: string;
  role: Role;
  joinedAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  ownerId: string;
  role: Role;
  createdAt: string;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  token: string;
  role: 'editor' | 'viewer';
  createdBy: string;
  creatorName?: string;
  expiresAt: string;
  revoked: boolean;
  createdAt: string;
}

export const workspaceRepo = {
  async createWorkspace(name: string, ownerId: string): Promise<WorkspaceSummary> {
    const wsResult = await query(
      `INSERT INTO workspaces (name, owner_id)
       VALUES ($1, $2)
       RETURNING id, name, owner_id AS "ownerId", created_at AS "createdAt"`,
      [name, ownerId]
    );
    const ws = wsResult.rows[0];

    // Add owner to members
    await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [ws.id, ownerId]
    );

    // Create empty document row with initial Y.Doc state
    const ydoc = new Y.Doc();
    const emptyState = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    await query(
      `INSERT INTO documents (workspace_id, ydoc_state)
       VALUES ($1, $2)`,
      [ws.id, emptyState]
    );

    return {
      id: ws.id,
      name: ws.name,
      ownerId: ws.ownerId,
      role: 'owner',
      createdAt: ws.createdAt,
    };
  },

  async listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
    const result = await query(
      `SELECT w.id, w.name, w.owner_id AS "ownerId", wm.role, w.created_at AS "createdAt"
       FROM workspaces w
       JOIN workspace_members wm ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async getWorkspace(workspaceId: string) {
    const result = await query(
      `SELECT id, name, owner_id AS "ownerId", created_at AS "createdAt"
       FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    return result.rows[0] || null;
  },

  async getMembership(workspaceId: string, userId: string): Promise<{ role: Role } | null> {
    const result = await query(
      `SELECT role FROM workspace_members
       WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId]
    );
    return result.rows[0] || null;
  },

  async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.color, wm.role, wm.joined_at AS "joinedAt"
       FROM workspace_members wm
       JOIN users u ON wm.user_id = u.id
       WHERE wm.workspace_id = $1
       ORDER BY
         CASE wm.role
           WHEN 'owner' THEN 1
           WHEN 'editor' THEN 2
           WHEN 'viewer' THEN 3
         END,
         u.name ASC`,
      [workspaceId]
    );
    return result.rows;
  },

  async countOwners(workspaceId: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM workspace_members
       WHERE workspace_id = $1 AND role = 'owner'`,
      [workspaceId]
    );
    return result.rows[0]?.count ?? 0;
  },

  async updateMemberRole(workspaceId: string, targetUserId: string, newRole: Role): Promise<void> {
    await query(
      `UPDATE workspace_members
       SET role = $3
       WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, targetUserId, newRole]
    );
  },

  async removeMember(workspaceId: string, targetUserId: string): Promise<void> {
    await query(
      `DELETE FROM workspace_members
       WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, targetUserId]
    );
  },

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
  },

  async createInvite(
    workspaceId: string,
    role: 'editor' | 'viewer',
    createdBy: string,
    token: string,
    expiresAt: Date
  ): Promise<WorkspaceInvite> {
    const result = await query(
      `INSERT INTO invites (workspace_id, role, created_by, token, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, workspace_id AS "workspaceId", token, role, created_by AS "createdBy",
                 expires_at AS "expiresAt", revoked, created_at AS "createdAt"`,
      [workspaceId, role, createdBy, token, expiresAt]
    );
    return result.rows[0];
  },

  async listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    const result = await query(
      `SELECT i.id, i.workspace_id AS "workspaceId", i.token, i.role, i.created_by AS "createdBy",
              u.name AS "creatorName", i.expires_at AS "expiresAt", i.revoked, i.created_at AS "createdAt"
       FROM invites i
       JOIN users u ON i.created_by = u.id
       WHERE i.workspace_id = $1 AND i.revoked = false AND i.expires_at > now()
       ORDER BY i.created_at DESC`,
      [workspaceId]
    );
    return result.rows;
  },

  async getInviteByToken(token: string): Promise<(WorkspaceInvite & { workspaceName: string }) | null> {
    const result = await query(
      `SELECT i.id, i.workspace_id AS "workspaceId", i.token, i.role, i.created_by AS "createdBy",
              i.expires_at AS "expiresAt", i.revoked, i.created_at AS "createdAt",
              w.name AS "workspaceName"
       FROM invites i
       JOIN workspaces w ON i.workspace_id = w.id
       WHERE i.token = $1`,
      [token]
    );
    return result.rows[0] || null;
  },

  async revokeInvite(inviteId: string, workspaceId: string): Promise<boolean> {
    const result = await query(
      `UPDATE invites
       SET revoked = true
       WHERE id = $1 AND workspace_id = $2
       RETURNING id`,
      [inviteId, workspaceId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async revokeInviteById(inviteId: string): Promise<boolean> {
    const result = await query(
      `UPDATE invites
       SET revoked = true
       WHERE id = $1
       RETURNING id`,
      [inviteId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async acceptInvite(
    workspaceId: string,
    userId: string,
    inviteRole: 'editor' | 'viewer'
  ): Promise<{ role: Role }> {
    const existing = await this.getMembership(workspaceId, userId);
    if (!existing) {
      await query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [workspaceId, userId, inviteRole]
      );
      return { role: inviteRole };
    }

    // Never downgrade an existing higher role
    if (isHigherRole(existing.role, inviteRole)) {
      return { role: existing.role };
    }

    // If existing role is lower than invite role, update it
    if (isHigherRole(inviteRole, existing.role)) {
      await this.updateMemberRole(workspaceId, userId, inviteRole);
      return { role: inviteRole };
    }

    return { role: existing.role };
  },
};

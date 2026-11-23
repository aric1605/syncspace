import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { requireRole } from './middleware.js';
import { workspaceRepo } from './repository.js';
import { Role } from './roles.js';
import { getOnlineUsers } from '../presence/presence.js';
import { config } from '../config.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100).trim(),
});

const updateRoleSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer']),
});

const createInviteSchema = z.object({
  role: z.enum(['editor', 'viewer']).default('editor'),
});

// POST /api/workspaces
router.post('/', async (req: Request, res: Response) => {
  const parsed = createWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message || 'Invalid workspace name',
      },
    });
    return;
  }

  try {
    const ws = await workspaceRepo.createWorkspace(parsed.data.name, req.user!.id);
    res.status(201).json({ workspace: ws });
  } catch (err: any) {
    console.error('Failed to create workspace:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create workspace',
      },
    });
  }
});

// GET /api/workspaces
router.get('/', async (req: Request, res: Response) => {
  try {
    const workspaces = await workspaceRepo.listWorkspacesForUser(req.user!.id);
    res.json({ workspaces });
  } catch (err: any) {
    console.error('Failed to list workspaces:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list workspaces',
      },
    });
  }
});

// GET /api/workspaces/:id
router.get('/:id', requireRole('viewer'), async (req: Request, res: Response) => {
  const workspaceId = req.params.id;

  try {
    const workspace = await workspaceRepo.getWorkspace(workspaceId);
    if (!workspace) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Workspace not found',
        },
      });
      return;
    }

    const rawMembers = await workspaceRepo.getMembers(workspaceId);
    const memberIds = rawMembers.map((m) => m.id);
    const onlineMap = await getOnlineUsers(workspaceId, memberIds);

    const members = rawMembers.map((m) => ({
      ...m,
      online: Boolean(onlineMap[m.id]),
    }));

    res.json({
      workspace: {
        ...workspace,
        role: req.workspaceRole,
        members,
      },
    });
  } catch (err: any) {
    console.error('Failed to get workspace:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve workspace details',
      },
    });
  }
});

// DELETE /api/workspaces/:id (owner only)
router.delete('/:id', requireRole('owner'), async (req: Request, res: Response) => {
  const workspaceId = req.params.id;

  try {
    await workspaceRepo.deleteWorkspace(workspaceId);
    res.json({ ok: true, message: 'Workspace deleted successfully' });
  } catch (err: any) {
    console.error('Failed to delete workspace:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete workspace',
      },
    });
  }
});

// PATCH /api/workspaces/:id/members/:userId (owner only; cannot demote last owner)
router.patch('/:id/members/:userId', requireRole('owner'), async (req: Request, res: Response) => {
  const { id: workspaceId, userId: targetUserId } = req.params;

  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid role. Must be owner, editor, or viewer',
      },
    });
    return;
  }

  const newRole = parsed.data.role;

  try {
    const targetMembership = await workspaceRepo.getMembership(workspaceId, targetUserId);
    if (!targetMembership) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Member not found in this workspace',
        },
      });
      return;
    }

    // If demoting an owner
    if (targetMembership.role === 'owner' && newRole !== 'owner') {
      const ownerCount = await workspaceRepo.countOwners(workspaceId);
      if (ownerCount <= 1) {
        res.status(400).json({
          error: {
            code: 'LAST_OWNER',
            message: 'Cannot demote the last owner of the workspace',
          },
        });
        return;
      }
    }

    await workspaceRepo.updateMemberRole(workspaceId, targetUserId, newRole);
    res.json({ ok: true, userId: targetUserId, role: newRole });
  } catch (err: any) {
    console.error('Failed to update member role:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update member role',
      },
    });
  }
});

// DELETE /api/workspaces/:id/members/:userId (owner can remove others; any member can leave unless last owner)
router.delete('/:id/members/:userId', async (req: Request, res: Response) => {
  const { id: workspaceId, userId: targetUserId } = req.params;
  const currentUserId = req.user!.id;

  try {
    const currentMembership = await workspaceRepo.getMembership(workspaceId, currentUserId);
    if (!currentMembership) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You are not a member of this workspace',
        },
      });
      return;
    }

    const isSelf = currentUserId === targetUserId;
    const isOwner = currentMembership.role === 'owner';

    // Must be self leaving or an owner removing someone
    if (!isSelf && !isOwner) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only workspace owners can remove other members',
        },
      });
      return;
    }

    const targetMembership = await workspaceRepo.getMembership(workspaceId, targetUserId);
    if (!targetMembership) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Member not found',
        },
      });
      return;
    }

    // Cannot remove the last owner
    if (targetMembership.role === 'owner') {
      const ownerCount = await workspaceRepo.countOwners(workspaceId);
      if (ownerCount <= 1) {
        res.status(400).json({
          error: {
            code: 'LAST_OWNER',
            message: 'Cannot remove the last owner of the workspace',
          },
        });
        return;
      }
    }

    await workspaceRepo.removeMember(workspaceId, targetUserId);
    res.json({ ok: true, message: 'Member removed successfully' });
  } catch (err: any) {
    console.error('Failed to remove member:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to remove member',
      },
    });
  }
});

// POST /api/workspaces/:id/invites (owner only)
router.post('/:id/invites', requireRole('owner'), async (req: Request, res: Response) => {
  const workspaceId = req.params.id;

  const parsed = createInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Role must be editor or viewer',
      },
    });
    return;
  }

  try {
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await workspaceRepo.createInvite(
      workspaceId,
      parsed.data.role,
      req.user!.id,
      token,
      expiresAt
    );

    const url = `${config.FRONTEND_URL}/invite/${token}`;

    res.status(201).json({
      invite,
      token,
      url,
    });
  } catch (err: any) {
    console.error('Failed to create invite:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate invite link',
      },
    });
  }
});

// GET /api/workspaces/:id/invites (owner only)
router.get('/:id/invites', requireRole('owner'), async (req: Request, res: Response) => {
  const workspaceId = req.params.id;

  try {
    const invites = await workspaceRepo.listInvites(workspaceId);
    const enriched = invites.map((inv) => ({
      ...inv,
      url: `${config.FRONTEND_URL}/invite/${inv.token}`,
    }));
    res.json({ invites: enriched });
  } catch (err: any) {
    console.error('Failed to list invites:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list invites',
      },
    });
  }
});

export const workspaceRouter = router;

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { workspaceRepo } from './repository.js';
import { isRoleSufficient } from './roles.js';

const router = Router();

// GET /api/invites/:token (public metadata preview for the invite page)
router.get('/:token', async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    const invite = await workspaceRepo.getInviteByToken(token);
    if (!invite) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Invite link not found or invalid',
        },
      });
      return;
    }

    const isExpired = new Date(invite.expiresAt) < new Date();

    res.json({
      invite: {
        workspaceId: invite.workspaceId,
        workspaceName: invite.workspaceName,
        role: invite.role,
        revoked: invite.revoked,
        expired: isExpired,
      },
    });
  } catch (err: any) {
    console.error('Error fetching invite:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to verify invite',
      },
    });
  }
});

// POST /api/invites/:token/accept (logged in)
router.post('/:token/accept', requireAuth, async (req: Request, res: Response) => {
  const { token } = req.params;
  const userId = req.user!.id;

  try {
    const invite = await workspaceRepo.getInviteByToken(token);
    if (!invite) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Invite link not found or invalid',
        },
      });
      return;
    }

    if (invite.revoked) {
      res.status(410).json({
        error: {
          code: 'INVITE_REVOKED',
          message: 'This invite link has been revoked',
        },
      });
      return;
    }

    if (new Date(invite.expiresAt) < new Date()) {
      res.status(410).json({
        error: {
          code: 'INVITE_EXPIRED',
          message: 'This invite link has expired',
        },
      });
      return;
    }

    const membership = await workspaceRepo.acceptInvite(
      invite.workspaceId,
      userId,
      invite.role
    );

    res.json({
      ok: true,
      workspaceId: invite.workspaceId,
      role: membership.role,
    });
  } catch (err: any) {
    console.error('Error accepting invite:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to accept invite',
      },
    });
  }
});

// DELETE /api/invites/:inviteId (revoke - must be owner of the workspace)
router.delete('/:inviteId', requireAuth, async (req: Request, res: Response) => {
  const { inviteId } = req.params;
  const userId = req.user!.id;

  try {
    // Check invite details to find workspace
    const inviteResult = await workspaceRepo.listInvites(''); // Or direct query
    // Let's query db directly for the invite
    const raw = await workspaceRepo.getInviteByToken(''); // Let's check invite by ID
    // Let's find workspaceId from invite
    const inviteCheck = await import('../db.js').then((m) =>
      m.query('SELECT workspace_id AS "workspaceId" FROM invites WHERE id = $1', [inviteId])
    );

    if (inviteCheck.rows.length === 0) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Invite not found',
        },
      });
      return;
    }

    const workspaceId = inviteCheck.rows[0].workspaceId;
    const membership = await workspaceRepo.getMembership(workspaceId, userId);

    if (!membership || !isRoleSufficient(membership.role, 'owner')) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only workspace owners can revoke invites',
        },
      });
      return;
    }

    await workspaceRepo.revokeInviteById(inviteId);
    res.json({ ok: true, message: 'Invite revoked successfully' });
  } catch (err: any) {
    console.error('Error revoking invite:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to revoke invite',
      },
    });
  }
});

export const invitesRouter = router;

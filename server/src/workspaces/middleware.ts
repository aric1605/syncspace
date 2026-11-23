import { Request, Response, NextFunction } from 'express';
import { Role, isRoleSufficient } from './roles.js';
import { workspaceRepo } from './repository.js';

declare global {
  namespace Express {
    interface Request {
      workspaceRole?: Role;
    }
  }
}

export function requireRole(minRole: Role) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const workspaceId = req.params.id || req.params.workspaceId;
    if (!workspaceId) {
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Workspace ID parameter is required',
        },
      });
      return;
    }

    try {
      const membership = await workspaceRepo.getMembership(workspaceId, user.id);
      if (!membership) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You are not a member of this workspace',
          },
        });
        return;
      }

      if (!isRoleSufficient(membership.role, minRole)) {
        res.status(403).json({
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: `Action requires ${minRole} role or higher`,
          },
        });
        return;
      }

      req.workspaceRole = membership.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

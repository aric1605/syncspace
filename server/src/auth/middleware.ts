import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './tokens.js';
import { query } from '../db.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  color: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token is missing or malformed',
      },
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication token',
      },
    });
    return;
  }

  try {
    const result = await query<AuthUser>(
      'SELECT id, email, name, color FROM users WHERE id = $1',
      [payload.userId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found',
        },
      });
      return;
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

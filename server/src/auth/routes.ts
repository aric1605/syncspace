import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { hashPassword, comparePassword, getRandomColor } from './passwords.js';
import { signToken } from './tokens.js';
import { checkLoginRateLimit, clearLoginRateLimit } from './rateLimit.js';
import { requireAuth } from './middleware.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('Invalid email address').transform((e) => e.trim().toLowerCase()),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be under 100 characters').trim(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address').transform((e) => e.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message || 'Invalid input data',
      },
    });
    return;
  }

  const { email, name, password } = parsed.data;

  try {
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      res.status(409).json({
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email already exists',
        },
      });
      return;
    }

    const passwordHash = await hashPassword(password);
    const color = getRandomColor();

    const insertResult = await query(
      `INSERT INTO users (email, name, password_hash, color)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, color, created_at AS "createdAt"`,
      [email, name, passwordHash, color]
    );

    const user = insertResult.rows[0];
    const token = signToken({ userId: user.id, email: user.email });

    res.status(201).json({
      token,
      user,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create user account',
      },
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message || 'Invalid input data',
      },
    });
    return;
  }

  const { email, password } = parsed.data;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  const allowed = await checkLoginRateLimit(ip, email);
  if (!allowed) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many login attempts. Please try again in 10 minutes.',
      },
    });
    return;
  }

  try {
    const result = await query(
      `SELECT id, email, name, password_hash, color, created_at AS "createdAt"
       FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
      return;
    }

    const user = result.rows[0];
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
      return;
    }

    await clearLoginRateLimit(ip, email);

    const token = signToken({ userId: user.id, email: user.email });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        color: user.color,
        createdAt: user.createdAt,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to log in',
      },
    });
  }
});

// GET /api/me
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export const authRouter = router;

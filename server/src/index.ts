import http from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { checkDb } from './db.js';
import { checkRedis } from './redis.js';
import { authRouter } from './auth/routes.js';
import { requireAuth } from './auth/middleware.js';
import { workspaceRouter } from './workspaces/routes.js';
import { invitesRouter } from './workspaces/invitesRoutes.js';
import { workspaceRepo } from './workspaces/repository.js';
import { createWsTicket } from './collab/ticket.js';
import { setupCollabServer } from './collab/server.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: [config.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

// Health check endpoint
app.get('/health', async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([checkDb(2000), checkRedis(2000)]);
  const allOk = dbOk && redisOk;
  res.status(allOk ? 200 : 200).json({
    ok: allOk,
    db: dbOk,
    redis: redisOk,
  });
});

// Auth routes
app.use('/api/auth', authRouter);
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Workspaces and Invites routes
app.use('/api/workspaces', workspaceRouter);
app.use('/api/invites', invitesRouter);

// WebSocket ticket endpoint
app.post('/api/ws-ticket', requireAuth, async (req, res) => {
  const { workspaceId } = req.body;
  if (!workspaceId) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'workspaceId is required',
      },
    });
    return;
  }

  try {
    const membership = await workspaceRepo.getMembership(workspaceId, req.user!.id);
    if (!membership) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You are not a member of this workspace',
        },
      });
      return;
    }

    const ticket = await createWsTicket({
      userId: req.user!.id,
      workspaceId,
      role: membership.role,
      name: req.user!.name,
      color: req.user!.color,
    });

    res.json({ ticket });
  } catch (err: any) {
    console.error('Failed to create ws ticket:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate connection ticket',
      },
    });
  }
});

// Root API placeholder
app.get('/api', (_req, res) => {
  res.json({ message: 'SyncSpace API is running' });
});

// Central error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
  });
});

const server = http.createServer(app);

// Initialize real-time WebSocket collab server
setupCollabServer(server);

// Server startup if invoked directly
if (process.env.NODE_ENV !== 'test') {
  server.listen(config.PORT, () => {
    console.log(`🚀 SyncSpace server listening on port ${config.PORT}`);
    console.log(`📡 CORS allowed for: ${config.FRONTEND_URL}`);
  });
}

export { app, server };

import http from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { checkDb } from './db.js';
import { checkRedis } from './redis.js';
import { authRouter } from './auth/routes.js';
import { requireAuth } from './auth/middleware.js';

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

// Server startup if invoked directly
if (process.env.NODE_ENV !== 'test') {
  server.listen(config.PORT, () => {
    console.log(`🚀 SyncSpace server listening on port ${config.PORT}`);
    console.log(`📡 CORS allowed for: ${config.FRONTEND_URL}`);
  });
}

export { app, server };

// In Node 20+, process.loadEnvFile is built-in
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // .env may not exist in test or production environments where env vars are set directly
  }
}
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  FRONTEND_URL: z
    .string()
    .min(1, 'FRONTEND_URL is required')
    .transform((url) => url.replace(/\/+$/, '')),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Configuration error - Missing or invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  // If running in development and vars are missing, we don't throw during build or tests unless loaded
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

export const config = parsed.success
  ? parsed.data
  : {
      PORT: 4000,
      DATABASE_URL: process.env.DATABASE_URL || '',
      REDIS_URL: process.env.REDIS_URL || '',
      JWT_SECRET: process.env.JWT_SECRET || 'a_default_secret_at_least_32_characters_for_tests',
      FRONTEND_URL: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, ''),
      NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
    };

if (config.DATABASE_URL && config.DATABASE_URL.includes('channel_binding')) {
  console.warn(
    '⚠️ WARNING: DATABASE_URL contains "channel_binding". Neon pooled connections require removing &channel_binding=require.'
  );
}

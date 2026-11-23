import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected pg client error', err);
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function checkDb(timeoutMs = 2000): Promise<boolean> {
  try {
    const clientPromise = pool.query('SELECT 1');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB check timeout')), timeoutMs)
    );
    await Promise.race([clientPromise, timeoutPromise]);
    return true;
  } catch (err) {
    return false;
  }
}

import pg from 'pg';
import { env } from './env.ts';

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
});

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function isDbReachable(): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}

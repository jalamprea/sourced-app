import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Type } from '@sinclair/typebox';
import { env } from './env.ts';
import { isDbReachable, pool } from './db.ts';
import { coachRoutes } from './routes/coaches.ts';
import { messageRoutes } from './routes/messages.ts';
import { requestRoutes } from './routes/requests.ts';

const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } });

await app.register(cors, { origin: true });
await app.register(coachRoutes);
await app.register(messageRoutes);
await app.register(requestRoutes);

app.get(
  '/health',
  {
    schema: {
      response: {
        200: Type.Object({ ok: Type.Boolean(), db: Type.Boolean() }),
      },
    },
  },
  async () => {
    const db = await isDbReachable();
    return { ok: db, db };
  },
);

// An in-flight SSE stream holds a pooled pg client, so an unbounded `pool.end()` can
// hang on shutdown — the process keeps the port and the next `tsx watch` restart dies
// with EADDRINUSE. Bound the drain and exit regardless.
const SHUTDOWN_GRACE_MS = 2000;

let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  const forced = setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
  try {
    await app.close();
    await pool.end();
  } catch {
    // Nothing useful to do while going down.
  }
  clearTimeout(forced);
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);

/** The same restart race can leave the port briefly occupied; retry before giving up. */
async function listenWithRetry(attempts = 5): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await app.listen({ port: env.port, host: '0.0.0.0' });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EADDRINUSE' || attempt >= attempts) throw err;
      app.log.warn(`port ${env.port} busy, retry ${attempt}/${attempts - 1}`);
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

await listenWithRetry();

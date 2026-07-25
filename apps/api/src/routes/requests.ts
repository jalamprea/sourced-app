import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';

const TOP_LIMIT = 5;

const RequestList = Type.Array(
  Type.Object({ topic: Type.String(), count: Type.Integer() }),
);

/**
 * Group case- and whitespace-insensitively so "Finanzas", "finanzas" and " finanzas "
 * are one demand rather than three entries of one — a "most requested" list made of
 * singletons reads as broken.
 *
 * The label is the most-used spelling, tie-broken by whichever appeared first. That
 * matters on screen: a plain `mode()` breaks ties arbitrarily and will happily display
 * "finanzas PERSONALES" over "Finanzas personales". Chips always send the same canonical
 * string, so they win the count and typed variants collapse under them.
 */
const TOP_QUERY = `
  with per_spelling as (
    select btrim(topic) as label,
           lower(btrim(topic)) as key,
           count(*) as uses,
           min(created_at) as first_seen
      from coach_requests
     group by btrim(topic)
  )
  select (array_agg(label order by uses desc, first_seen asc))[1] as topic,
         sum(uses)::int as count
    from per_spelling
   group by key
   order by sum(uses) desc, min(first_seen) desc
   limit ${TOP_LIMIT}`;

export async function requestRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/requests', { schema: { response: { 200: RequestList } } }, async () => {
    const { rows } = await pool.query<{ topic: string; count: number }>(TOP_QUERY);
    return rows;
  });

  app.post(
    '/api/requests',
    {
      schema: {
        body: Type.Object({ topic: Type.String({ minLength: 2, maxLength: 60 }) }),
        response: { 200: RequestList },
      },
    },
    async (request) => {
      const { topic } = request.body as { topic: string };
      await pool.query('insert into coach_requests (topic) values ($1)', [topic.trim()]);

      // Return the fresh ranking so the list updates without a second round trip —
      // on stage the new request has to appear the instant it is sent.
      const { rows } = await pool.query<{ topic: string; count: number }>(TOP_QUERY);
      return rows;
    },
  );
}

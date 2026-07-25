import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';
import { DOMAINS, getDomain } from '../personas.ts';

/**
 * Presentation pacing for the training screen, not compute time.
 *
 * Cloning a template coach is genuinely real work — it copies every video and chunk row
 * to the new coach — but it finishes in well under a second, which would make the
 * onboarding screen flash past. Each video is committed on its own and spaced by this
 * delay so the user watches real titles land one by one. The rows, the titles and the
 * counts are all real; only the spacing is for the demo.
 */
const CLONE_PACING_MS = 550;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CreateCoachBody = Type.Object({
  domain: Type.Union(DOMAINS.map((d) => Type.Literal(d.slug))),
  userProfile: Type.Record(Type.String(), Type.String()),
});

const CoachStateResponse = Type.Object({
  id: Type.String(),
  domain: Type.String(),
  status: Type.String(),
  videosReady: Type.Integer(),
  videosTotal: Type.Integer(),
  videos: Type.Array(Type.Object({ title: Type.String(), channel: Type.String() })),
});

const ErrorResponse = Type.Object({ message: Type.String() });

async function templateCoachId(domain: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from coaches where domain = $1 and status = 'template'`,
    [domain],
  );
  return rows[0]?.id ?? null;
}

/**
 * Copy the domain's corpus onto the freshly created coach, one video at a time so
 * `videosReady` climbs while the user watches. Runs detached from the request.
 */
async function cloneCorpus(coachId: string, templateId: string): Promise<void> {
  const { rows: sourceVideos } = await pool.query<{ id: string }>(
    'select id from videos where coach_id = $1 order by created_at, id',
    [templateId],
  );

  for (const source of sourceVideos) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const inserted = await client.query<{ id: string }>(
        `insert into videos (coach_id, youtube_id, title, channel, url)
         select $1, youtube_id, title, channel, url from videos where id = $2
         returning id`,
        [coachId, source.id],
      );
      const newVideoId = inserted.rows[0]!.id;
      await client.query(
        `insert into chunks (video_id, text, start_seconds, embedding)
         select $1, text, start_seconds, embedding from chunks where video_id = $2`,
        [newVideoId, source.id],
      );
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }

    await sleep(CLONE_PACING_MS);
  }

  await pool.query(`update coaches set status = 'ready' where id = $1`, [coachId]);
}

export async function coachRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/domains', async () =>
    DOMAINS.map((d) => ({
      slug: d.slug,
      name: d.name,
      tagline: d.tagline,
      questions: d.questions,
      sampleQuestions: d.sampleQuestions,
    })),
  );

  app.post(
    '/api/coaches',
    { schema: { body: CreateCoachBody, response: { 200: CoachStateResponse, 409: ErrorResponse } } },
    async (request, reply) => {
      const { domain, userProfile } = request.body as {
        domain: string;
        userProfile: Record<string, string>;
      };

      const templateId = await templateCoachId(domain);
      if (!templateId) {
        return reply
          .code(409)
          .send({ message: `el dominio "${domain}" todavía no tiene corpus ingestado` });
      }

      const { rows: videoCount } = await pool.query<{ count: string }>(
        'select count(*)::text as count from videos where coach_id = $1',
        [templateId],
      );
      const videosTotal = Number(videoCount[0]?.count ?? 0);

      const { rows } = await pool.query<{ id: string }>(
        `insert into coaches (domain, persona_prompt, user_profile, status)
         values ($1, $2, $3, 'training') returning id`,
        [domain, getDomain(domain).personaPrompt, JSON.stringify(userProfile)],
      );
      const coachId = rows[0]!.id;

      // Detached on purpose: the client polls GET /api/coaches/:id for progress.
      void cloneCorpus(coachId, templateId).catch(async (err: unknown) => {
        app.log.error({ err, coachId }, 'clone failed');
        await pool
          .query(`update coaches set status = 'failed' where id = $1`, [coachId])
          .catch(() => undefined);
      });

      return { id: coachId, domain, status: 'training', videosReady: 0, videosTotal, videos: [] };
    },
  );

  app.get(
    '/api/coaches/:id',
    { schema: { response: { 200: CoachStateResponse, 404: ErrorResponse } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const { rows } = await pool.query<{ id: string; domain: string; status: string }>(
        'select id, domain, status from coaches where id = $1',
        [id],
      );

      const coach = rows[0];
      if (!coach) return reply.code(404).send({ message: 'coach no encontrado' });

      const { rows: videos } = await pool.query<{ title: string; channel: string }>(
        // Insertion order, so the training screen appends instead of reshuffling.
        'select title, channel from videos where coach_id = $1 order by created_at, id',
        [id],
      );

      const templateId = await templateCoachId(coach.domain);
      const { rows: totals } = await pool.query<{ count: string }>(
        'select count(*)::text as count from videos where coach_id = $1',
        [templateId],
      );

      const videosReady = videos.length;
      const videosTotal = Number(totals[0]?.count ?? 0);

      // Self-heal: a server restart (tsx watch in dev) kills the detached clone and
      // would otherwise leave the coach stuck on 'training' forever. If every video
      // made it across, the coach is ready regardless of who finished the job.
      let status = coach.status;
      if (status === 'training' && videosTotal > 0 && videosReady >= videosTotal) {
        await pool.query(`update coaches set status = 'ready' where id = $1`, [coach.id]);
        status = 'ready';
      }

      return { id: coach.id, domain: coach.domain, status, videosReady, videosTotal, videos };
    },
  );
}

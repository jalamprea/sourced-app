import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import type { Citation } from '@coach/shared';
import { pool } from '../db.ts';
import { GENERIC_PROMPT, buildCoachPrompt } from '../rag/prompt.ts';
import { retrieve } from '../rag/retrieve.ts';
import { streamAnswer, type ChatTurn } from '../rag/stream.ts';

const SendMessageBody = Type.Object({
  content: Type.String({ minLength: 1, maxLength: 2000 }),
  mode: Type.Optional(Type.Union([Type.Literal('coach'), Type.Literal('generic')])),
});

/** Keeps proxies and load balancers from buffering the stream into one chunk. */
const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
};

const HEARTBEAT_MS = 15_000;
const HISTORY_TURNS = 6;

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/coaches/:id/messages', async (request) => {
    const { id } = request.params as { id: string };
    const { rows } = await pool.query<{
      id: string;
      role: string;
      content: string;
      citations: Citation[];
    }>(
      `select id, role, content, citations from messages
        where coach_id = $1 and mode = 'coach' order by seq`,
      [id],
    );
    return rows;
  });

  app.post(
    '/api/coaches/:id/messages',
    { schema: { body: SendMessageBody } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { content, mode = 'coach' } = request.body as {
        content: string;
        mode?: 'coach' | 'generic';
      };

      const { rows: coaches } = await pool.query<{
        persona_prompt: string;
        user_profile: Record<string, unknown>;
      }>('select persona_prompt, user_profile from coaches where id = $1', [id]);
      const coach = coaches[0];
      if (!coach) return reply.code(404).send({ message: 'coach no encontrado' });

      // From here on the response is raw SSE; Fastify must not touch it.
      reply.hijack();
      const res = reply.raw;
      // CORS has to be repeated by hand here. @fastify/cors stages its headers on the
      // reply object and they are only flushed when Fastify sends the response — which
      // hijack() skips by writing straight to the socket. Without this the browser gets
      // a 200 with no allow-origin and rejects it as "Failed to fetch", while curl and
      // the same-origin Vite dev proxy never notice.
      res.writeHead(200, {
        ...SSE_HEADERS,
        'access-control-allow-origin': request.headers.origin ?? '*',
        vary: 'Origin',
      });

      const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const abort = new AbortController();
      request.raw.on('close', () => abort.abort());
      const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

      try {
        let system = GENERIC_PROMPT;
        let citations: Citation[] = [];

        if (mode === 'coach') {
          const chunks = await retrieve(id, content);
          citations = chunks.map((c, i) => ({
            n: i + 1,
            title: c.title,
            channel: c.channel,
            youtubeId: c.youtubeId,
            startSeconds: c.startSeconds,
          }));
          system = buildCoachPrompt(coach.persona_prompt, coach.user_profile, chunks);
        }

        // Citations go out before the first token so the source cards render while the
        // answer is still streaming. That ordering is the beat the demo runs on.
        send('citations', { citations });

        const { rows: past } = await pool.query<{ role: string; content: string }>(
          `select role, content from messages
            where coach_id = $1 and mode = $2
            order by seq desc limit $3`,
          [id, mode, HISTORY_TURNS],
        );
        const history: ChatTurn[] = past
          .reverse()
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        // The Anthropic API requires the first turn to be from the user.
        while (history.length > 0 && history[0]!.role !== 'user') history.shift();
        history.push({ role: 'user', content });

        let answer = '';
        for await (const delta of streamAnswer(system, history, abort.signal)) {
          answer += delta;
          send('token', { text: delta });
        }

        const { rows: saved } = await pool.query<{ id: string }>(
          `insert into messages (coach_id, role, content, citations, mode)
           values ($1, 'user', $2, '[]'::jsonb, $3),
                  ($1, 'assistant', $4, $5::jsonb, $3)
           returning id`,
          [id, content, mode, answer, JSON.stringify(citations)],
        );

        send('done', { messageId: saved[saved.length - 1]?.id ?? '' });
      } catch (err) {
        if (!abort.signal.aborted) {
          app.log.error({ err, coachId: id }, 'chat stream failed');
          send('error', { message: (err as Error).message ?? 'error desconocido' });
        }
      } finally {
        clearInterval(heartbeat);
        res.end();
      }
    },
  );
}

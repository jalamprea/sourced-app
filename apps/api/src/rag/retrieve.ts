import { pool } from '../db.ts';
import { embedAll, toVectorLiteral } from '../ingest/embed.ts';

export interface RetrievedChunk {
  text: string;
  startSeconds: number;
  title: string;
  channel: string;
  youtubeId: string;
  score: number;
}

export const TOP_K = 8;

/**
 * Exact nearest-neighbour scan over the coach's own chunks. `<=>` is cosine distance;
 * OpenAI embeddings arrive normalized. No ANN index and no metadata filtering: a coach
 * holds 75-111 chunks, so a sequential scan is milliseconds and any filter would gut
 * recall on a corpus this small.
 */
export async function retrieve(
  coachId: string,
  query: string,
  k: number = TOP_K,
): Promise<RetrievedChunk[]> {
  const [embedding] = await embedAll([query]);
  if (!embedding) throw new Error('query embedding failed');

  const { rows } = await pool.query<{
    text: string;
    start_seconds: number;
    title: string;
    channel: string;
    youtube_id: string;
    score: string;
  }>(
    `select c.text, c.start_seconds, v.title, v.channel, v.youtube_id,
            (1 - (c.embedding <=> $1::vector))::text as score
       from chunks c
       join videos v on v.id = c.video_id
      where v.coach_id = $2
      order by c.embedding <=> $1::vector
      limit $3`,
    [toVectorLiteral(embedding), coachId, k],
  );

  return rows.map((r) => ({
    text: r.text,
    startSeconds: r.start_seconds,
    title: r.title,
    channel: r.channel,
    youtubeId: r.youtube_id,
    score: Number(r.score),
  }));
}

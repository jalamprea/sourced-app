import { pool } from '../db.ts';

/**
 * Presentation pacing for the training screen, not compute time.
 *
 * Cloning is genuinely real work — every video and chunk row is copied to the new
 * coach — but it finishes in well under a second, which would make the onboarding
 * screen flash past. Each video is committed on its own and spaced by this delay so the
 * user watches real titles land one by one. Rows, titles and counts are all real; only
 * the spacing is for the demo. The seed script passes 0.
 */
export const CLONE_PACING_MS = 550;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function templateCoachId(domain: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from coaches where domain = $1 and status = 'template'`,
    [domain],
  );
  return rows[0]?.id ?? null;
}

/** Copy the template's corpus onto a coach, one video per transaction. */
export async function cloneCorpus(
  coachId: string,
  templateId: string,
  pacingMs: number = CLONE_PACING_MS,
): Promise<number> {
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

    if (pacingMs > 0) await sleep(pacingMs);
  }

  await pool.query(`update coaches set status = 'ready' where id = $1`, [coachId]);
  return sourceVideos.length;
}

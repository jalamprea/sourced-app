/**
 * Ingest CLI — runs offline, never from an endpoint.
 *
 *   pnpm ingest -- --domain fitness
 *   pnpm ingest -- --domain all --max-videos 4
 *
 * Idempotent and resumable: downloads are cached on disk, videos that already have
 * chunks are skipped, and a video that failed halfway leaves no partial rows behind.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.ts';
import { DOMAINS, getDomain } from '../personas.ts';
import { chunkCues } from './chunk.ts';
import { embedAll, toVectorLiteral } from './embed.ts';
import { parseVtt } from './vtt.ts';
import { expandSource, fetchVideo } from './ytdlp.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

interface SeedFile {
  domain: string;
  sources: { url: string }[];
}

// `pnpm ingest -- --domain x` forwards a literal `--`, which would otherwise make
// parseArgs treat every later flag as a positional and silently run with defaults.
const argv = process.argv.slice(2).filter((arg) => arg !== '--');

const { values } = parseArgs({
  args: argv,
  options: {
    domain: { type: 'string', default: 'all' },
    seed: { type: 'string' },
    'max-videos': { type: 'string' },
    // Download, parse and chunk without embedding or touching the database. Warms the
    // on-disk cache and proves the corpus parses, at zero API cost.
    'dry-run': { type: 'boolean', default: false },
  },
});

const maxVideos = values['max-videos'] ? Number(values['max-videos']) : Infinity;
const dryRun = values['dry-run'] === true;

/** Ingestion always writes into the per-domain template; onboarding clones from it. */
async function ensureTemplateCoach(slug: string): Promise<string> {
  const domain = getDomain(slug);
  const existing = await pool.query<{ id: string }>(
    `select id from coaches where domain = $1 and status = 'template'`,
    [slug],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await pool.query<{ id: string }>(
    `insert into coaches (domain, persona_prompt, status) values ($1, $2, 'template') returning id`,
    [slug, domain.personaPrompt],
  );
  return inserted.rows[0]!.id;
}

/** Returns true when the video already holds chunks; clears partial rows otherwise. */
async function alreadyIngested(coachId: string, youtubeId: string): Promise<boolean> {
  const { rows } = await pool.query<{ id: string; chunk_count: string }>(
    `select v.id, count(c.id)::text as chunk_count
       from videos v
       left join chunks c on c.video_id = v.id
      where v.coach_id = $1 and v.youtube_id = $2
      group by v.id`,
    [coachId, youtubeId],
  );

  const row = rows[0];
  if (!row) return false;
  if (Number(row.chunk_count) > 0) return true;

  await pool.query('delete from videos where id = $1', [row.id]);
  return false;
}

async function ingestDomain(slug: string): Promise<void> {
  const seedPath = values.seed ?? resolve(repoRoot, `seeds/${slug}.json`);
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedFile;
  const coachId = dryRun ? '' : await ensureTemplateCoach(slug);

  console.log(`\n=== ${slug}${dryRun ? ' (dry run)' : ` — template coach ${coachId}`}`);

  const videoIds: string[] = [];
  for (const source of seed.sources) {
    for (const id of await expandSource(source.url, 50)) {
      if (!videoIds.includes(id)) videoIds.push(id);
    }
    if (videoIds.length >= maxVideos) break;
  }
  const targets = videoIds.slice(0, maxVideos);

  let skipped = 0;
  let ingested = 0;
  let chunkTotal = 0;
  const failures: { id: string; error: string }[] = [];

  for (const [index, youtubeId] of targets.entries()) {
    const label = `[${index + 1}/${targets.length}] ${youtubeId}`;
    try {
      if (!dryRun && (await alreadyIngested(coachId, youtubeId))) {
        skipped++;
        console.log(`${label} ya ingestado, salteando`);
        continue;
      }

      const meta = await fetchVideo(youtubeId);
      const cues = parseVtt(readFileSync(meta.vttPath, 'utf8'));
      if (cues.length === 0) throw new Error('parser produced no cues');

      const chunks = chunkCues(cues);

      if (dryRun) {
        ingested++;
        chunkTotal += chunks.length;
        const words = cues.reduce((n, c) => n + c.text.split(' ').length, 0);
        console.log(
          `${label} ${String(chunks.length).padStart(3)} chunks  ${String(words).padStart(5)} palabras  ${meta.captionKind.padEnd(6)} ${meta.title.slice(0, 48)}`,
        );
        continue;
      }

      const embeddings = await embedAll(chunks.map((c) => c.text));

      const client = await pool.connect();
      try {
        await client.query('begin');
        const inserted = await client.query<{ id: string }>(
          `insert into videos (coach_id, youtube_id, title, channel, url)
           values ($1, $2, $3, $4, $5) returning id`,
          [coachId, meta.youtubeId, meta.title, meta.channel, meta.url],
        );
        const videoId = inserted.rows[0]!.id;

        for (const [i, chunk] of chunks.entries()) {
          await client.query(
            `insert into chunks (video_id, text, start_seconds, embedding)
             values ($1, $2, $3, $4::vector)`,
            [videoId, chunk.text, chunk.startSeconds, toVectorLiteral(embeddings[i]!)],
          );
        }
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }

      ingested++;
      chunkTotal += chunks.length;
      console.log(
        `${label} ${chunks.length} chunks  ${meta.captionKind.padEnd(6)} ${meta.title.slice(0, 54)}`,
      );
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      failures.push({ id: youtubeId, error: message });
      console.error(`${label} FALLÓ: ${message.split('\n')[0]}`);
    }
  }

  console.log(
    `--- ${slug}: ${ingested} ingestados, ${skipped} salteados, ${failures.length} fallidos, ${chunkTotal} chunks nuevos`,
  );
  for (const f of failures) console.log(`    ${f.id}: ${f.error.split('\n')[0]}`);
}

const slugs =
  values.domain === 'all' ? DOMAINS.map((d) => d.slug) : [getDomain(values.domain!).slug];

try {
  for (const slug of slugs) await ingestDomain(slug);

  if (dryRun) {
    console.log('\ndry run: nada embebido ni escrito en la base. VTT cacheados en .cache/yt/');
    await pool.end();
    process.exit(0);
  }

  const { rows } = await pool.query<{ domain: string; videos: string; chunks: string }>(
    `select c.domain,
            count(distinct v.id)::text as videos,
            count(ch.id)::text as chunks
       from coaches c
       left join videos v on v.coach_id = c.id
       left join chunks ch on ch.video_id = v.id
      where c.status = 'template'
      group by c.domain
      order by c.domain`,
  );
  console.log('\n=== estado del corpus ===');
  for (const r of rows) console.log(`${r.domain.padEnd(8)} ${r.videos} videos  ${r.chunks} chunks`);
} finally {
  await pool.end();
}

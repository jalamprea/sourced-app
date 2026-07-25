import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const CACHE_DIR = resolve(repoRoot, '.cache/yt');

// Spanish titles rather than YouTube's auto-translated ones.
const BASE_ARGS = ['--extractor-args', 'youtube:lang=es', '--no-warnings'];

export interface VideoMeta {
  youtubeId: string;
  title: string;
  channel: string;
  url: string;
  durationSeconds: number;
  /** Absolute path to the downloaded VTT track. */
  vttPath: string;
  captionKind: 'manual' | 'auto';
}

function ensureCache(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
}

interface YtInfo {
  id: string;
  title: string;
  channel?: string;
  uploader?: string;
  duration?: number;
  webpage_url?: string;
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
  entries?: { id: string; url?: string }[];
  _type?: string;
}

/**
 * Everything downloaded here is cached on disk and reused. That is what makes the
 * pipeline resumable and, more importantly, what keeps re-runs off YouTube's rate
 * limiter — the demo corpus must never be re-fetched live.
 */
async function loadInfo(videoId: string): Promise<YtInfo> {
  ensureCache();
  const cached = resolve(CACHE_DIR, `${videoId}.info.json`);
  if (existsSync(cached)) {
    return JSON.parse(readFileSync(cached, 'utf8')) as YtInfo;
  }

  const { stdout } = await run(
    'yt-dlp',
    [`https://www.youtube.com/watch?v=${videoId}`, '-J', '--skip-download', ...BASE_ARGS],
    { maxBuffer: 128 * 1024 * 1024 },
  );
  const info = JSON.parse(stdout) as YtInfo;
  // Persist a trimmed copy: the raw payload is ~500KB of format listings we never read.
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    cached,
    JSON.stringify(
      {
        id: info.id,
        title: info.title,
        channel: info.channel ?? info.uploader,
        duration: info.duration,
        webpage_url: info.webpage_url,
        subtitles: Object.fromEntries(Object.keys(info.subtitles ?? {}).map((k) => [k, true])),
        automatic_captions: Object.fromEntries(
          Object.keys(info.automatic_captions ?? {}).map((k) => [k, true]),
        ),
      },
      null,
      2,
    ),
  );
  return info;
}

/** Prefer a manual Spanish track — it needs no rolling-window de-duplication. */
function pickTrack(info: YtInfo): { lang: string; kind: 'manual' | 'auto' } | null {
  const isEs = (k: string) => /^es(-|$)/i.test(k);
  const manual = Object.keys(info.subtitles ?? {}).filter(isEs);
  if (manual.length > 0) {
    // Plain "es" beats regional variants like es-419 when both exist.
    const exact = manual.find((k) => k.toLowerCase() === 'es');
    return { lang: exact ?? manual[0]!, kind: 'manual' };
  }
  const auto = Object.keys(info.automatic_captions ?? {}).filter(isEs);
  if (auto.length > 0) {
    const preferred = auto.find((k) => k.toLowerCase() === 'es-orig') ?? auto.find((k) => k.toLowerCase() === 'es');
    return { lang: preferred ?? auto[0]!, kind: 'auto' };
  }
  return null;
}

function cachedVtt(videoId: string, lang: string): string | null {
  const exact = resolve(CACHE_DIR, `${videoId}.${lang}.vtt`);
  if (existsSync(exact)) return exact;
  // yt-dlp occasionally normalizes the language suffix; accept any es* track we already have.
  const found = readdirSync(CACHE_DIR).find(
    (f) => f.startsWith(`${videoId}.`) && f.endsWith('.vtt'),
  );
  return found ? resolve(CACHE_DIR, found) : null;
}

export async function fetchVideo(videoId: string): Promise<VideoMeta> {
  ensureCache();
  const info = await loadInfo(videoId);

  const track = pickTrack(info);
  if (!track) throw new Error(`no Spanish captions for ${videoId}`);

  let vttPath = cachedVtt(videoId, track.lang);
  if (!vttPath) {
    await run('yt-dlp', [
      `https://www.youtube.com/watch?v=${videoId}`,
      '--skip-download',
      track.kind === 'manual' ? '--write-subs' : '--write-auto-subs',
      '--sub-langs',
      track.lang,
      '--sub-format',
      'vtt',
      '-o',
      resolve(CACHE_DIR, '%(id)s.%(ext)s'),
      ...BASE_ARGS,
    ]);
    vttPath = cachedVtt(videoId, track.lang);
  }
  if (!vttPath) throw new Error(`subtitle download produced no file for ${videoId}`);

  return {
    youtubeId: videoId,
    title: info.title,
    channel: info.channel ?? info.uploader ?? 'desconocido',
    url: info.webpage_url ?? `https://www.youtube.com/watch?v=${videoId}`,
    durationSeconds: info.duration ?? 0,
    vttPath,
    captionKind: track.kind,
  };
}

const VIDEO_ID = /(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/;

/** Accepts video, playlist and channel URLs; playlists are expanded flat. */
export async function expandSource(url: string, limit: number): Promise<string[]> {
  const direct = VIDEO_ID.exec(url);
  if (direct) return [direct[1]!];

  const { stdout } = await run(
    'yt-dlp',
    [url, '--flat-playlist', '-J', ...BASE_ARGS],
    { maxBuffer: 128 * 1024 * 1024 },
  );
  const info = JSON.parse(stdout) as YtInfo;
  if (!info.entries) return info.id ? [info.id] : [];
  return info.entries.slice(0, limit).map((e) => e.id);
}

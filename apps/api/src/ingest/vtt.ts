/**
 * WebVTT parser for YouTube subtitles.
 *
 * YouTube ships two very different shapes and a single strategy mishandles one of them:
 *
 * 1. Manual captions — clean, non-overlapping cues whose body is 1-2 lines that are ALL
 *    new content, plus HTML entities (`&nbsp;`).
 *
 *        00:00:00.000 --> 00:00:04.080
 *        Hola amigas Qué tal estáis bienvenidas a&nbsp;
 *        chincha raviña un jueves Más Cómo podemos&nbsp;&nbsp;
 *
 * 2. Auto-generated captions — a rolling two-line display. Each content cue repeats the
 *    previous line and appends the new one with per-word timing markup, and between them
 *    sit ~10ms "bridge" cues that only restate the completed line.
 *
 *        00:00:02.100 --> 00:00:04.849 align:start position:0%
 *        cuál es tu forma de cuerpo esto no tiene      <- repeat of the previous cue
 *        nada<00:00:02.250><c> que</c><00:00:02.520><c> ver</c>   <- the new content
 *
 *    Concatenating raw cue text here yields 2-3x duplicated transcript.
 *
 * Strategy: drop bridge cues by duration, then take every line for manual captions but
 * only the last line for rolling ones, and finally drop any line identical to the one
 * just emitted.
 */

export interface Cue {
  startSeconds: number;
  text: string;
}

const CUE_TIME =
  /^(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})/;

/** Cues shorter than this are the rolling-window bridges, never real speech. */
const BRIDGE_MAX_SECONDS = 0.05;

/** Non-speech annotations YouTube inserts: [Música], [Aplausos], (risas)... */
const NON_SPEECH = /^[\[(][^\])]*[\])]$/;

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

/** Strip `<00:00:01.234>` timestamps and `<c>`/`</c>` styling, decode entities, collapse space. */
function cleanLine(line: string): string {
  return decodeEntities(line.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function toSeconds(
  hh: string | undefined,
  mm: string | undefined,
  ss: string | undefined,
  ms: string | undefined,
): number {
  return (
    Number(hh ?? 0) * 3600 + Number(mm ?? 0) * 60 + Number(ss ?? 0) + Number(ms ?? 0) / 1000
  );
}

interface RawCue {
  start: number;
  end: number;
  lines: string[];
}

function splitCues(raw: string): RawCue[] {
  const blocks = raw.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const cues: RawCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIndex = lines.findIndex((l) => CUE_TIME.test(l));
    if (timeIndex === -1) continue; // WEBVTT header, NOTE blocks, styling blocks

    const match = CUE_TIME.exec(lines[timeIndex] ?? '');
    if (!match) continue;

    cues.push({
      start: toSeconds(match[1], match[2], match[3], match[4]),
      end: toSeconds(match[5], match[6], match[7], match[8]),
      lines: lines.slice(timeIndex + 1),
    });
  }

  return cues;
}

export function parseVtt(raw: string): Cue[] {
  // Per-word timing markup only ever appears in the rolling auto-caption format.
  const rolling = /<\d{2}:\d{2}:\d{2}\.\d{3}>/.test(raw) || /<c[.>]/.test(raw);

  const cues: Cue[] = [];
  let previous = '';

  for (const cue of splitCues(raw)) {
    if (cue.end - cue.start < BRIDGE_MAX_SECONDS) continue;

    const cleaned = cue.lines.map(cleanLine).filter((l) => l.length > 0 && !NON_SPEECH.test(l));
    if (cleaned.length === 0) continue;

    // Rolling captions repeat earlier lines; only the final line is new.
    const text = rolling ? (cleaned[cleaned.length - 1] ?? '') : cleaned.join(' ');
    if (!text || text === previous) continue;

    previous = text;
    cues.push({ startSeconds: Math.floor(cue.start), text });
  }

  return cues;
}

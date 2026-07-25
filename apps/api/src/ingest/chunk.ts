import type { Cue } from './vtt.ts';

export interface Chunk {
  text: string;
  /** Start of the first cue in the chunk — this is what citation links point at. */
  startSeconds: number;
}

/** ~500 tokens of Spanish. No overlap: it would blur which second a citation refers to. */
const TARGET_CHARS = 1800;
const MIN_TAIL_CHARS = 400;

export function chunkCues(cues: Cue[], targetChars = TARGET_CHARS): Chunk[] {
  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let length = 0;
  let startSeconds = 0;

  for (const cue of cues) {
    if (buffer.length === 0) startSeconds = cue.startSeconds;
    buffer.push(cue.text);
    length += cue.text.length + 1;

    if (length >= targetChars) {
      chunks.push({ text: buffer.join(' '), startSeconds });
      buffer = [];
      length = 0;
    }
  }

  if (buffer.length > 0) {
    const tail = { text: buffer.join(' '), startSeconds };
    const previous = chunks[chunks.length - 1];
    // A stub tail embeds poorly; fold it back into the previous chunk instead.
    if (previous && tail.text.length < MIN_TAIL_CHARS) {
      previous.text = `${previous.text} ${tail.text}`;
    } else {
      chunks.push(tail);
    }
  }

  return chunks;
}

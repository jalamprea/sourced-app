import type { Citation } from '@coach/shared';

const MARKER = /\[(\d{1,2})\]/g;

export const youtubeLink = (c: Citation) =>
  `https://www.youtube.com/watch?v=${c.youtubeId}&t=${c.startSeconds}s`;

export const mmss = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * Turns the model's bare `[n]` markers into links at the exact second of the source.
 * The model never emits URLs — it would hallucinate video ids and break mid-token while
 * streaming — so the mapping happens here against the citation list the server sent
 * before the first token.
 */
export function CitedText({ text, citations }: { text: string; citations: Citation[] }) {
  const byNumber = new Map(citations.map((c) => [c.n, c]));
  const parts: React.ReactNode[] = [];

  let cursor = 0;
  let match: RegExpExecArray | null;
  MARKER.lastIndex = 0;

  while ((match = MARKER.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));

    const citation = byNumber.get(Number(match[1]));
    if (citation) {
      parts.push(
        <a
          key={`${match.index}-${citation.n}`}
          href={youtubeLink(citation)}
          target="_blank"
          rel="noreferrer"
          title={`${citation.title} — ${mmss(citation.startSeconds)}`}
          className="mx-0.5 inline-flex h-[1.15em] min-w-[1.15em] items-center justify-center rounded-[3px] bg-[var(--accent)] px-1 align-baseline text-[0.7em] font-bold text-[var(--on-accent)] no-underline transition-opacity hover:opacity-80"
        >
          {citation.n}
        </a>,
      );
    } else {
      parts.push(match[0]);
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}

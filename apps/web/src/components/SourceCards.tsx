import type { Citation } from '@coach/shared';
import { mmss, youtubeLink } from './CitedText.tsx';

/**
 * Rendered the moment the `citations` frame arrives — before the first token — so the
 * sources are on screen while the answer is still being written.
 */
export function SourceCards({ citations, used }: { citations: Citation[]; used: Set<number> }) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="font-body text-[10px] tracking-[0.28em] text-muted uppercase">
        {used.size > 0 ? `${used.size} fuentes citadas` : 'Consultando fuentes'}
      </p>

      <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {citations.map((c) => {
          const isUsed = used.has(c.n);
          return (
            <li key={c.n} className="shrink-0">
              <a
                href={youtubeLink(c)}
                target="_blank"
                rel="noreferrer"
                className={`flex w-52 flex-col gap-1.5 rounded-sm border p-3 transition-all duration-300 ${
                  isUsed
                    ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]'
                    : 'border-hairline bg-surface opacity-45'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`flex size-4 items-center justify-center rounded-[3px] text-[10px] font-bold ${
                      isUsed
                        ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                        : 'bg-hairline text-muted'
                    }`}
                  >
                    {c.n}
                  </span>
                  <span className="font-body text-[11px] tabular-nums text-[var(--accent)]">
                    {mmss(c.startSeconds)}
                  </span>
                </span>
                <span className="line-clamp-2 font-body text-xs leading-snug">{c.title}</span>
                <span className="truncate font-body text-[11px] text-muted">{c.channel}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

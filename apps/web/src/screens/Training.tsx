import { useEffect, useState } from 'react';
import type { Coach, DomainSlug } from '@coach/shared';
import { getCoach } from '../api.ts';
import { accentVars } from '../theme.ts';

interface Props {
  coachId: string;
  domainName: string;
  domainSlug: DomainSlug;
  onReady: (coach: Coach) => void;
}

const POLL_MS = 400;

export function Training({ coachId, domainName, domainSlug, onReady }: Props) {
  const [coach, setCoach] = useState<Coach | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const next = await getCoach(coachId);
        if (cancelled) return;
        setCoach(next);

        if (next.status === 'ready') {
          // Let the last row land before advancing.
          setTimeout(() => !cancelled && onReady(next), 700);
          return;
        }
        if (next.status === 'failed') {
          setError('El entrenamiento falló. Prueba de nuevo.');
          return;
        }
        setTimeout(poll, POLL_MS);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [coachId, onReady]);

  const ready = coach?.videosReady ?? 0;
  const total = coach?.videosTotal ?? 0;
  const pct = total > 0 ? ready / total : 0;

  return (
    <main
      style={accentVars(domainSlug)}
      className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-7 py-14 sm:px-10"
    >
      <p className="font-body text-xs tracking-[0.35em] text-muted uppercase">{domainName}</p>

      <h2 className="mt-6 font-display text-4xl leading-[1.05] sm:text-5xl">
        Entrenando tu coach
        <span className="text-[var(--accent)]">.</span>
      </h2>

      <div className="mt-10 flex items-baseline gap-3">
        <span className="font-display text-6xl tabular-nums text-[var(--accent)] sm:text-7xl">
          {String(ready).padStart(2, '0')}
        </span>
        <span className="font-body text-lg tabular-nums text-muted">
          / {String(total).padStart(2, '0')} videos
        </span>
      </div>

      <div className="mt-5 h-0.5 w-full overflow-hidden bg-hairline">
        <div
          className="h-full bg-[var(--accent)] transition-transform duration-500 ease-out"
          style={{ transform: `scaleX(${pct})`, transformOrigin: 'left' }}
        />
      </div>

      {error ? (
        <p className="mt-8 font-body text-sm text-style">{error}</p>
      ) : (
        <ul className="mt-10 flex flex-col gap-px">
          {coach?.videos.map((video, i) => (
            <li
              key={`${video.title}-${i}`}
              className="rise flex items-baseline gap-4 border-b border-hairline py-3"
            >
              <span className="font-body text-[11px] tabular-nums text-[var(--accent)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-body text-sm">{video.title}</span>
                <span className="mt-0.5 block font-body text-xs text-muted">{video.channel}</span>
              </span>
              <span aria-hidden className="font-body text-xs text-[var(--accent)]">
                ✓
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 font-body text-xs leading-relaxed text-muted">
        Copiando transcripciones y vectores de {total} videos a tu coach. Nada se descarga de
        YouTube en este paso.
      </p>
    </main>
  );
}

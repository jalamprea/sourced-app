import type { DomainSlug, DomainSummary } from '@coach/shared';
import { coachIdFor } from '../api.ts';
import { Stars } from '../components/Stars.tsx';
import { ACCENT } from '../theme.ts';

interface Props {
  domains: DomainSummary[];
  onPick: (domain: DomainSummary) => void;
}

export function DomainPicker({ domains, onPick }: Props) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-7 py-14 sm:px-10">
      <header className="rise">
        <p className="font-body text-xs tracking-[0.35em] text-muted uppercase">Sourced</p>
        <h1 className="mt-6 font-display text-5xl leading-[0.95] sm:text-7xl">
          Elige tu
          <br />
          <em className="italic">Coach Experto</em>.
        </h1>
        <p className="mt-6 max-w-md font-body text-[15px] leading-relaxed text-muted">
          Cada coach fue entrenado con contenido real y curado por nuestros especialistas.
        </p>
      </header>

      <ul className="mt-14 flex flex-col">
        {domains.map((domain, index) => {
          const accent = ACCENT[domain.slug as DomainSlug];
          // Read at render: always current, and no state to keep in sync with storage.
          const started = coachIdFor(domain.slug) !== null;
          return (
            <li key={domain.slug} className="rise" style={{ animationDelay: `${120 + index * 90}ms` }}>
              <button
                type="button"
                onClick={() => onPick(domain)}
                style={{ '--accent': accent } as React.CSSProperties}
                className="group relative flex w-full items-baseline gap-5 border-t border-hairline py-7 text-left transition-colors last:border-b hover:border-[var(--accent)]"
              >
                <span className="font-body text-xs tabular-nums text-muted transition-colors group-hover:text-[var(--accent)]">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <span className="flex-1">
                  <span className="block font-display text-3xl leading-tight transition-colors group-hover:text-[var(--accent)] sm:text-4xl">
                    {domain.name}
                  </span>
                  <span className="mt-2 block max-w-sm font-body text-sm leading-relaxed text-muted">
                    {started ? 'Continuar tu conversación' : domain.tagline}
                  </span>

                  {domain.rating.count > 0 && (
                    <span
                      className="mt-2.5 flex items-center gap-2"
                      style={{ '--accent': accent } as React.CSSProperties}
                    >
                      <Stars value={domain.rating.average} />
                      <span className="font-body text-[11px] tabular-nums text-muted">
                        {domain.rating.average.toFixed(1)} · {domain.rating.count}{' '}
                        {domain.rating.count === 1 ? 'calificación' : 'calificaciones'}
                      </span>
                    </span>
                  )}
                </span>

                {started && (
                  <span className="shrink-0 self-center rounded-full bg-[var(--accent)] px-2 py-0.5 font-body text-[10px] font-bold tracking-wide text-[var(--on-accent)] uppercase">
                    Activo
                  </span>
                )}

                {/* Inset from the row edge, and the nudge is pointer-only: on touch the
                    browser fires :hover on tap, which would slide the glyph toward the
                    screen edge at the exact moment the user is looking at it. */}
                <span
                  aria-hidden
                  className="shrink-0 pr-1 font-body text-2xl text-muted transition-all duration-300 group-hover:text-[var(--accent)] sm:pr-0 sm:group-hover:translate-x-1"
                >
                  →
                </span>

                {/* Accent wipe on hover — the only motion on this screen, so it reads. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 -top-px h-px origin-left scale-x-0 bg-[var(--accent)] transition-transform duration-500 group-hover:scale-x-100"
                />
              </button>
            </li>
          );
        })}
      </ul>

      {/* How it works belongs here, not in the headline: at this point the user is
          choosing a topic, not evaluating an architecture. */}
      <footer className="mt-12 max-w-lg font-body text-[11px] leading-relaxed text-muted">
        Los coaches se entrenan con transcripciones de videos de especialistas. Cada
        respuesta cita el video y el minuto exacto del que sale, para que puedas
        verificarla tú mismo.
      </footer>
    </main>
  );
}

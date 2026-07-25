import type { DomainSlug, DomainSummary } from '@coach/shared';
import { ACCENT } from '../theme.ts';

interface Props {
  domains: DomainSummary[];
  onPick: (domain: DomainSummary) => void;
}

export function DomainPicker({ domains, onPick }: Props) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 py-14 sm:px-10">
      <header className="rise">
        <p className="font-body text-xs tracking-[0.35em] text-muted uppercase">
          Entrenado con expertos reales
        </p>
        <h1 className="mt-6 font-display text-5xl leading-[0.95] sm:text-7xl">
          Elegí en qué
          <br />
          querés <em className="italic">mejorar</em>.
        </h1>
        <p className="mt-6 max-w-md font-body text-[15px] leading-relaxed text-muted">
          Cada coach se entrena con transcripciones de especialistas en YouTube. Todo lo que te
          diga va a venir con la fuente y el minuto exacto.
        </p>
      </header>

      <ul className="mt-14 flex flex-col">
        {domains.map((domain, index) => {
          const accent = ACCENT[domain.slug as DomainSlug];
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
                    {domain.tagline}
                  </span>
                </span>

                <span
                  aria-hidden
                  className="font-body text-2xl text-muted transition-all duration-300 group-hover:translate-x-1 group-hover:text-[var(--accent)]"
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
    </main>
  );
}

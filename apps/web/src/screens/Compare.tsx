import { useCallback, useRef, useState } from 'react';
import type { Citation, Coach, DomainSlug, DomainSummary } from '@coach/shared';
import { openChatStream, readSSE } from '../sse.ts';
import { accentVars } from '../theme.ts';
import { CitedText } from '../components/CitedText.tsx';
import { SourceCards } from '../components/SourceCards.tsx';

interface Side {
  content: string;
  citations: Citation[];
  streaming: boolean;
  error: string | null;
}

const EMPTY: Side = { content: '', citations: [], streaming: false, error: null };

const usedMarkers = (text: string): Set<number> => {
  const used = new Set<number>();
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) used.add(Number(m[1]));
  return used;
};

interface Props {
  coach: Coach;
  domain: DomainSummary;
  onBack: () => void;
}

/**
 * The moment the whole project exists to produce: one question, two answers, and the
 * difference visible before a single word is read — the coach pane wears the domain
 * accent and carries source cards, the generic pane is deliberately grey and bare.
 *
 * Two independent SSE connections rather than one multiplexed stream: simpler, and one
 * side failing on stage does not take the other down with it.
 */
export function Compare({ coach, domain, onBack }: Props) {
  const [draft, setDraft] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [generic, setGeneric] = useState<Side>(EMPTY);
  const [expert, setExpert] = useState<Side>(EMPTY);
  const running = useRef(false);

  const ask = useCallback(
    async (question: string) => {
      const content = question.trim();
      if (!content || running.current) return;

      running.current = true;
      setAsked(content);
      setDraft('');
      setGeneric({ ...EMPTY, streaming: true });
      setExpert({ ...EMPTY, streaming: true });

      const abort = new AbortController();

      const run = async (
        mode: 'coach' | 'generic',
        set: React.Dispatch<React.SetStateAction<Side>>,
      ) => {
        try {
          const response = await openChatStream(coach.id, content, mode, abort.signal);
          for await (const event of readSSE(response)) {
            if (event.type === 'citations') {
              set((s) => ({ ...s, citations: event.citations }));
            } else if (event.type === 'token') {
              set((s) => ({ ...s, content: s.content + event.text }));
            } else if (event.type === 'error') {
              set((s) => ({ ...s, error: event.message }));
            }
          }
        } catch (err) {
          set((s) => ({ ...s, error: (err as Error).message }));
        } finally {
          set((s) => ({ ...s, streaming: false }));
        }
      };

      // Both sides fire together so the panes fill side by side, not one after the other.
      await Promise.all([run('generic', setGeneric), run('coach', setExpert)]);
      running.current = false;
    },
    [coach.id],
  );

  const busy = generic.streaming || expert.streaming;

  return (
    <div
      style={accentVars(coach.domain as DomainSlug)}
      className="mx-auto flex h-full w-full max-w-5xl flex-col px-5 sm:px-8"
    >
      <header className="flex items-center justify-between border-b border-hairline py-5">
        <button
          type="button"
          onClick={onBack}
          className="font-body text-sm text-muted transition-colors hover:text-paper"
        >
          ← Volver al chat
        </button>
        <p className="font-body text-[10px] tracking-[0.3em] text-muted uppercase">
          Modo comparación
        </p>
      </header>

      <div className="flex-1 overflow-y-auto py-8">
        {!asked && (
          <div className="rise">
            <h2 className="font-display text-4xl leading-[1.05] sm:text-5xl">
              La misma pregunta,
              <br />
              <em className="italic text-[var(--accent)]">dos respuestas</em>.
            </h2>
            <p className="mt-4 max-w-lg font-body text-sm leading-relaxed text-muted">
              A la izquierda, un modelo genérico sin fuentes. A la derecha, tu coach
              entrenado con {coach.videosReady} videos de especialistas. Mismo modelo, mismos
              parámetros: lo único que cambia es el material.
            </p>

            <ul className="mt-8 flex flex-wrap gap-2">
              {domain.sampleQuestions.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => void ask(q)}
                    className="rounded-full border border-hairline bg-surface px-4 py-2 font-body text-[13px] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {asked && (
          <>
            <p className="font-display text-2xl leading-snug sm:text-3xl">{asked}</p>

            <div className="mt-8 grid gap-8 sm:grid-cols-2 sm:gap-6">
              <Pane
                label="LLM genérico"
                sublabel="Sin fuentes"
                side={generic}
                muted
              />
              <Pane
                label="Tu coach"
                sublabel={`${coach.videosReady} videos de expertos`}
                side={expert}
              />
            </div>
          </>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
        className="sticky bottom-0 flex items-center gap-2 border-t border-hairline bg-ink py-4"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Pregunta lo mismo a los dos…"
          disabled={busy}
          className="flex-1 rounded-sm border border-hairline bg-surface px-4 py-3 font-body text-[15px] outline-none transition-colors placeholder:text-muted focus:border-[var(--accent)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          className="rounded-sm bg-[var(--accent)] px-5 py-3 font-body text-sm font-bold text-[var(--on-accent)] transition-opacity disabled:opacity-30"
        >
          {busy ? '…' : 'Comparar'}
        </button>
      </form>
    </div>
  );
}

function Pane({
  label,
  sublabel,
  side,
  muted = false,
}: {
  label: string;
  sublabel: string;
  side: Side;
  muted?: boolean;
}) {
  return (
    <section className={muted ? 'opacity-70' : undefined}>
      <div
        className={`flex items-baseline justify-between border-t-2 pb-3 pt-3 ${
          muted ? 'border-hairline' : 'border-[var(--accent)]'
        }`}
      >
        <h3
          className={`font-body text-xs font-bold tracking-[0.2em] uppercase ${
            muted ? 'text-muted' : 'text-[var(--accent)]'
          }`}
        >
          {label}
        </h3>
        <span className="font-body text-[11px] text-muted">{sublabel}</span>
      </div>

      {side.error ? (
        <p className="mt-4 font-body text-sm text-style">{side.error}</p>
      ) : (
        <>
          <p className="mt-4 font-body text-[14px] leading-[1.7] whitespace-pre-wrap">
            {muted ? side.content : <CitedText text={side.content} citations={side.citations} />}
            {side.streaming && (
              <span
                className={`ml-0.5 inline-block h-4 w-[2px] animate-pulse align-middle ${
                  muted ? 'bg-muted' : 'bg-[var(--accent)]'
                }`}
              />
            )}
          </p>
          {!muted && <SourceCards citations={side.citations} used={usedMarkers(side.content)} />}
        </>
      )}
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Citation, Coach, DomainSlug } from '@coach/shared';
import { getMessages, rateCoach } from '../api.ts';
import { openChatStream, readSSE } from '../sse.ts';
import { accentVars } from '../theme.ts';
import { CitedText } from '../components/CitedText.tsx';
import { ChatMenu } from '../components/ChatMenu.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { Stars } from '../components/Stars.tsx';
import { SourceCards } from '../components/SourceCards.tsx';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
}

interface Props {
  coach: Coach;
  domainName: string;
  /** Back to the picker, conversation intact. */
  onHome: () => void;
  /** Drops this coach and its conversation for good. */
  onReset: () => void;
  onCompare: () => void;
}

const usedMarkers = (text: string): Set<number> => {
  const used = new Set<number>();
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) used.add(Number(m[1]));
  return used;
};

export function Chat({ coach, domainName, onHome, onReset, onCompare }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'none' | 'rate' | 'reset'>('none');
  const [rated, setRated] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getMessages(coach.id)
      .then((history) =>
        setTurns(
          history.map((m) => ({
            role: m.role,
            content: m.content,
            citations: m.citations ?? [],
          })),
        ),
      )
      .catch(() => undefined);
  }, [coach.id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || streaming) return;

    setDraft('');
    setError(null);
    setStreaming(true);
    setTurns((prev) => [
      ...prev,
      { role: 'user', content, citations: [] },
      { role: 'assistant', content: '', citations: [] },
    ]);

    const abort = new AbortController();
    try {
      const response = await openChatStream(coach.id, content, 'coach', abort.signal);

      for await (const event of readSSE(response)) {
        if (event.type === 'citations') {
          setTurns((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last) next[next.length - 1] = { ...last, citations: event.citations };
            return next;
          });
        } else if (event.type === 'token') {
          setTurns((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last) next[next.length - 1] = { ...last, content: last.content + event.text };
            return next;
          });
        } else if (event.type === 'error') {
          setError(event.message);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStreaming(false);
    }
  }, [coach.id, draft, streaming]);

  return (
    <div
      style={accentVars(coach.domain as DomainSlug)}
      className="mx-auto flex h-full w-full max-w-2xl flex-col px-7 sm:px-10"
    >
      <header className="flex items-center justify-between gap-3 border-b border-hairline py-5">
        <div className="min-w-0">
          {/* Home keeps the coach: the conversation is still here when you come back. */}
          <button
            type="button"
            onClick={onHome}
            className="font-body text-[10px] tracking-[0.3em] text-muted uppercase transition-colors hover:text-paper"
          >
            ← Sourced
          </button>
          <h1 className="truncate font-display text-2xl leading-tight">
            {domainName}
            <span className="text-[var(--accent)]">.</span>
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <p className="hidden font-body text-[11px] tabular-nums text-muted sm:block">
            {coach.videosReady} videos · {new Set(coach.videos.map((v) => v.channel)).size}{' '}
            fuentes
          </p>
          <button
            type="button"
            onClick={onCompare}
            className="rounded-sm border border-[var(--accent)] px-3 py-2 font-body text-[11px] font-bold tracking-wide text-[var(--accent)] uppercase transition-colors hover:bg-[var(--accent)] hover:text-[var(--on-accent)]"
          >
            Comparar
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto py-8">
        {turns.length === 0 && (
          <div className="rise">
            <h2 className="font-display text-3xl leading-tight sm:text-4xl">
              Pregúntame lo que quieras.
            </h2>
            <p className="mt-3 max-w-md font-body text-sm leading-relaxed text-muted">
              Todo lo que te responda va a venir con la fuente y el minuto exacto del video.
              Toca el número para ir directo ahí.
            </p>
          </div>
        )}

        <ul className="flex flex-col gap-8">
          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <li key={i} className="rise self-end">
                <p className="max-w-md rounded-sm bg-surface px-4 py-3 font-body text-[15px] leading-relaxed">
                  {turn.content}
                </p>
              </li>
            ) : (
              <li key={i} className="rise">
                <p className="font-body text-[15px] leading-[1.7] whitespace-pre-wrap">
                  <CitedText text={turn.content} citations={turn.citations} />
                  {streaming && i === turns.length - 1 && (
                    <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[var(--accent)] align-middle" />
                  )}
                </p>
                <SourceCards
                  citations={turn.citations}
                  used={usedMarkers(turn.content)}
                />
              </li>
            ),
          )}
        </ul>

        {error && <p className="mt-6 font-body text-sm text-style">{error}</p>}

        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="sticky bottom-0 flex items-center gap-2 border-t border-hairline bg-ink py-4"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe tu pregunta…"
          disabled={streaming}
          className="flex-1 rounded-sm border border-hairline bg-surface px-4 py-3 font-body text-[15px] outline-none transition-colors placeholder:text-muted focus:border-[var(--accent)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || draft.trim().length === 0}
          className="rounded-sm bg-[var(--accent)] px-5 py-3 font-body text-sm font-bold text-[var(--on-accent)] transition-opacity disabled:opacity-30"
        >
          {streaming ? '…' : 'Enviar'}
        </button>
        <ChatMenu onRate={() => setDialog('rate')} onReset={() => setDialog('reset')} />
      </form>

      {dialog === 'rate' && (
        <Dialog title="¿Qué tal tu coach?" onClose={() => setDialog('none')}>
          <p className="mt-3 font-body text-sm leading-relaxed text-muted">
            Tu calificación se suma a la de las demás personas que usaron el coach de{' '}
            {domainName.toLowerCase()}.
          </p>

          <div className="mt-6 flex justify-center">
            <Stars
              value={rated ?? 0}
              onPick={(stars) => {
                setRated(stars);
                // Optimistic: the score is not worth blocking the dialog on.
                void rateCoach(coach.id, stars).catch(() => undefined);
                setTimeout(() => setDialog('none'), 600);
              }}
            />
          </div>

          {rated !== null && (
            <p className="mt-5 text-center font-body text-sm text-[var(--accent)]">
              ¡Gracias por calificar!
            </p>
          )}
        </Dialog>
      )}

      {dialog === 'reset' && (
        <Dialog title="¿Seguro que quieres resetear?" onClose={() => setDialog('none')}>
          <p className="mt-3 font-body text-sm leading-relaxed text-muted">
            Se borra este coach y toda la conversación que llevas con él. El contexto que
            construiste se pierde y tendrás que responder las preguntas de perfil otra vez.
            No se puede deshacer.
          </p>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setDialog('none')}
              className="flex-1 rounded-sm border border-hairline px-4 py-3 font-body text-sm transition-colors hover:border-paper"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onReset}
              className="flex-1 rounded-sm bg-style px-4 py-3 font-body text-sm font-bold text-ink transition-opacity hover:opacity-90"
            >
              Sí, resetear
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

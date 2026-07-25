import { useEffect, useState } from 'react';
import type { CoachRequest } from '@coach/shared';
import { listRequests, requestCoach } from '../api.ts';

/**
 * Chips exist for aggregation, not decoration: free text fragments the ranking into
 * singletons ("finanzas" / "finanzas personales" / "plata" are one demand), and a
 * most-requested list made of ones reads as broken. A tapped chip always sends the same
 * string, so it groups cleanly; typed topics are the tail.
 */
const SUGGESTIONS = [
  'Finanzas personales',
  'Cocina saludable',
  'Productividad',
  'Sueño y descanso',
  'Carrera y CV',
  'Crianza',
];

export function RequestCoach() {
  const [top, setTop] = useState<CoachRequest[]>([]);
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listRequests()
      .then(setTop)
      .catch(() => undefined);
  }, []);

  async function submit(topic: string) {
    const value = topic.trim();
    if (value.length < 2 || busy) return;

    setBusy(true);
    try {
      // The endpoint returns the fresh ranking, so the new entry lands immediately —
      // the point of this section is that something visibly happens on stage.
      setTop(await requestCoach(value));
      setSent(value);
      setDraft('');
    } catch {
      // A failed request must not break the home screen.
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-16 border-t border-hairline pt-10">
      <h2 className="font-display text-3xl leading-tight">¿No está tu experto?</h2>
      <p className="mt-2 max-w-md font-body text-sm leading-relaxed text-muted">
        Dinos de qué tema lo quieres y lo entrenamos. Cada coach lo curamos a mano, así
        que los más pedidos son los que entran primero.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(draft);
        }}
        className="mt-6 flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={60}
          placeholder="Escribe un tema…"
          className="min-w-0 flex-1 rounded-sm border border-hairline bg-surface px-4 py-3 font-body text-[15px] outline-none transition-colors placeholder:text-muted focus:border-paper"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length < 2}
          className="shrink-0 rounded-sm border border-paper px-5 py-3 font-body text-sm font-bold transition-opacity disabled:opacity-30"
        >
          Pedir
        </button>
      </form>

      <ul className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => void submit(s)}
              disabled={busy}
              className="rounded-full border border-hairline px-3 py-1.5 font-body text-[12px] text-muted transition-colors hover:border-paper hover:text-paper disabled:opacity-40"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>

      {sent && (
        <p className="rise mt-5 font-body text-sm text-paper">
          Anotado: <span className="font-bold">{sent}</span>. Gracias.
        </p>
      )}

      <div className="mt-8">
        <p className="font-body text-[10px] tracking-[0.28em] text-muted uppercase">
          Los más pedidos
        </p>

        {top.length === 0 ? (
          <p className="mt-3 font-body text-sm text-muted">
            Todavía nadie ha pedido nada. Sé el primero.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2">
            {top.map((r, i) => (
              <li key={r.topic} className="flex items-baseline gap-3">
                <span className="font-body text-[11px] tabular-nums text-muted">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 font-body text-sm">{r.topic}</span>
                <span className="font-body text-[11px] tabular-nums text-muted">
                  {r.count} {r.count === 1 ? 'pedido' : 'pedidos'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

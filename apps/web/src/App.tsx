import { useCallback, useEffect, useState } from 'react';
import type { Coach, DomainSlug, DomainSummary } from '@coach/shared';
import { clearCoachId, createCoach, getCoach, listDomains, storeCoachId, storedCoachId } from './api.ts';
import { DomainPicker } from './screens/DomainPicker.tsx';
import { ProfileQuestions } from './screens/ProfileQuestions.tsx';
import { Training } from './screens/Training.tsx';
import { Chat } from './screens/Chat.tsx';
import { Compare } from './screens/Compare.tsx';

type Screen =
  | { name: 'boot' }
  | { name: 'picker' }
  | { name: 'questions'; domain: DomainSummary }
  | { name: 'training'; coachId: string; domain: DomainSummary }
  | { name: 'ready'; coach: Coach; domain: DomainSummary };

export default function App() {
  const [domains, setDomains] = useState<DomainSummary[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: 'boot' });
  const [view, setView] = useState<'chat' | 'compare'>('chat');
  const [error, setError] = useState<string | null>(null);

  // Boot: load the catalog, then resume an existing coach from localStorage if it
  // still exists server-side. A stale id (database reset between runs) falls back to
  // the picker instead of dead-ending.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const catalog = await listDomains();
        if (cancelled) return;
        setDomains(catalog);

        const saved = storedCoachId();
        if (!saved) {
          setScreen({ name: 'picker' });
          return;
        }

        try {
          const coach = await getCoach(saved);
          const domain = catalog.find((d) => d.slug === coach.domain);
          if (!domain) throw new Error('dominio desconocido');
          if (cancelled) return;

          setScreen(
            coach.status === 'ready'
              ? { name: 'ready', coach, domain }
              : { name: 'training', coachId: coach.id, domain },
          );
        } catch {
          clearCoachId();
          if (!cancelled) setScreen({ name: 'picker' });
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleComplete = useCallback(
    async (domain: DomainSummary, answers: Record<string, string>) => {
      try {
        const coach = await createCoach(domain.slug, answers);
        storeCoachId(coach.id);
        setScreen({ name: 'training', coachId: coach.id, domain });
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [],
  );

  const handleReset = useCallback(() => {
    clearCoachId();
    setScreen({ name: 'picker' });
  }, []);

  if (error) {
    return (
      <main className="flex h-full items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="font-display text-3xl">Algo se rompió</p>
          <p className="mt-3 font-body text-sm text-muted">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 font-body text-sm underline underline-offset-4"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  switch (screen.name) {
    case 'boot':
      return (
        <main className="flex h-full items-center justify-center">
          <span className="font-body text-xs tracking-[0.35em] text-muted uppercase">
            Cargando
          </span>
        </main>
      );

    case 'picker':
      return (
        <DomainPicker
          domains={domains}
          onPick={(domain) => setScreen({ name: 'questions', domain })}
        />
      );

    case 'questions':
      return (
        <ProfileQuestions
          domain={screen.domain}
          onBack={() => setScreen({ name: 'picker' })}
          onComplete={(answers) => void handleComplete(screen.domain, answers)}
        />
      );

    case 'training':
      return (
        <Training
          coachId={screen.coachId}
          domainName={screen.domain.name}
          domainSlug={screen.domain.slug as DomainSlug}
          onReady={(coach) => setScreen({ name: 'ready', coach, domain: screen.domain })}
        />
      );

    case 'ready':
      return view === 'compare' ? (
        <Compare
          coach={screen.coach}
          domain={screen.domain}
          onBack={() => setView('chat')}
        />
      ) : (
        <Chat
          coach={screen.coach}
          domainName={screen.domain.name}
          onReset={handleReset}
          onCompare={() => setView('compare')}
        />
      );
  }
}

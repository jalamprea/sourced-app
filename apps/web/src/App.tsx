import { useCallback, useEffect, useState } from 'react';
import type { Coach, DomainSlug, DomainSummary } from '@coach/shared';
import {
  bootCoachId,
  coachIdFor,
  createCoach,
  forgetCoach,
  getCoach,
  listDomains,
  rememberCoach,
} from './api.ts';
import { DomainPicker } from './screens/DomainPicker.tsx';
import { ProfileQuestions } from './screens/ProfileQuestions.tsx';
import { Training } from './screens/Training.tsx';
import { Chat } from './screens/Chat.tsx';
import { Compare } from './screens/Compare.tsx';
import { About } from './screens/About.tsx';
import { useRoute } from './router.ts';

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
  const [path, navigate] = useRoute();
  const [error, setError] = useState<string | null>(null);

  /** Open a coach that already exists, or fall back to the picker if it is gone. */
  const openCoach = useCallback(
    async (coachId: string, catalog: DomainSummary[]): Promise<boolean> => {
      try {
        const coach = await getCoach(coachId);
        const domain = catalog.find((d) => d.slug === coach.domain);
        if (!domain) return false;

        // Normalises deep links and the old single-id storage into the per-domain store.
        rememberCoach(coach.domain, coach.id);
        setView('chat');
        setScreen(
          coach.status === 'ready'
            ? { name: 'ready', coach, domain }
            : { name: 'training', coachId: coach.id, domain },
        );
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const catalog = await listDomains();
        if (cancelled) return;
        setDomains(catalog);

        const saved = bootCoachId();
        if (!saved) {
          setScreen({ name: 'picker' });
          return;
        }

        // A stale id (the database was reset between runs) must not dead-end the app.
        const opened = await openCoach(saved, catalog);
        if (!cancelled && !opened) setScreen({ name: 'picker' });
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openCoach]);

  /** Tapping a domain resumes its coach when there is one; otherwise it starts onboarding. */
  const handlePick = useCallback(
    async (domain: DomainSummary) => {
      const existing = coachIdFor(domain.slug);
      if (existing && (await openCoach(existing, domains))) return;
      if (existing) forgetCoach(domain.slug);
      setScreen({ name: 'questions', domain });
    },
    [domains, openCoach],
  );

  const handleComplete = useCallback(
    async (domain: DomainSummary, answers: Record<string, string>) => {
      try {
        const coach = await createCoach(domain.slug, answers);
        rememberCoach(domain.slug, coach.id);
        setScreen({ name: 'training', coachId: coach.id, domain });
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [],
  );

  /** Back to the picker with the coach intact — the conversation is still there. */
  const handleHome = useCallback(() => {
    setView('chat');
    setScreen({ name: 'picker' });
  }, []);

  /** The destructive one: drops this domain's coach and its conversation. */
  const handleReset = useCallback((domain: DomainSummary) => {
    forgetCoach(domain.slug);
    setView('chat');
    setScreen({ name: 'picker' });
  }, []);

  if (path === '/acerca-de') {
    return <About onBack={() => navigate('/')} />;
  }

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
          onPick={(d) => void handlePick(d)}
          onAbout={() => navigate('/acerca-de')}
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
        <Compare coach={screen.coach} domain={screen.domain} onBack={() => setView('chat')} />
      ) : (
        <Chat
          coach={screen.coach}
          domainName={screen.domain.name}
          onHome={handleHome}
          onReset={() => handleReset(screen.domain)}
          onCompare={() => setView('compare')}
        />
      );
  }
}

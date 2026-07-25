import { useState } from 'react';
import type { DomainSlug, DomainSummary } from '@coach/shared';
import { accentVars } from '../theme.ts';

interface Props {
  domain: DomainSummary;
  onComplete: (answers: Record<string, string>) => void;
  onBack: () => void;
}

export function ProfileQuestions({ domain, onComplete, onBack }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const question = domain.questions[step];
  if (!question) return null;

  function choose(option: string) {
    const next = { ...answers, [question!.id]: option };
    setAnswers(next);

    if (step + 1 < domain.questions.length) {
      setStep(step + 1);
    } else {
      onComplete(next);
    }
  }

  function back() {
    if (step === 0) onBack();
    else setStep(step - 1);
  }

  return (
    <main
      style={accentVars(domain.slug as DomainSlug)}
      className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-7 py-10 sm:px-10"
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={back}
          className="font-body text-sm text-muted transition-colors hover:text-paper"
        >
          ← Volver
        </button>
        <span className="font-body text-xs tracking-[0.3em] text-muted uppercase">
          {domain.name}
        </span>
      </div>

      <div className="mt-8 flex gap-1.5" aria-hidden>
        {domain.questions.map((q, i) => (
          <span
            key={q.id}
            className="h-0.5 flex-1 overflow-hidden bg-hairline"
          >
            <span
              className="block h-full bg-[var(--accent)] transition-transform duration-500"
              style={{ transform: `scaleX(${i <= step ? 1 : 0})`, transformOrigin: 'left' }}
            />
          </span>
        ))}
      </div>

      <div key={question.id} className="rise mt-16 flex-1">
        <p className="font-body text-xs tabular-nums tracking-[0.3em] text-muted uppercase">
          Pregunta {step + 1} de {domain.questions.length}
        </p>
        <h2 className="mt-5 font-display text-4xl leading-[1.05] sm:text-5xl">
          {question.question}
        </h2>

        <ul className="mt-10 flex flex-col gap-2">
          {question.options.map((option, i) => {
            const selected = answers[question.id] === option;
            return (
              <li key={option} className="rise" style={{ animationDelay: `${80 + i * 55}ms` }}>
                <button
                  type="button"
                  onClick={() => choose(option)}
                  className={`group flex w-full items-center gap-4 rounded-sm border px-5 py-4 text-left transition-all duration-200 ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]'
                      : 'border-hairline bg-surface hover:border-[var(--accent)] hover:bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]'
                  }`}
                >
                  <span className="font-body text-xs tabular-nums opacity-50">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="font-body text-[15px] leading-snug">{option}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}

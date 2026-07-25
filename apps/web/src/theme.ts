import type { DomainSlug } from '@coach/shared';

/**
 * Each domain owns a saturated accent. It carries through onboarding, the chat, and —
 * the reason it exists — the comparison screen, where the coach pane wears its colour
 * and the generic pane stays grey.
 */
export const ACCENT: Record<DomainSlug, string> = {
  style: '#ff4d3d',
  fitness: '#c6f24e',
  hair: '#4fd8e8',
};

/** Accents are bright; lime and aqua need dark text on top of them. */
export const ON_ACCENT: Record<DomainSlug, string> = {
  style: '#0a0a0b',
  fitness: '#0a0a0b',
  hair: '#0a0a0b',
};

export const accentVars = (domain: DomainSlug) =>
  ({
    '--accent': ACCENT[domain],
    '--on-accent': ON_ACCENT[domain],
  }) as React.CSSProperties;

import type { ChatMessage, Coach, CoachRequest, DomainSummary } from '@coach/shared';
import { apiUrl } from './config.ts';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export const listDomains = () => json<DomainSummary[]>('/api/domains');

export const getCoach = (id: string) => json<Coach>(`/api/coaches/${id}`);

export const getMessages = (id: string) => json<ChatMessage[]>(`/api/coaches/${id}/messages`);

export const listRequests = () => json<CoachRequest[]>('/api/requests');

export const requestCoach = (topic: string) =>
  json<CoachRequest[]>('/api/requests', {
    method: 'POST',
    body: JSON.stringify({ topic }),
  });

export const rateCoach = (id: string, stars: number) =>
  json<{ ok: boolean }>(`/api/coaches/${id}/rating`, {
    method: 'POST',
    body: JSON.stringify({ stars }),
  });

export const createCoach = (domain: string, userProfile: Record<string, string>) =>
  json<Coach>('/api/coaches', {
    method: 'POST',
    body: JSON.stringify({ domain, userProfile }),
  });

const STORAGE_KEY = 'sourced.coaches';
const LEGACY_KEY = 'coachId';

/**
 * One coach per domain, plus which one was open last.
 *
 * A single stored id meant that returning to the picker and tapping the same domain
 * silently created a second coach and orphaned the first conversation — still in the
 * database, but unreachable, because the id it lived under had just been overwritten.
 */
interface CoachStore {
  byDomain: Record<string, string>;
  active?: string;
}

function read(): CoachStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CoachStore>;
      return { byDomain: parsed.byDomain ?? {}, active: parsed.active };
    }
  } catch {
    // Corrupt entry: start clean rather than dead-end the app on every boot.
  }
  return { byDomain: {} };
}

const write = (store: CoachStore) => localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

export const rememberCoach = (domain: string, coachId: string): void => {
  const store = read();
  store.byDomain[domain] = coachId;
  store.active = domain;
  write(store);
};

export const forgetCoach = (domain: string): void => {
  const store = read();
  delete store.byDomain[domain];
  if (store.active === domain) delete store.active;
  write(store);
  localStorage.removeItem(LEGACY_KEY);
  // Otherwise the deep link would immediately restore the coach just cleared.
  if (new URLSearchParams(window.location.search).has('coach')) {
    window.history.replaceState({}, '', window.location.pathname);
  }
};

export const coachIdFor = (domain: string): string | null => read().byDomain[domain] ?? null;

/**
 * Which coach to open on boot. `?coach=<id>` wins — it is the stage escape hatch that
 * opens a golden coach directly if the clock runs out before onboarding can be shown.
 */
export const bootCoachId = (): string | null => {
  const fromUrl = new URLSearchParams(window.location.search).get('coach');
  if (fromUrl) return fromUrl;

  const store = read();
  const active = store.active ? store.byDomain[store.active] : undefined;
  if (active) return active;

  return localStorage.getItem(LEGACY_KEY);
};

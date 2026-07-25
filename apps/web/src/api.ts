import type { ChatMessage, Coach, DomainSummary } from '@coach/shared';
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

export const createCoach = (domain: string, userProfile: Record<string, string>) =>
  json<Coach>('/api/coaches', {
    method: 'POST',
    body: JSON.stringify({ domain, userProfile }),
  });

const STORAGE_KEY = 'coachId';

/**
 * `?coach=<id>` wins over localStorage: it is the stage escape hatch, letting a golden
 * coach be opened directly if the clock runs out before onboarding can be shown.
 */
export const storedCoachId = () => {
  const fromUrl = new URLSearchParams(window.location.search).get('coach');
  if (fromUrl) {
    localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(STORAGE_KEY);
};
export const storeCoachId = (id: string) => localStorage.setItem(STORAGE_KEY, id);
export const clearCoachId = () => {
  localStorage.removeItem(STORAGE_KEY);
  // Otherwise the deep link would immediately restore the coach we just cleared.
  if (new URLSearchParams(window.location.search).has('coach')) {
    window.history.replaceState({}, '', window.location.pathname);
  }
};

import type { ChatMessage, Coach, DomainSummary } from '@coach/shared';

async function json<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
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

export const storedCoachId = () => localStorage.getItem(STORAGE_KEY);
export const storeCoachId = (id: string) => localStorage.setItem(STORAGE_KEY, id);
export const clearCoachId = () => localStorage.removeItem(STORAGE_KEY);

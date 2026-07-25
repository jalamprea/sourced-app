/**
 * Origin of the API.
 *
 * Empty in development on purpose: every request stays relative and goes through the
 * Vite proxy (`vite.config.ts`). In production the static site and the API are two
 * different hosts, so this must be the absolute API origin.
 *
 * Vite inlines `import.meta.env` at BUILD time. Changing `VITE_API_URL` therefore
 * requires rebuilding and redeploying the web app — restarting it does nothing. Set it
 * in the Render dashboard on the static site, or in `apps/web/.env.local` to point a
 * local build at a deployed API.
 */
interface WebEnv {
  readonly VITE_API_URL?: string;
}

const env = import.meta.env as unknown as WebEnv;

export const API_BASE = (env.VITE_API_URL ?? '').replace(/\/+$/, '');

export const apiUrl = (path: string): string => `${API_BASE}${path}`;

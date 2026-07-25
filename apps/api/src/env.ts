import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The API runs with CWD=apps/api under `pnpm --filter api`, but .env lives at the
// repo root. Resolve it from this file instead of relying on the working directory.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
config({ path: resolve(repoRoot, '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} — copy .env.example to .env at the repo root`);
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3000),
  // Read lazily by the callers that need them, so Phase 0 boots without keys.
  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),
  openaiApiKey: () => required('OPENAI_API_KEY'),
};

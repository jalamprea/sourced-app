# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Sourced** — a hackathon project (Platanus Build Night, 9-hour solo build). A user picks a
domain, answers 3 profile questions, and gets a chat coach whose answers are grounded in
YouTube transcripts of real experts, each claim citing the source video at the exact second.

`docs/spec.md` and `docs/tasks.md` are the authoritative scope and decision record — read them
before changing architecture. Every trade-off in this codebase resolves in favor of *"visible
in the live demo"* over *"done properly"*, and the code comments say so where it matters.
Phases 0–4 are done; Phase 5 (demo seed, README, rehearsed dry runs) is open.

## Environment

- **`nvm use` before any `pnpm` command.** Node 22.20.0 is pinned in `.nvmrc`; the machine
  default is Node 20 and pnpm 11 hard-fails there (it imports `node:sqlite`).
- `yt-dlp` on PATH (`brew install yt-dlp`) — ingest only.
- `.env` lives at the **repo root**, copied from `.env.example`.

## Commands

```bash
pnpm db:up                    # Postgres 16 + pgvector via docker-compose
pnpm db:migrate               # apply migrations/*.sql in lexical order, inside the container
pnpm db:reset                 # drop the volume and start clean (then migrate + ingest again)
pnpm db:psql                  # psql shell into the db container
pnpm dev                      # api (tsx watch, :3000) + web (vite --host, :5173) concurrently

pnpm ingest -- --domain all               # full ingest (costs OpenAI embedding calls)
pnpm ingest -- --domain hair --dry-run    # parse + chunk only, no embeddings, no DB writes
pnpm ingest -- --domain style --max-videos 4

pnpm --filter api test        # the VTT parser smoke test — the only test in the repo
pnpm --filter api typecheck   # tsc --noEmit; run per app, there is no root typecheck
pnpm --filter web typecheck
```

There is no lint step and no build step for the API (`tsx` runs TypeScript directly).

## Deploy

Render, declared in `render.yaml`. The ordered runbook — and the reasons the order matters —
is `docs/deploy.md`. Three services: `sourced-api` (Node web service, **starter** plan
because a free service sleeps after 15 min and takes ~1 min to wake), `sourced-web` (static
site), `sourced-db` (Postgres 16 + pgvector, `create extension vector` works as-is).

- **The API cannot go serverless.** The detached clone in `routes/coaches.ts` and the
  `reply.hijack()` SSE write in `routes/messages.ts` both need the process to outlive the
  response.
- **`VITE_API_URL` is inlined at build time** and read in exactly one place,
  `web/src/config.ts`. Empty in dev so every request stays relative and uses the Vite proxy;
  changing it in production requires a rebuild, not a restart.
- **`--prod=false` in the Render build commands is load-bearing** — `tsx`, `typescript` and
  `vite` are devDependencies, and a `NODE_ENV=production` install would skip them.
- `pnpm db:migrate:remote` applies the same migrations over `DATABASE_URL` instead of the
  docker container. Re-ingesting against a fresh database makes zero YouTube calls thanks to
  `.cache/yt/` — it only re-embeds, which is cheaper than moving `vector` columns by hand.

## Architecture

Single Fastify service + Vite/React SPA + Postgres/pgvector, in a pnpm workspace.

```
apps/api/src/ingest/   offline CLI: yt-dlp → VTT parse → chunk → embed → Postgres
apps/api/src/rag/      retrieve (pgvector) → prompt assembly → Anthropic stream
apps/api/src/routes/   coaches.ts (onboarding), messages.ts (SSE chat)
apps/api/src/personas.ts   hardcoded domain catalog: slugs, persona prompts, profile questions
apps/web/src/          screen state machine in App.tsx; SSE client in sse.ts
packages/shared/       API contract types ONLY — no runtime deps, consumed from source
migrations/            plain idempotent .sql, applied by scripts/migrate.sh
seeds/                 per-domain YouTube URL manifests (only `url` is read)
```

### Template coach + clone (Decision 1 in the spec)

Retrieval filters on `coach_id`, but ingestion is an offline CLI and coaches are created live.
So ingestion writes into one **template coach per domain** (`coaches.status = 'template'`,
enforced by a partial unique index), and `POST /api/coaches` clones its `videos` + `chunks`
rows onto the new coach with `INSERT ... SELECT`.

The clone is real work but finishes in under a second, so it is paced at `CLONE_PACING_MS`
per video and runs detached from the request while the client polls `GET /api/coaches/:id`.
That endpoint also **self-heals**: a `tsx watch` restart kills the detached clone, so a coach
still `training` with all its videos present is flipped to `ready` on read.

### Citation contract

This is the core of the product and it is split across three files — change one, check all three:

1. `rag/prompt.ts` tells the model to emit **bare `[n]` markers**. Never ask it for URLs; it
   hallucinates video ids and breaks mid-token while streaming.
2. `routes/messages.ts` sends the `citations` SSE frame **before the first token**, so source
   cards render while the answer is still streaming. That ordering is the demo beat.
3. `web/src/components/CitedText.tsx` maps each `[n]` to `youtube.com/watch?v=ID&t=Ns`.

### SSE chat stream

`POST /api/coaches/:id/messages` streams `citations` → `token`* → `done`, or `error`.
`reply.hijack()` is mandatory before writing to `reply.raw`, or Fastify sends its own response
on top of the stream. The browser cannot use `EventSource` (GET-only, and this needs a POST
body), so `web/src/sse.ts` buffers and parses frames by hand.

`mode: 'generic'` skips retrieval and uses `GENERIC_PROMPT` — same model, same params, no
persona, no profile. It is the comparison baseline; keeping the params identical is the whole
point (see Decision 3), so do not "improve" one side of it.

### Data invariants

- `EMBEDDING_DIMS` (1536, `text-embedding-3-small`) must match `vector(1536)` in `001_init.sql`.
  Changing the embedding model means a migration and a full re-ingest.
- **No ANN index on `chunks.embedding`, on purpose.** ~300 chunks total; an exact `<=>` scan is
  single-digit ms and `ivfflat` is worse at this size. The migration records the threshold.
- `messages` is ordered by **`seq` (bigserial), never `created_at`** — both rows of an exchange
  are written in one INSERT and share the transaction timestamp.
- `messages.mode` separates coach and generic histories; without it the two panes stop being
  comparable.
- `videos` is ordered by `created_at, id` — `id` is a random uuid, so ordering by it reshuffles
  the training screen instead of appending.

### Ingest pipeline

Idempotent and resumable: `.cache/yt/` caches every download (a re-run makes zero YouTube
calls), a video counts as done only when it has ≥1 chunk row, partial videos are deleted and
retried, and each video commits in its own transaction.

`ingest/vtt.ts` is the highest-risk component and the reason the smoke test exists. YouTube
ships two incompatible caption shapes: manual tracks where every line is new content, and
auto tracks that are a rolling two-line window with ~10ms bridge cues. Concatenating raw cue
text on the auto format yields 2–3× duplicated transcript. The fixtures in `apps/api/fixtures/`
are two tracks of the *same* video and the test asserts they converge.

## Conventions

- **Imports carry explicit extensions** (`./env.ts`, `../db.ts`, `./screens/Chat.tsx`) —
  `allowImportingTsExtensions` + `verbatimModuleSyntax` in both tsconfigs. Type-only imports
  use `import type`.
- **Raw SQL through `pg`.** No ORM, no query builder, no migration framework. New migrations
  are a new numbered file in `migrations/` and must be idempotent (`if not exists`,
  `add column if not exists`) — `migrate.sh` re-applies all of them every run.
- **Env access goes through `apps/api/src/env.ts`**, which resolves the root `.env` from
  `import.meta.url`. Never `import 'dotenv/config'` in a new entry point: the API runs with
  `CWD=apps/api` and would not find it. API keys are read lazily so the server boots keyless.
- **Fastify response schemas need an entry per status code.** Declaring only `200` makes
  `reply.code(404)` a type error.
- **Product language is Spanish** — UI copy, persona prompts, and user-facing error messages.
  Code, identifiers, and comments are English.
- `pnpm ingest -- --flag` forwards a literal `--`, which makes `parseArgs` treat every later
  flag as positional; `ingest/cli.ts` filters it out. Keep that if you add flags.
- Frontend design direction is dark editorial: `Instrument Serif` over `Manrope`, hairline
  rules, film grain, and one saturated accent per domain injected as CSS vars by
  `web/src/theme.ts`. The accent is the mechanism the comparison screen depends on.

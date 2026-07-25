# Task Breakdown — 9 Hours

Rule for the whole build: if a phase runs long, cut scope from Phase 4 and Phase 2
first. **Phase 3 (chat + RAG + citations) is never cut.**

Legend: `[!]` = blocks a later phase, `[demo]` = visible on stage.

---

## Phase 0 — Scaffold (1h) — DONE

- [x] `[!]` Install `yt-dlp` (`brew install yt-dlp`) and verify `yt-dlp --version`
- [x] `[!]` Pin Node 22.20.0 via `.nvmrc` — installed pnpm needs ≥ 22.13
- [x] `pnpm-workspace.yaml` with `apps/*` and `packages/*`
- [x] `apps/api`: Fastify + TypeScript + `tsx` watch, `apps/web`: Vite React TS
- [x] `packages/shared`: types-only package, no runtime deps
- [x] `docker-compose.yml` — `pgvector/pgvector:pg16`, port 5432, named volume
- [x] `.env.example` — `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- [x] `migrations/001_init.sql` — extensions + 4 tables + indexes (spec §4)
- [x] `scripts/migrate.sh` — apply every `migrations/*.sql` in order
- [x] `apps/api`: `pg` pool + `GET /health` returning `{ ok, db }`
- [x] `apps/web`: Tailwind configured, dev proxy `/api` → `localhost:3000`
- [x] `apps/web`: page renders and hits `/health`, shows green/red dot
- [x] Root scripts: `dev`, `db:up`, `db:migrate`

**Exit criterion met:** `pnpm db:up && pnpm db:migrate && pnpm dev` →
`GET /health` returns `{"ok":true,"db":true}` both directly and through the Vite
proxy; `tsc --noEmit` is clean in both apps.

### Environment gotchas hit in Phase 0 (keep for the rest of the build)

- **Always `nvm use` before any `pnpm` command.** The shell default is Node 20 and
  pnpm hard-fails there.
- **`dotenv/config` does not find the root `.env`** from `apps/api` — `env.ts`
  resolves the repo root from `import.meta.url` instead of trusting CWD. Any new
  entry point (the ingest CLI) must import `./env.ts`, never `dotenv/config`.
- **`pg_isready` races the Postgres entrypoint.** On first boot the entrypoint runs
  a temporary server before creating the `coach` database, and `pg_isready` passes
  against it. Both the healthcheck and `migrate.sh` probe with an actual
  `psql -d coach -c 'select 1'`.
- **pnpm 11 uses `allowBuilds:` in `pnpm-workspace.yaml`**, not the pnpm 10
  `onlyBuiltDependencies:`. Without it esbuild's postinstall is skipped and Vite
  cannot start.

---

## Phase 1 — Ingest pipeline (2h) — DONE

- [x] `seeds/style.json`, `seeds/fitness.json`, `seeds/hair.json` — 33 Spanish videos
      across 3 domains, Spanish captions verified with `yt-dlp` before committing
- [x] `personas.ts` — 3 domains, persona prompts, 3 profile questions each
- [x] `ingest/ytdlp.ts` — source expansion + per-video download to `.cache/yt/`,
      skip if cached; prefers a manual caption track over the auto one
- [x] `ingest/vtt.ts` — parse cues, strip `<...>` markup and HTML entities,
      **dedupe the rolling-window overlap** (spec §5) `[!]`
- [x] `ingest/chunk.ts` — ~1800 chars per chunk, `start_seconds` from the first cue,
      stub tail folded into the previous chunk
- [x] `ingest/embed.ts` — `text-embedding-3-small`, batches of 64, retry on 429/5xx
- [x] `ingest/cli.ts` — `--domain`, `--seed`, `--max-videos`, `--dry-run`;
      creates/reuses the `status='template'` coach; one transaction per video
- [x] Idempotency: skip videos that already have ≥1 chunk; delete + retry partials
- [x] Smoke test (`pnpm --filter api test`) — 7 assertions over two real fixtures cut
      from the **same** video, one manual track and one auto, asserting they converge
- [x] `--dry-run` over all 33 videos: 33 parsed, 0 failures, VTTs cached (2m26s)
- [x] `[!]` Full ingest — 296 chunks embedded and stored

**Measured corpus:** style 10 videos / 75 chunks, fitness 11 / 110, hair 12 / 111.

**Exit criterion met:** 296 chunk rows across 3 template coaches, every one carrying a
1536-dim embedding; chunk counts match the dry run exactly.

### Ingest gotchas worth keeping

- **Two caption formats, one parser.** Manual tracks put *all* new content across 1-2
  lines per cue; auto tracks use a rolling two-line window with ~10ms bridge cues that
  restate the previous line. Parser drops sub-50ms cues, takes every line for manual
  and only the last for rolling, then drops any line equal to the one before it.
- **`pnpm ingest -- --flag` forwards a literal `--`**, which makes `parseArgs` treat
  every later flag as positional and silently run with defaults. The CLI filters it out.
- **Never pipe `yt-dlp` into `head`** — SIGPIPE kills it before it writes `info.json`.

---

## Phase 2 — Onboarding (2h) — DONE (pending visual check)

- [x] `GET /api/domains` — catalog + profile questions from `personas.ts`
- [x] `POST /api/coaches` — creates coach (`status='training'`), then clones
      `videos` + `chunks` from the domain template via `INSERT ... SELECT`
- [x] Clone reports progress per video; coach flips to `status='ready'` at the end
- [x] `GET /api/coaches/:id` — `{ status, videosReady, videosTotal, videos[] }`
- [x] `[demo]` Web: domain picker — 3 rows, accent wipe on hover
- [x] `[demo]` Web: 3 profile questions, one per screen, segmented progress
- [x] `[demo]` Web: training screen — polls every 400ms, real titles append with a
      real progress bar
- [x] `coachId` persisted to `localStorage`; boot resumes an existing coach and falls
      back to the picker if the id is stale (database reset between runs)
- [x] "Empezar de nuevo" clears `localStorage`

**Verified:** full flow against the live API — create → `1/10 … 9/10 → ready 10/10`
with real titles appending in order; both apps typecheck; every screen module compiles
and Tailwind emits the accent utilities. **Not verified: the visual render** — no
browser tool in this session.

### Design direction (carries into Phases 3-4)

Dark editorial: near-black canvas, `Instrument Serif` display over `Manrope`, hairline
rules, film-grain overlay, and a saturated accent per domain — style `#ff4d3d`,
fitness `#c6f24e`, hair `#4fd8e8`. The accent is the mechanism the comparison screen
depends on: the coach pane wears its domain colour, the generic pane stays grey.

### Phase 2 gotchas

- **`videos.id` is a random uuid** — ordering by it made each newly cloned video land
  at a random position, so the training list reshuffled instead of appending.
  `002_video_order.sql` adds `created_at`; queries order by `created_at, id`.
- **A detached clone dies with the server** (`tsx watch` restarts on save), stranding
  the coach on `training`. `GET /api/coaches/:id` self-heals: if every video is
  present, it flips the status to `ready`.
- **Declaring `response: { 200: … }` in a Fastify schema makes `reply.code(404)` a type
  error.** Every non-200 status needs its own entry in the response schema.
- **In zsh, `path` is bound to `PATH`** — a `path=...` assignment in a build script
  wipes the command lookup path and every later command fails with "not found".

---

## Phase 3 — Chat with RAG and citations (2h) — DONE (pending visual check)

**Measured:** citations on screen at **746 ms**, first token at **2.15 s**. Retrieval
returns hair-loss sources for a hair-loss question; answers carry 5-6 distinct markers
and reference the user profile verbatim ("con pelo rizado y dos lavados por semana").
Multi-turn history verified across two turns. Generic mode returns 0 citations and no
profile conditioning, from a separate per-mode history.

### Phase 3 gotchas

- **Both rows of an exchange share `created_at`.** They are written in one INSERT, so
  the timestamp ties and the tiebreaker fell through to a random uuid — the assistant
  turn landed before the user turn about half the time, which would have scrambled the
  history sent to the model on the second question. `004_message_sequence.sql` adds a
  `bigserial`; every ordering now uses `seq`.
- **`messages` needed a `mode` column** (`003`): without it the generic pane would
  inherit the coach pane's history and the two sides would stop being comparable.
- **`reply.hijack()` is required** before writing raw SSE, or Fastify tries to send its
  own response on top of the stream.

### Original checklist

- [x] `rag/retrieve.ts` — embed query, top-8 by `<=>` filtered on `coach_id`,
      returns text + `start_seconds` + video metadata `[!]`
- [x] `rag/prompt.ts` — assemble `<role>` / `<user_profile>` / `<sources>` /
      `<rules>` exactly as spec §7 `[!]`
- [x] `POST /api/coaches/:id/messages` — SSE via `reply.raw`, correct headers,
      heartbeat comment every 15s
- [x] Emit `citations` frame **before** the first `token` frame `[demo]`
- [x] Anthropic stream: `claude-opus-5`, `max_tokens: 1500`,
      `thinking: { type: "disabled" }`, `output_config: { effort: "low" }`
- [x] Forward `text_delta` events as `token` frames; `done` frame carries `messageId`
- [x] Persist user + assistant messages with the `citations` JSON
- [x] Last 6 messages loaded as conversation history
- [x] Web: SSE client over `fetch()` + `body.getReader()` (**not `EventSource`** —
      it is GET-only) `[!]`
- [x] `[demo]` Web: source cards render as soon as `citations` arrives —
      title, channel, `mm:ss`, thumbnail
- [x] `[demo]` Web: `[n]` markers in the streamed text replaced with links to
      `youtube.com/watch?v=ID&t=Ns`, opening in a new tab
- [x] Error frame → inline retry, never a blank screen
- [x] Tune `<rules>` until every answer carries at least 2 citations
      (**this is the fix if retrieval looks weak — not retrieval changes**)

**Exit criterion met** on the API side. Clicking a citation in the browser is the
remaining unverified step — no browser tool in this session.

---

## Phase 4 — Comparison mode + PWA polish (1h) — DONE (pending visual check)

- [x] `mode: "generic"` on the messages endpoint — skips retrieval, neutral one-line
      system prompt, identical model params
- [x] `[demo]` Comparison screen: two panes, one question box, both streams fired in
      parallel, labels "LLM genérico" / "Tu coach"
- [x] `[demo]` Citation cards render only under the coach pane
- [x] `[demo]` Visual contrast: coach pane wears the domain accent, generic pane is
      deliberately grey and dimmed
- [x] `[demo]` Rehearsed questions surfaced as chips (`sampleQuestions` per domain,
      verified against the ingested corpus) — replaces the index card from Phase 5
- [x] Mobile layout: panes stack vertically, question box pinned to the bottom
- [x] `vite-plugin-pwa` — `autoUpdate`, manifest, icons generated from `project-logo.png`
- [x] Webfont cached by the service worker so a flaky venue network cannot strip the
      typography mid-demo; the API is never cached
- [ ] Test on a real phone over LAN — `http://192.168.20.78:5173`

**Measured, both panes in parallel:** generic first token 1.3 s; coach sources on
screen at 0.65 s and first token at 2.0 s. The coach pane never sits empty — its eight
source cards land before the generic side starts writing. One outlier run put the coach
at 4.6 s, so allow for variance on stage.

**Production build verified:** `dist/sw.js` + manifest generated, 8 precache entries.

### Phase 4 gotchas

- **`tsx watch` restarts can race the port.** An in-flight SSE stream holds a pooled pg
  client, so an unbounded `pool.end()` on shutdown hangs, the process keeps port 3000,
  and the next restart dies with `EADDRINUSE` — silently leaving no API running. Fixed
  with a 2 s bounded shutdown plus a listen retry.

---

## Phase 5 — Demo seed and buffer (1h)

- [ ] `pnpm demo:reset` — deletes non-template coaches and their messages
- [ ] One pre-created "golden" coach per domain, ready to skip onboarding if time runs out
- [x] 3 rehearsed questions per domain — shipped as chips in the comparison screen
- [ ] Fill `build-night-project.json` — name, one-liner, description
- [ ] Rewrite `README.md` — what it is, how to run, the demo script
- [ ] Full dry run twice, timed, on the demo machine, on the demo network
- [ ] Capture a fallback screen recording of the comparison mode
- [ ] Buffer

**Exit criterion:** the demo runs end to end twice in a row without a single manual
database fix.

---

## Cut order if behind schedule

1. PWA install/offline behavior (Phase 4)
2. Training-screen progress detail → plain spinner (Phase 2)
3. Conversation history → single-turn only (Phase 3)
4. Third domain → ship with two (Phase 1)
5. Onboarding entirely → boot straight into a golden coach (Phase 2)

Never cut: retrieval, citation links, comparison mode.

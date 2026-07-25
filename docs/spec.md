# Technical Spec — YouTube-Trained Expert Coach

**Constraint:** 9-hour build, single developer, live on-stage demo at the end.
Every trade-off resolves in favor of *"this is visible in the demo"* over *"this is
done properly"*.

**The moment to protect above everything else:** comparison mode — the same question
answered by a generic LLM vs. the trained coach, side by side, with visible citations.

---

## 1. Product surface

1. User picks a domain from a pre-curated catalog of 3 (clothing/style, fitness, hair care).
2. User answers 3 profile questions.
3. A "training" screen shows real progress while the coach is materialized.
4. User chats with the coach. Every answer cites the source video and the exact minute.
5. Comparison mode renders the same question against a generic model and against the coach.

No auth, no billing, no influencer discovery, no PDFs, no multi-tenancy, no CI/CD.
Anonymous session: `coachId` in `localStorage`.

---

## 2. Stack (closed)

| Layer | Choice |
| --- | --- |
| Language | TypeScript, Node 20+ |
| Backend | Fastify (single service), TypeBox schemas |
| Frontend | React + Vite + Tailwind, PWA via `vite-plugin-pwa` |
| Database | Postgres 16 + pgvector (docker-compose, local) |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| Chat LLM | Anthropic API, SSE streaming from Fastify |
| Transcripts | `yt-dlp` VTT auto-subs, parsed offline |

### Local prerequisites

- **Node 22.20.0**, pinned in `.nvmrc`. The brief says "Node 20+", but the installed
  pnpm (11.15.1) requires Node ≥ 22.13 — it imports `node:sqlite`, which does not
  exist in Node 20. `nvm use` in the repo root picks up `.nvmrc`. The machine's
  global default is still Node 20 and was deliberately left alone.
- `yt-dlp` — installed via `brew install yt-dlp` (was missing; blocked Phase 1).
- Docker + docker-compose, `pnpm`: present.
- Env vars live in `.env` **at the repo root**, copied from `.env.example`:
  `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PORT`.

---

## 3. Repository layout

```
apps/
  api/            Fastify service + ingest CLI
    src/
      server.ts           bootstrap, health check
      db.ts               pg pool
      routes/
        coaches.ts        POST /api/coaches, GET /api/coaches/:id
        messages.ts       POST /api/coaches/:id/messages (SSE)
      rag/
        retrieve.ts       embed query + top-k over pgvector
        prompt.ts         system prompt assembly
        stream.ts         Anthropic stream -> SSE frames
      ingest/
        cli.ts            entry point
        ytdlp.ts          metadata + subtitle download
        vtt.ts            VTT parse + dedupe
        chunk.ts          cue list -> chunks
        embed.ts          batched OpenAI embeddings
      personas.ts         domain catalog + persona prompts
apps/
  web/            React + Vite + Tailwind PWA
packages/
  shared/         API contract types only (no runtime deps)
migrations/       plain .sql files, applied in order
seeds/            per-domain video URL manifests
docker-compose.yml
```

Migrations are plain SQL applied by a tiny runner (`psql -f` in a shell script is
acceptable). No ORM, no migration framework — `pg` with raw SQL.

---

## 4. Data model

```sql
create extension if not exists vector;
create extension if not exists "pgcrypto";

create table coaches (
  id             uuid primary key default gen_random_uuid(),
  domain         text not null,
  persona_prompt text not null,
  user_profile   jsonb not null default '{}'::jsonb,
  status         text not null default 'draft',  -- template | training | ready
  created_at     timestamptz not null default now()
);

create table videos (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references coaches(id) on delete cascade,
  youtube_id text not null,
  title      text not null,
  channel    text not null,
  url        text not null,
  unique (coach_id, youtube_id)
);

create table chunks (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid not null references videos(id) on delete cascade,
  text          text not null,
  start_seconds integer not null,
  embedding     vector(1536) not null
);

create table messages (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references coaches(id) on delete cascade,
  role       text not null,          -- user | assistant
  content    text not null,
  citations  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index on videos (coach_id);
create index on chunks (video_id);
```

**No ANN index on `chunks.embedding`.** Measured in Phase 1 over the real seed corpus:
**75 chunks (style), 110 (fitness), 111 (hair)** — an early estimate of ~500 was off by
an order of magnitude. At that size an exact sequential scan with `<=>` runs in
single-digit milliseconds, and `ivfflat` would be strictly worse.
`ivfflat` with default `lists` performs *worse* at this scale and needs training
data. If chunk count ever passes ~100k, add `hnsw (embedding vector_cosine_ops)`.

### Template coaches

Ingestion writes into one **template coach per domain** (`status = 'template'`).
User onboarding creates a new coach and clones `videos` + `chunks` rows to it.
See Decision 1.

---

## 5. Ingest pipeline (CLI, not an endpoint)

```
pnpm --filter api ingest --domain fitness --seed seeds/fitness.json
```

Seed manifest: `{ "domain": "fitness", "sources": ["<channel|playlist|video url>", ...] }`.

### Steps

1. **Expand sources.** `yt-dlp --flat-playlist -J <url>` → list of video ids. Cap at
   `--max-videos` (default 8) to keep runtime and rate-limit exposure bounded.
2. **Fetch metadata + subtitles**, one call per video:
   ```
   yt-dlp --skip-download --write-auto-subs --sub-langs "es.*,es" \
          --sub-format vtt --write-info-json \
          -o ".cache/yt/%(id)s.%(ext)s" <video_url>
   ```
   Files land in `.cache/yt/`. **Never re-download if the file already exists** —
   this is what makes the pipeline resumable and what keeps us off YouTube's rate
   limiter on re-runs.
3. **Parse VTT → cues** `{ startSeconds, text }`.
4. **Chunk** cues into ~500-token blocks.
5. **Embed** chunks in batches of 64.
6. **Insert** video + chunks in one transaction per video.

### Idempotency and resumability

- `unique (coach_id, youtube_id)` — re-running skips videos already present.
- A video is considered done only if it has ≥ 1 chunk row; partial videos are
  deleted and retried.
- Downloaded VTT/JSON files are cached on disk, so a re-run after a crash performs
  zero network calls to YouTube.
- Embedding failures abort that video only; the CLI continues and reports at the end.

### VTT parsing — the gotcha that breaks naive parsers

YouTube auto-generated subtitles are **not** clean cue lists:

- Cues overlap heavily: each cue repeats the tail of the previous cue plus a few new
  words (a rolling window). Concatenating raw cue text produces 2–3× duplicated text.
- Cue bodies contain inline timing markup: `<00:00:03.520><c>palabra</c>`.
- Some cues are blank or whitespace-only.

Parser contract:
1. Strip all `<...>` tags from cue bodies.
2. Collapse whitespace, drop empty cues.
3. Deduplicate: keep a cue's text only if it is not a suffix-overlap of the
   accumulated text — append only the delta. Simplest robust rule: track the last
   emitted line; if the new line starts with, ends with, or equals the previous line,
   emit only the non-overlapping remainder.
4. Emit `{ startSeconds: Math.floor(cueStart), text }`.

A 5-minute unit smoke test over one real fixture VTT is the only test in scope.

### Chunking

- Target **1800–2200 characters** per chunk (≈ 500 tokens for Spanish).
- Accumulate cues in order; close the chunk when the character budget is reached.
- `start_seconds` = start of the **first cue** in the chunk.
- **No overlap** between chunks — overlap complicates the timestamp mapping and buys
  little at this corpus size.

---

## 6. Retrieval

Query embedding: the raw user message, embedded with the same model (1536 dims).

```sql
select c.text, c.start_seconds, v.title, v.youtube_id, v.channel,
       1 - (c.embedding <=> $1::vector) as score
from chunks c
join videos v on v.id = c.video_id
where v.coach_id = $2
order by c.embedding <=> $1::vector
limit 8;
```

`<=>` is cosine distance in pgvector. OpenAI embeddings are already normalized.

No metadata filtering, no re-ranking, no query rewriting. Top-k = 8, fixed.

---

## 7. Chat + citations

### Endpoint

```
POST /api/coaches/:id/messages
body: { content: string, mode?: "coach" | "generic" }
→ text/event-stream
```

`mode` defaults to `"coach"`. `mode: "generic"` skips retrieval entirely and uses a
neutral system prompt — see Decision 3.

### SSE frames

The browser **cannot use `EventSource`** here: `EventSource` is GET-only and we need
a POST body. The client uses `fetch()` + `response.body.getReader()` and parses SSE
frames manually (~20 lines). This is a known cost; budget for it in Phase 3.

Frame order matters for the demo:

```
event: citations
data: {"citations":[{"n":1,"title":"...","youtubeId":"...","startSeconds":412,"channel":"..."}]}

event: token
data: {"text":"Para tu tipo de "}

event: token
data: {"text":"pelo lo que recomienda..."}

event: done
data: {"messageId":"..."}
```

Citations are emitted **first**, as soon as retrieval returns — the source cards
render while the answer is still streaming. That is the visual beat the demo depends on.

An `event: error` frame with `{ "message": string }` closes the stream on failure.

### System prompt structure

```
<role>
{persona_prompt for the domain}
</role>

<user_profile>
{3 answers rendered as "question: answer" lines}
</user_profile>

<sources>
[1] {video title} — {mm:ss}
{chunk text}

[2] {video title} — {mm:ss}
{chunk text}
...
</sources>

<rules>
- Answer using ONLY the material in <sources>. You have no other knowledge about this topic.
- Every concrete claim must end with its source marker: [1], [2], ...
- Adapt the advice to <user_profile> — reference it explicitly at least once.
- If <sources> does not cover the question, say so plainly and give the closest
  relevant advice that IS in the sources, still cited.
- Reply in Spanish, conversational, 120-200 words. No headers, no bullet lists
  unless the user asks for steps.
- Do not include internal or system XML tags in your response.
</rules>
```

**Citation rendering.** The model emits bare markers `[1]`, `[2]`. The backend
already sent the citation array, so the frontend replaces each `[n]` with a link to
`https://www.youtube.com/watch?v={youtubeId}&t={startSeconds}s`. Asking the model to
emit URLs is strictly worse: it hallucinates ids and breaks mid-token during streaming.

**Fallback per the stated risk plan:** if retrieval quality is weak in Phase 3, the
response is *not* to improve retrieval. It is to harden `<rules>` so citation usage
is mandatory and unmissable.

### Anthropic call

```ts
const stream = client.messages.stream({
  model: "claude-opus-5",
  max_tokens: 1500,
  thinking: { type: "disabled" },
  output_config: { effort: "low" },
  system: buildSystemPrompt(...),
  messages: history,
});
for await (const event of stream) { /* forward text_delta as `token` frames */ }
```

Rationale for the model config:

- `claude-opus-5` is the current default model.
- On Opus 5 **thinking is on by default**, which delays time-to-first-token. In a
  live demo, TTFT *is* the product. `thinking: { type: "disabled" }` is valid only at
  effort `high` or below, so it is paired with `effort: "low"`.
- The two known thinking-disabled failure modes are (a) tool calls emitted as plain
  text and (b) `<thinking>` tag leakage. (a) does not apply — the chat path declares
  no tools. (b) is covered by the last line of `<rules>`.
- `max_tokens: 1500` is a deliberate cap: coach answers are short by design.
- **No prompt caching.** The system prompt changes every request (retrieved chunks),
  so there is no stable cacheable prefix worth a breakpoint.

Message history: the last 6 messages from `messages` for that coach, so follow-up
questions work. Retrieval always runs on the latest user message only.

---

## 8. Comparison mode

The comparison screen fires **two independent POSTs** to the same endpoint:

- `{ content, mode: "coach" }` — full RAG pipeline.
- `{ content, mode: "generic" }` — no retrieval, neutral system prompt, same model,
  same params.

Two separate SSE connections rather than one multiplexed stream: simpler, and one
side failing does not take the other down mid-demo. Both panes stream in parallel;
only the coach pane renders citation cards.

---

## 9. Domain catalog

Hardcoded in `apps/api/src/personas.ts`. Per domain: `slug`, display name, hero
copy, `persona_prompt`, and the 3 profile questions with their option sets.

| Domain | Profile questions (3) |
| --- | --- |
| `style` | Body type / usual context (work, casual, events) / current wardrobe pain |
| `fitness` | Experience level / weekly availability / goal (strength, fat loss, mobility) |
| `hair` | Hair type / current routine / main problem (frizz, hair loss, dryness) |

Answers are stored verbatim in `coaches.user_profile` as `{ question: answer }`.

---

## 10. API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | `{ ok, db }` |
| `GET` | `/api/domains` | Catalog + profile questions |
| `POST` | `/api/coaches` | `{ domain, userProfile }` → creates coach, starts clone |
| `GET` | `/api/coaches/:id` | Coach state + `{ videosReady, videosTotal, status }` |
| `GET` | `/api/coaches/:id/messages` | Chat history |
| `POST` | `/api/coaches/:id/messages` | SSE chat stream |

All request/response bodies validated with TypeBox schemas; types re-exported from
`packages/shared` for the frontend.

---

## 11. Demo safety rules

- **All ingestion runs before the presentation.** Nothing touches YouTube on stage.
- Database is seeded and the container volume is committed to a known-good state; a
  `pnpm demo:reset` script drops user coaches and leaves templates intact.
- A pre-created "golden" coach per domain exists so the demo can skip onboarding if
  the clock runs out.
- Three rehearsed questions per domain, verified to retrieve well, written on a card.

---

## 12. Open decisions

See the three decisions below. They are recorded here so the reasoning survives the
build; Section 4 and Section 7 already assume the recommended option.

### Decision 1 — How pre-ingested video corpus reaches a newly created coach

**The ambiguity.** The schema binds `videos.coach_id` and retrieval filters by
`coach_id`, but ingestion is a pre-run CLI and a coach is created live at
onboarding. A freshly created coach therefore has zero chunks, and re-ingesting on
stage is explicitly forbidden by the risk plan.

**Options.**
- **A. Template coach + clone.** Ingest into a per-domain `status = 'template'`
  coach. Onboarding creates the user's coach and runs
  `INSERT ... SELECT` to copy `videos` and `chunks` rows to the new `coach_id`
  (10–12 videos, 75–111 chunks, well under a second).
- **B. Add `domain` to `videos`, filter by domain.** No duplication; retrieval
  filters `where v.domain = $2` instead of `coach_id`.
- **C. Singleton coach per domain**, profile kept client-side.

**Recommendation: A.** It keeps the stated retrieval predicate (`coach_id`)
untouched, and — more importantly for the demo — the clone *is* genuine work with a
per-video progress signal, which makes the "training" screen honest instead of a
fake spinner. B is the fallback if the clone ever gets slow; C conflicts with
`coaches.user_profile` being per-user.

### Decision 2 — What `user_profile` actually does

**The ambiguity.** The 3 onboarding answers exist, but the spec never says whether
they filter retrieval or only shape the prompt.

**Options.**
- **A. Prompt conditioning only.** Profile is rendered into `<user_profile>` and the
  rules force the model to reference it.
- **B. Retrieval filtering / boosting** by profile-derived metadata.

**Recommendation: A.** With only 75–111 chunks per coach, any filtering destroys recall and
produces empty or irrelevant source sets — the exact failure that would kill the
demo. Prompt conditioning is also more *visible*: the answer opens with something
like "con tu pelo rizado y rutina de 2 lavados por semana…", which reads as
personalization on stage. B is out of scope entirely.

### Decision 3 — What the "generic LLM" baseline is in comparison mode

**The ambiguity.** "Un LLM genérico" is unspecified. The comparison is the whole
demo, so this defines what the audience concludes.

**Options.**
- **A. Same model, same params, neutral system prompt, no retrieval.**
- **B. A deliberately weaker/cheaper model.**
- **C. Same model with a prompt that forbids specifics.**

**Recommendation: A.** It isolates exactly one variable — the retrieved expert
corpus — so the difference on screen is attributable to the product rather than to
model choice. It is also the version that survives a skeptical judge asking "are you
just comparing a big model to a small one?". B and C are rigged and read as rigged.

The neutral prompt is one line: *"Eres un asistente útil. Responde a la pregunta del
usuario."* Nothing else — no persona, no profile, no sources.

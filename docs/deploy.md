# Deploy — Render

Everything is declared in `render.yaml` at the repo root. This file is the order the steps
have to happen in, because two of them are order-dependent and doing them backwards costs
a full rebuild.

**Context this runbook assumes:** the demo is presented *from the public URL*. That is why
the API is on a paid plan and why the domain has to be wired before the frontend is built.

## Shape

| Service | Type | Plan | Why |
| --- | --- | --- | --- |
| `sourced-api` | Node web service | **starter** | A free service sleeps after 15 min and takes ~1 min to wake |
| `sourced-web` | Static site | free | Static sites never sleep |
| `sourced-db` | Postgres 16 + pgvector | free | Expires 30 days after creation |

The API cannot be serverless: `routes/coaches.ts:123` fires the corpus clone detached from
the request, and `routes/messages.ts:59` writes SSE straight to the socket after
`reply.hijack()`. Both need the process to outlive the response.

## Blockers to clear first

1. **This is an org repo.** Render can only connect repos you own. Mirror to a personal
   repo with the double-push remote in `README.md`, and connect Render to the mirror.
2. **Registrar access** for `trysourced.co`.
3. **A card on the Render account** — `starter` is a paid plan.

## Why the order matters

Vite inlines `import.meta.env` at **build time**. `VITE_API_URL` is baked into the JS
bundle, so the API domain must already resolve *before* the build that bakes it in.
Otherwise you ship a frontend pointing at a dead host and have to rebuild.

Verified: a build with `VITE_API_URL=https://api.trysourced.co` puts that literal string
straight into `dist/assets/index-*.js`.

## Steps

### 1 — Apply the blueprint

Render dashboard → **New → Blueprint**, pick the mirrored repo. It reads `render.yaml` and
prompts for the two `sync: false` secrets: `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`.
`DATABASE_URL` is wired automatically to the internal connection string.

The first web build bakes `https://api.trysourced.co`, which does not resolve yet. Expected
— it gets fixed in step 4.

### 2 — Add the custom domains

- `sourced-api` → `api.trysourced.co`
- `sourced-web` → `trysourced.co` **and** `www.trysourced.co`

Render prints the exact DNS records for each (CNAME for the subdomains, A/ALIAS for the
apex).

### 3 — Create the DNS records, then wait

```bash
dig +short api.trysourced.co
dig +short trysourced.co
```

Do not continue until both resolve and Render reports the TLS certificate as issued. The
certificate cannot be issued before the domain resolves.

### 4 — Redeploy the web service

Now that `api.trysourced.co` resolves, redeploy `sourced-web` with **Clear build cache**.
This is the build whose bundle actually works.

### 5 — Schema and corpus

Grab the **External** connection string from the database page and append TLS:

```bash
export DATABASE_URL='postgresql://…render.com/sourced?sslmode=require'

pnpm db:migrate:remote                          # creates the vector extension + 4 tables
DATABASE_URL="$DATABASE_URL" pnpm ingest -- --domain all
```

The ingest reuses the VTTs already in `.cache/yt/`, so it makes **zero YouTube calls** —
it only re-embeds ~296 chunks, which is cents of OpenAI. That is cheaper and less fragile
than dumping and restoring `vector` columns.

If the connection fails on certificate validation, use `?sslmode=no-verify`. If it fails to
connect at all, check the database's IP allow list.

Confirm before moving on — expect `style 10/75`, `fitness 11/110`, `hair 12/111`:

```bash
pnpm db:migrate:remote >/dev/null && psql "$DATABASE_URL" -c \
  "select c.domain, count(distinct v.id) videos, count(ch.id) chunks
     from coaches c
     left join videos v on v.coach_id = c.id
     left join chunks ch on ch.video_id = v.id
    where c.status = 'template' group by c.domain order by c.domain"
```

### 6 — Golden coaches

`demo:reset` already does this — point it at production and it deletes the rehearsal
coaches, rebuilds one ready golden coach per domain, and prints the deep links with the
right origin:

```bash
DATABASE_URL="$DATABASE_URL" WEB_ORIGIN=https://trysourced.co pnpm demo:reset
```

Write the printed `https://trysourced.co/?coach=<id>` links on the card. Each one lands
straight in the chat with a trained coach, skipping onboarding if the clock runs out.

It also prints the rehearsed questions per domain. Templates and their corpus are never
touched, so this is safe to re-run between dry runs.

### 7 — Tighten the allow list

`render.yaml` opens the database to `0.0.0.0/0` so the ingest can run from your laptop.
Narrow it once the corpus is loaded.

## Demo-day checklist

- **Warm the API.** Starter does not sleep, but the first request after a deploy still pays
  a cold start. Hit `https://api.trysourced.co/health` before you walk up.
- **Re-measure time-to-first-token from the venue network.** The 746 ms / 2.15 s in
  `docs/tasks.md` were measured against localhost. Deployed, every request pays
  Bogotá→Ohio round trips plus the Anthropic call. Know the real number before the demo
  tells you.
- **Verify in a fresh private window.** The PWA service worker runs in `autoUpdate` mode
  and pins old assets; your own browser is the least trustworthy test.
- **Write the `.onrender.com` URLs on the card** as a fallback if the domain or cert
  misbehaves. They keep working after the custom domain is added.
- **No DNS changes and no deploys within an hour of going on stage.**

## Fallbacks

| Problem | Fix |
| --- | --- |
| DNS is slow and you are out of time | Set `VITE_API_URL` to the API's `.onrender.com` URL, redeploy web, switch to the domain later |
| Blueprint rejects the `headers` block | Delete it from `render.yaml`, add the same `/sw.js` no-cache rule from the dashboard |
| Build fails resolving pnpm | Replace `corepack enable` with `npm i -g pnpm@11.15.1` in both build commands |
| Stale frontend after a redeploy | DevTools → Application → Service Workers → Unregister, then hard reload |

## Known gaps, deliberately not changed

- **`/health` returns 200 even when the database is unreachable** (`server.ts:26` returns
  `{ ok: db, db }` with a 200 either way). Render's health check will therefore pass a
  deploy that cannot serve a single answer. Making it 503 when `db` is false would let
  Render roll back automatically, but it changes the `HealthResponse` contract in
  `packages/shared` — a decision, not a cleanup.
- **CORS is `origin: true`** (`server.ts:11`), which reflects any origin. Acceptable for a
  public demo; pin it to the domain if this outlives the hackathon.
- **`demo:reset` connects with whatever `DATABASE_URL` is in scope.** Run against production
  it deletes every non-template coach there. Templates and the corpus survive, but any live
  conversation does not — do not run it while someone is using the URL.

-- Coach corpus schema. Idempotent: safe to re-run.

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists coaches (
  id             uuid primary key default gen_random_uuid(),
  domain         text not null,
  persona_prompt text not null,
  user_profile   jsonb not null default '{}'::jsonb,
  status         text not null default 'draft',   -- template | training | ready
  created_at     timestamptz not null default now()
);

create table if not exists videos (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references coaches(id) on delete cascade,
  youtube_id text not null,
  title      text not null,
  channel    text not null,
  url        text not null,
  unique (coach_id, youtube_id)
);

create table if not exists chunks (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid not null references videos(id) on delete cascade,
  text          text not null,
  start_seconds integer not null,
  embedding     vector(1536) not null
);

create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references coaches(id) on delete cascade,
  role       text not null,                       -- user | assistant
  content    text not null,
  citations  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists videos_coach_id_idx    on videos (coach_id);
create index if not exists chunks_video_id_idx    on chunks (video_id);
create index if not exists messages_coach_id_idx  on messages (coach_id, created_at);

-- One template coach per domain. Ingestion writes here; onboarding clones from here.
create unique index if not exists coaches_template_domain_idx
  on coaches (domain) where status = 'template';

-- No ANN index on chunks.embedding on purpose: at <50k rows an exact scan with <=>
-- is single-digit ms, and ivfflat performs worse without training data.
-- If chunk count passes ~100k, add:
--   create index on chunks using hnsw (embedding vector_cosine_ops);

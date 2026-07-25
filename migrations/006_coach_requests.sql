-- "If your expert isn't here, ask for one and we'll train it" — the pitch is literally
-- true, because training is the ingest CLI a human runs. This table is the asking half.
create table if not exists coach_requests (
  id         uuid primary key default gen_random_uuid(),
  topic      text not null,
  created_at timestamptz not null default now()
);

-- Requests are grouped case- and whitespace-insensitively, so "Finanzas" and
-- " finanzas " count as the same demand instead of two entries of one.
create index if not exists coach_requests_topic_idx
  on coach_requests (lower(btrim(topic)));

-- videos.id is a random uuid, so ordering by it shuffles the training screen as each
-- cloned video lands. Insertion order is what the UI needs.
alter table videos add column if not exists created_at timestamptz not null default now();

create index if not exists videos_coach_created_idx on videos (coach_id, created_at, id);

-- Ratings belong to the domain (the "agent" a visitor picks), not to a user's cloned
-- coach: the home screen shows one score per domain, aggregated across everyone.
create table if not exists ratings (
  id         uuid primary key default gen_random_uuid(),
  domain     text not null,
  -- Kept so one coach can only hold one opinion; null once the coach is deleted, which
  -- retains the score in the aggregate instead of silently lowering the count.
  coach_id   uuid references coaches(id) on delete set null,
  stars      integer not null check (stars between 1 and 5),
  created_at timestamptz not null default now()
);

create index if not exists ratings_domain_idx on ratings (domain);

-- One rating per coach, so re-rating updates instead of stuffing the ballot.
create unique index if not exists ratings_coach_idx on ratings (coach_id)
  where coach_id is not null;

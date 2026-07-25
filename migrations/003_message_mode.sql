-- Comparison mode runs two independent conversations against the same coach. Without a
-- mode column the generic pane would inherit the coach pane's history and the two sides
-- would stop being comparable.
alter table messages add column if not exists mode text not null default 'coach';

create index if not exists messages_coach_mode_idx on messages (coach_id, mode, created_at);

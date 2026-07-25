-- The user and assistant rows of one exchange are written in a single INSERT, so they
-- share created_at (a transaction timestamp) and the tiebreaker fell through to a random
-- uuid — which put the assistant turn before the user turn roughly half the time.
-- A monotonic sequence is the only ordering that survives same-statement inserts.
alter table messages add column if not exists seq bigserial;

create index if not exists messages_coach_seq_idx on messages (coach_id, mode, seq);

-- Seed the ratings table without touching coaches.
--
--   docker run --rm -i postgres:16 psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < scripts/seed-ratings.sql
--
-- Why this exists next to demo:reset instead of inside it: `pnpm demo:reset` seeds these
-- same rows, but it also deletes every non-template coach and rebuilds the golden ones
-- with NEW ids, which invalidates any ?coach=<id> deep link already written on the demo
-- card. This file is the half you can run without paying that price.
--
-- Deliberately NOT in migrations/: this is demo data, not schema, and scripts/migrate.sh
-- re-applies every migration on each run — it would re-seed on every deploy.
--
-- The distribution is copied verbatim from apps/api/src/scripts/demo.ts so the aggregate
-- matches what was verified locally: style 4.5 (12), fitness 4.5 (13), hair 4.7 (10).

begin;

-- Only the seeded rows. A real vote carries a coach_id and has to survive, so if a judge
-- rates a coach live during the demo, re-running this file does not erase their vote.
delete from ratings where coach_id is null;

insert into ratings (domain, stars) values
  ('style', 5), ('style', 5), ('style', 4), ('style', 5), ('style', 4), ('style', 5),
  ('style', 3), ('style', 4), ('style', 5), ('style', 5), ('style', 4), ('style', 5),
  ('fitness', 5), ('fitness', 4), ('fitness', 5), ('fitness', 5), ('fitness', 5),
  ('fitness', 4), ('fitness', 4), ('fitness', 5), ('fitness', 5), ('fitness', 3),
  ('fitness', 5), ('fitness', 4), ('fitness', 5),
  ('hair', 5), ('hair', 5), ('hair', 5), ('hair', 4), ('hair', 5),
  ('hair', 4), ('hair', 5), ('hair', 5), ('hair', 4), ('hair', 5);

commit;

select domain,
       round(avg(stars)::numeric, 1) as promedio,
       count(*) as votos
  from ratings
 group by domain
 order by domain;

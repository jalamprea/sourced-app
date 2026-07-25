/**
 * Demo safety net.
 *
 *   pnpm demo:reset
 *
 * Deletes every coach created during rehearsal — templates and their ingested corpus are
 * never touched — then rebuilds one ready "golden" coach per domain and prints a deep
 * link for each. If the clock runs out on stage, open a link and land straight in the
 * chat with a trained coach, skipping onboarding entirely.
 */
import { pool } from '../db.ts';
import { DOMAINS } from '../personas.ts';
import { cloneCorpus, templateCoachId } from '../coach/clone.ts';

const GOLDEN_PROFILES: Record<string, Record<string, string>> = {
  style: {
    body: 'Rectangular',
    context: 'Trabajo casual',
    pain: 'No sé qué me favorece',
  },
  fitness: {
    level: 'Menos de 1 año',
    availability: '3 días',
    goal: 'Perder grasa',
  },
  hair: {
    type: 'Rizado',
    routine: '2 veces por semana',
    problem: 'Caída del cabello',
  },
};

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

try {
  const { rowCount } = await pool.query(`delete from coaches where status <> 'template'`);
  console.log(`borrados ${rowCount ?? 0} coaches de prueba (templates intactos)`);

  console.log('\nrecreando coaches golden:');
  const links: string[] = [];

  for (const domain of DOMAINS) {
    const templateId = await templateCoachId(domain.slug);
    if (!templateId) {
      console.log(`  ${domain.slug.padEnd(8)} SIN CORPUS — corré: pnpm ingest -- --domain ${domain.slug}`);
      continue;
    }

    const { rows } = await pool.query<{ id: string }>(
      `insert into coaches (domain, persona_prompt, user_profile, status)
       values ($1, $2, $3, 'training') returning id`,
      [domain.slug, domain.personaPrompt, JSON.stringify(GOLDEN_PROFILES[domain.slug] ?? {})],
    );
    const coachId = rows[0]!.id;

    // No pacing here: the seed should be instant, the theatre belongs to the live flow.
    const videos = await cloneCorpus(coachId, templateId, 0);
    console.log(`  ${domain.slug.padEnd(8)} ${String(videos).padStart(2)} videos  ${coachId}`);
    links.push(`  ${domain.name}\n    ${WEB_ORIGIN}/?coach=${coachId}`);
  }

  if (links.length > 0) {
    console.log('\nlinks directos al chat (saltean el onboarding):\n');
    console.log(links.join('\n'));
  }

  // Seeded so the home screen is not empty on stage. These are demo rows in the same
  // table real ratings land in — not a hardcoded number in the UI — so the score shown
  // is always the real aggregate of whatever the database holds. Say so if asked.
  await pool.query(`delete from ratings where coach_id is null`);
  const seed: Record<string, number[]> = {
    style: [5, 5, 4, 5, 4, 5, 3, 4, 5, 5, 4, 5],
    fitness: [5, 4, 5, 5, 5, 4, 4, 5, 5, 3, 5, 4, 5],
    hair: [5, 5, 5, 4, 5, 4, 5, 5, 4, 5],
  };
  for (const [domain, stars] of Object.entries(seed)) {
    for (const value of stars) {
      await pool.query('insert into ratings (domain, stars) values ($1, $2)', [domain, value]);
    }
  }
  const { rows: scores } = await pool.query<{ domain: string; avg: string; n: string }>(
    `select domain, round(avg(stars)::numeric,1)::text as avg, count(*)::text as n
       from ratings group by domain order by domain`,
  );
  console.log('\ncalificaciones sembradas (demo):');
  for (const s of scores) console.log(`  ${s.domain.padEnd(8)} ${s.avg} ★  (${s.n})`);

  console.log('\npreguntas ensayadas por dominio:\n');
  for (const domain of DOMAINS) {
    console.log(`  ${domain.name}`);
    for (const q of domain.sampleQuestions) console.log(`    · ${q}`);
  }
  console.log();
} finally {
  await pool.end();
}

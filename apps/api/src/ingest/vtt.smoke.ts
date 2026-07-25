/**
 * The only test in scope for the hackathon. Runs against two trimmed fixtures cut from
 * the same real video — one manual caption track, one auto-generated — because the
 * strongest available correctness signal is that two very different input formats must
 * converge on the same transcript.
 *
 *   pnpm --filter api test
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVtt } from './vtt.ts';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures');
const read = (name: string) => readFileSync(resolve(fixtures, name), 'utf8');

const manual = parseVtt(read('manual.es.vtt'));
const auto = parseVtt(read('auto.es.vtt'));

const words = (cues: { text: string }[]) =>
  cues
    .map((c) => c.text)
    .join(' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL  ${name}\n      ${(err as Error).message.split('\n')[0]}`);
  }
}

console.log('vtt parser');

check('both fixtures produce cues', () => {
  assert.ok(manual.length > 0, 'manual produced no cues');
  assert.ok(auto.length > 0, 'auto produced no cues');
});

check('markup and entities are stripped', () => {
  for (const cue of [...manual, ...auto]) {
    assert.ok(!cue.text.includes('<'), `leftover tag: ${cue.text}`);
    assert.ok(!/&[a-z]+;|&#\d+;/i.test(cue.text), `leftover entity: ${cue.text}`);
  }
});

check('timestamps are monotonic', () => {
  for (const cues of [manual, auto]) {
    for (let i = 1; i < cues.length; i++) {
      assert.ok(
        cues[i]!.startSeconds >= cues[i - 1]!.startSeconds,
        `timestamp went backwards at cue ${i}`,
      );
    }
  }
});

check('no cue repeats the previous one (rolling window collapsed)', () => {
  for (const cues of [manual, auto]) {
    for (let i = 1; i < cues.length; i++) {
      assert.notEqual(cues[i]!.text, cues[i - 1]!.text, `duplicate cue at ${i}`);
    }
  }
});

check('auto captions are not systematically duplicated', () => {
  const w = words(auto);
  const shingles = new Map<string, number>();
  for (let i = 0; i + 5 <= w.length; i++) {
    const key = w.slice(i, i + 5).join(' ');
    shingles.set(key, (shingles.get(key) ?? 0) + 1);
  }
  const repeated = [...shingles.values()].filter((n) => n > 1).length;
  const ratio = repeated / Math.max(shingles.size, 1);
  // The rolling window would push this above 0.4; natural speech repetition stays low.
  assert.ok(ratio < 0.15, `repeated 5-word shingles ratio ${ratio.toFixed(3)} is too high`);
});

check('manual and auto tracks of the same video agree', () => {
  const a = words(manual);
  const b = words(auto);
  const overlap = Math.min(a.length, b.length);
  assert.ok(overlap > 40, `fixtures too small to compare (${overlap} words)`);
  // Compare the leading span both fixtures cover; auto captions differ in punctuation
  // and casing, so require a high — not perfect — token agreement.
  const span = Math.floor(overlap * 0.8);
  let same = 0;
  for (let i = 0; i < span; i++) if (a[i] === b[i]) same++;
  const agreement = same / span;
  assert.ok(agreement > 0.9, `token agreement ${agreement.toFixed(3)} below 0.9`);
});

check('non-speech markers are dropped', () => {
  for (const cue of [...manual, ...auto]) {
    assert.ok(!/^\[.*\]$/.test(cue.text), `non-speech marker kept: ${cue.text}`);
  }
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');

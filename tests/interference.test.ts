import assert from 'node:assert/strict';
import test from 'node:test';
import { interfere, reportFreshness } from '../src/quantum/interference.ts';
import type { Report } from '../src/state/types.ts';

function report(overrides: Partial<Report> & Pick<Report, 'id'>): Report {
  const { id, ...rest } = overrides;
  return {
    id,
    ts: Date.now(),
    area: 'kurla',
    text: 'Water is rising near the bridge.',
    language: 'en',
    source: 'citizen',
    location: { x: 0, y: 0 },
    flags: [],
    ...rest,
    reporterId: overrides.reporterId || id,
  };
}

test('two independent reports at 0.6 combine constructively with visibility 2', () => {
  const result = interfere([
    report({ id: 'rep-a', reporterId: 'reporter-a', credibility: 0.6 }),
    report({ id: 'rep-b', reporterId: 'reporter-b', credibility: 0.6 }),
  ]);
  assert.ok(Math.abs(result.visibility - 2) < 1e-9);
  assert.equal(result.verdict, 'constructive');
  assert.ok(result.path.length === 3);
});

test('repeated reports from one reporter are discounted against independent evidence', () => {
  const repeated = interfere(Array.from({ length: 5 }, (_, index) =>
    report({ id: `repeat-${index}`, reporterId: 'same-person', credibility: 0.6 })
  ));
  const independent = interfere([
    report({ id: 'independent-a', reporterId: 'person-a', credibility: 0.6 }),
    report({ id: 'independent-b', reporterId: 'person-b', credibility: 0.6 }),
  ]);
  assert.ok(repeated.credibility < independent.credibility);
  assert.equal(repeated.terms.length, 1);
});

test('a supporting report and contradicted report destructively interfere', () => {
  const result = interfere([
    report({ id: 'support', reporterId: 'supporter', credibility: 0.6 }),
    report({
      id: 'contradicted',
      reporterId: 'contradicted-source',
      credibility: 0.6,
      credibilityReasons: ['Contradicted by IMD alert: "No flooding reported"'],
    }),
  ]);
  assert.equal(result.verdict, 'destructive');
  assert.ok(result.credibility < 0.01);
  assert.ok(result.intensity < 1e-25);
});

test('empty evidence returns the no-evidence result', () => {
  const result = interfere([]);
  assert.equal(result.verdict, 'no-evidence');
  assert.equal(result.credibility, 0);
  assert.equal(result.visibility, 1);
  assert.deepEqual(result.path, [{ x: 0, y: 0 }]);
});

test('flood and collapse reports decay with distinct half-lives and fresh confirmation restores amplitude', () => {
  const now = Date.now();
  const flood = report({ id: 'flood', text: 'Flood depth is 40 cm', ts: now - 30 * 60_000 });
  const collapse = report({ id: 'collapse', text: 'Building collapse reported', ts: now - 90 * 60_000 });
  assert.ok(Math.abs(reportFreshness(flood, now) - Math.exp(-1)) < 1e-10);
  assert.ok(Math.abs(reportFreshness(collapse, now) - Math.exp(-1)) < 1e-10);
  const stale = interfere([flood]);
  const confirmed = interfere([{ ...flood, id: 'fresh-confirmation', ts: now }]);
  assert.ok(confirmed.intensity > stale.intensity);
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ENTANGLE Unit-Style Self-Checks
 * STRICT REQUIREMENT:
 * Runs on load in dev mode and prints pass/fail to console:
 * 1. Replaying all events yields identical state
 * 2. Version equals event count
 */

import { INITIAL_DERIVED_STATE, reduceAllEvents } from './reducer.ts';
import { useWorldStore } from './store.ts';

export function runWorldStateSelfChecks(): {
  allPassed: boolean;
  checks: { name: string; passed: boolean; message: string }[];
} {
  const store = useWorldStore.getState();
  const events = store.events;
  const version = store.version;

  const results: { name: string; passed: boolean; message: string }[] = [];

  // Check 1: Version equals event count
  const check1Passed = version === events.length;
  results.push({
    name: 'Version equals event count',
    passed: check1Passed,
    message: check1Passed
      ? `State version (v${version}) matches event count (${events.length})`
      : `MISMATCH: State version is v${version} but events count is ${events.length}`,
  });

  // Check 2: Replaying all events yields identical state
  const replayedState = reduceAllEvents(events, INITIAL_DERIVED_STATE);

  // Deep comparison of key projections
  const reportsMatch = JSON.stringify(replayedState.reports) === JSON.stringify(store.reports);
  const incidentsMatch = JSON.stringify(replayedState.incidents) === JSON.stringify(store.incidents);
  const volunteersMatch = JSON.stringify(replayedState.volunteers) === JSON.stringify(store.volunteers);
  const resourcesMatch = JSON.stringify(replayedState.resources) === JSON.stringify(store.resources);
  const plansMatch = JSON.stringify(replayedState.plans) === JSON.stringify(store.plans);
  const killMatch = replayedState.isKilled === store.isKilled;

  const check2Passed =
    reportsMatch && incidentsMatch && volunteersMatch && resourcesMatch && plansMatch && killMatch;

  results.push({
    name: 'Replaying all events yields identical state',
    passed: check2Passed,
    message: check2Passed
      ? `Determinism confirmed: Replaying all ${events.length} events from zero matches current derived state exactly`
      : `MISMATCH during replay: Reports(${reportsMatch}), Incidents(${incidentsMatch}), Volunteers(${volunteersMatch}), Plans(${plansMatch})`,
  });

  const allPassed = results.every(r => r.passed);

  // Print styled output to console
  if (typeof window !== 'undefined') {
    console.group(
      `%c[ENTANGLE SHARED WORLDSTATE VERIFICATION] %c${allPassed ? 'ALL CHECKS PASSED' : 'CHECK FAILED'}`,
      'font-weight: bold; color: #4F7C82; font-size: 11px;',
      `font-weight: bold; color: ${allPassed ? '#5F7A61' : '#9E2F22'}; font-size: 11px;`
    );

    results.forEach(check => {
      if (check.passed) {
        console.log(
          `%c✓ PASS %c${check.name}: %c${check.message}`,
          'color: #5F7A61; font-weight: bold;',
          'color: #3A2E26; font-weight: bold;',
          'color: #7A6A5A;'
        );
      } else {
        console.error(
          `%c✕ FAIL %c${check.name}: %c${check.message}`,
          'color: #9E2F22; font-weight: bold;',
          'color: #3A2E26; font-weight: bold;',
          'color: #9E2F22;'
        );
      }
    });

    console.groupEnd();
  }

  return { allPassed, checks: results };
}

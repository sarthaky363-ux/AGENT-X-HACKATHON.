import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMumbaiRainfall, readCachedMumbaiRainfall } from '../src/services/openMeteo.ts';
import { useWorldStore } from '../src/state/store.ts';

test('Open-Meteo parser selects the nearest Mumbai hourly precipitation value', () => {
  const parsed = parseMumbaiRainfall({
    hourly: {
      time: ['2026-11-11T09:00', '2026-11-11T10:00', '2026-11-11T11:00'],
      precipitation: [0, 3.2, 1.1],
    },
  }, Date.parse('2026-11-11T10:15:00+05:30'));
  assert.deepEqual(parsed, { rainfallMmHr: 3.2, observedAt: '2026-11-11T10:00' });
  assert.throws(() => parseMumbaiRainfall({ hourly: { time: [], precipitation: [] } }));
});

test('rainfall updates are replayable and cached values expire after six hours', () => {
  useWorldStore.getState().resetToInitialDemo();
  useWorldStore.getState().setRainfallContext(8.5, 'live');
  assert.equal(useWorldStore.getState().context.rainfallMmHr, 8.5);
  assert.equal(useWorldStore.getState().rainfallSource, 'live');
  useWorldStore.getState().replayFromZero();
  assert.equal(useWorldStore.getState().context.rainfallMmHr, 8.5);
  assert.equal(useWorldStore.getState().rainfallSource, 'live');

  const storage = {
    getItem: () => JSON.stringify({
      rainfallMmHr: 4,
      observedAt: '2026-11-11T10:00',
      savedAt: 1_000,
    }),
  };
  assert.equal(readCachedMumbaiRainfall(storage, 2_000)?.rainfallMmHr, 4);
  assert.equal(readCachedMumbaiRainfall(storage, 1_000 + 6 * 60 * 60 * 1000 + 1), null);
});

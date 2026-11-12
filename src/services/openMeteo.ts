import { fetchWithTimeout } from './fetchWithTimeout.ts';

export interface MumbaiRainfall {
  rainfallMmHr: number;
  observedAt: string;
}

export interface CachedMumbaiRainfall extends MumbaiRainfall {
  savedAt: number;
}

export const OPEN_METEO_MUMBAI_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=19.0760&longitude=72.8777&hourly=precipitation&past_days=1&forecast_days=1&timezone=Asia%2FKolkata';

export function parseMumbaiRainfall(payload: unknown, now = Date.now()): MumbaiRainfall {
  if (!payload || typeof payload !== 'object') throw new Error('Open-Meteo returned an invalid response.');
  const hourly = (payload as { hourly?: { time?: unknown; precipitation?: unknown } }).hourly;
  if (!Array.isArray(hourly?.time) || !Array.isArray(hourly?.precipitation) ||
      hourly.time.length === 0 || hourly.time.length !== hourly.precipitation.length) {
    throw new Error('Open-Meteo response is missing aligned hourly precipitation data.');
  }
  const times = hourly.time as unknown[];
  const precipitation = hourly.precipitation as unknown[];
  const index = times.reduce((bestIndex: number, entry: unknown, candidate: number) => {
    if (typeof entry !== 'string' || !Number.isFinite(Date.parse(`${entry}:00+05:30`))) return bestIndex;
    const timestamp = Date.parse(`${entry}:00+05:30`);
    const bestEntry = times[bestIndex];
    if (typeof bestEntry !== 'string' || !Number.isFinite(Date.parse(`${bestEntry}:00+05:30`))) return candidate;
    const bestTimestamp = Date.parse(`${bestEntry}:00+05:30`);
    return Math.abs(timestamp - now) < Math.abs(bestTimestamp - now) ? candidate : bestIndex;
  }, 0);
  if (typeof times[index] !== 'string' || !Number.isFinite(Date.parse(`${times[index]}:00+05:30`))) {
    throw new Error('Open-Meteo response does not contain a valid hourly timestamp.');
  }
  const rainfall = precipitation[index];
  if (typeof rainfall !== 'number' || !Number.isFinite(rainfall) || rainfall < 0) {
    throw new Error('Open-Meteo precipitation was not a non-negative finite value.');
  }
  return { rainfallMmHr: rainfall, observedAt: times[index] };
}

export async function fetchMumbaiRainfall(
  fetcher: typeof fetch = fetchWithTimeout,
  now = Date.now()
): Promise<MumbaiRainfall> {
  const response = await fetcher(OPEN_METEO_MUMBAI_URL);
  if (!response.ok) throw new Error(`Open-Meteo request failed with HTTP ${response.status}.`);
  return parseMumbaiRainfall(await response.json(), now);
}

const CACHE_KEY = 'entangle.open-meteo.mumbai-rainfall.v1';
const MAX_CACHE_AGE_MS = 6 * 60 * 60 * 1000;

export function readCachedMumbaiRainfall(storage: Pick<Storage, 'getItem'>, now = Date.now()): CachedMumbaiRainfall | null {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CachedMumbaiRainfall>;
    if (typeof value.rainfallMmHr !== 'number' || !Number.isFinite(value.rainfallMmHr) ||
        typeof value.observedAt !== 'string' || typeof value.savedAt !== 'number' ||
        now - value.savedAt > MAX_CACHE_AGE_MS) return null;
    return {
      rainfallMmHr: value.rainfallMmHr,
      observedAt: value.observedAt,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

export function writeCachedMumbaiRainfall(
  storage: Pick<Storage, 'setItem'>,
  rainfall: MumbaiRainfall,
  savedAt = Date.now()
): void {
  storage.setItem(CACHE_KEY, JSON.stringify({ ...rainfall, savedAt }));
}

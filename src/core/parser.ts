import type { TorqueRow } from './types';

/**
 * Parser for Torque Pro logs.
 *
 * Migration note (legacy `index.php:68`):
 * the old demo file is NOT valid JSON — it is concatenated objects
 * `{...},{...},` with a trailing comma. The old code fixed that with
 * `"[" + rtrim(trim(raw), ",") + "]"`. We accept all three shapes:
 * valid array, concatenated objects, or a single object.
 */

export interface ParseResult {
  rows: TorqueRow[];
  warnings: string[];
}

/** Legacy sentinel meaning "odometer unknown" — old code carried max forward. */
export const ODO_SENTINEL = 1.677721e7;

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function parseTorqueText(text: string): ParseResult {
  const warnings: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], warnings: ['Empty file.'] };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    // Legacy NDJSON-ish shape: wrap into an array.
    try {
      raw = JSON.parse('[' + trimmed.replace(/,\s*$/, '') + ']');
      warnings.push('Legacy concatenated-object format detected (auto-wrapped into an array).');
    } catch {
      throw new Error('Could not parse log: expected a JSON array or concatenated {...},{...} objects.');
    }
  }

  const list = Array.isArray(raw) ? raw : [raw];
  const rows: TorqueRow[] = [];
  let maxOdo = NaN;

  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;

    const currTime = num(r.currTime ?? r.time ?? r.timestamp, NaN);
    if (!Number.isFinite(currTime)) continue; // unusable without a timestamp

    // Legacy override: GPS speed wins when present (index.php:79).
    let speed = num(r.speedKmh, 0);
    const gps = num(r.speedKmhGPS, -1);
    if (gps !== -1) speed = gps;

    let odo = num(r.odoKm, NaN);
    if (odo === ODO_SENTINEL) odo = maxOdo; // carry forward, like the old code
    if (Number.isFinite(odo)) maxOdo = Number.isNaN(maxOdo) ? odo : Math.max(maxOdo, odo);

    rows.push({
      currTime: Math.floor(currTime),
      lon: num(r.lon ?? r.lng ?? r.longitude, NaN),
      lat: num(r.lat ?? r.latitude, -1),
      alt: num(r.alt ?? r.altitude, 0),
      instCon: num(r.instCon, -1),
      speedKmh: speed,
      odoKm: odo,
      outC: num(r.outC ?? r.temp ?? r.outsideTemp, 0),
      FuelPct: num(r.FuelPct ?? r.fuel ?? r.fuelPct, 0),
      CarId: String(r.CarId ?? r.carId ?? r.car ?? 'default'),
    });
  }

  // Keep chronological order; warn if the file was shuffled.
  let ordered = true;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].currTime < rows[i - 1].currTime) {
      ordered = false;
      break;
    }
  }
  if (!ordered) {
    rows.sort((a, b) => a.currTime - b.currTime);
    warnings.push('Rows were out of order — sorted by timestamp.');
  }

  if (rows.length === 0) warnings.push('No usable rows found.');
  return { rows, warnings };
}

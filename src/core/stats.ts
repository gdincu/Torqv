import type { TorqueRow } from './types';

/**
 * Trip statistics — O(N) single-pass port of legacy `LiveData.php`.
 *
 * Rules preserved:
 * - sugMode = DRIVE when speedKmh > 1, else IDLE
 * - rows with odoKm == -1 or instCon == -1 are skipped entirely
 *   (stats keep their previous value, `prevRow` stays at the last
 *   valid row — matches the early `return` in `processRow`)
 * - on a mode change the elapsed segment [startRow .. r] is credited
 *   to the OLD mode, where r is the previous row when the time gap
 *   exceeds 60 s, else the current row
 * - the trailing segment is credited to the current mode (legacy
 *   `processRow(false)` final flush)
 *
 * Improvement: instead of re-scanning 0..frame per frame (O(N^2) in
 * legacy `index.php:143`), we precompute prefix accumulators once so
 * every frame lookup is O(1). Snapshot[i] equals what the legacy code
 * displayed at frame i.
 */

export const MODE_DRIVE = 1;
export const MODE_IDLE = 3;

export interface PrefixStat {
  driveTimeSec: number;
  idleTimeSec: number;
  driveOdoKm: number;
}

function odoDelta(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return b - a;
}

export function computePrefixStats(rows: TorqueRow[]): PrefixStat[] {
  const prefix: PrefixStat[] = [];
  let driveTime = 0;
  let idleTime = 0;
  let driveOdo = 0;

  let mode = MODE_IDLE;
  let startRow: TorqueRow | null = null;
  let prevValid: TorqueRow | null = null;
  let started = false;

  // Snapshot for "stats as displayed at row i": completed segments
  // plus the in-progress segment [startRow .. upto] on the live mode.
  const snapshot = (upto: TorqueRow | null): PrefixStat => {
    let dT = driveTime;
    let iT = idleTime;
    let dO = driveOdo;
    if (upto && startRow) {
      const dt = Math.max(0, upto.currTime - startRow.currTime);
      if (mode === MODE_DRIVE) {
        dT += dt;
        dO += odoDelta(startRow.odoKm, upto.odoKm);
      } else {
        iT += dt;
      }
    }
    return { driveTimeSec: dT, idleTimeSec: iT, driveOdoKm: dO };
  };

  for (const row of rows) {
    const ok = row.odoKm !== -1 && row.instCon !== -1;
    if (!ok) {
      prefix.push(snapshot(prevValid));
      continue;
    }
    const sugMode = row.speedKmh > 1 ? MODE_DRIVE : MODE_IDLE;
    if (!started) {
      started = true;
      startRow = row;
      prevValid = row;
      mode = sugMode;
      prefix.push(snapshot(row));
      continue;
    }
    if (startRow && prevValid && mode !== sugMode) {
      const gap = row.currTime - prevValid.currTime;
      const r = gap > 60 ? prevValid : row;
      const dt = Math.max(0, r.currTime - startRow.currTime);
      if (mode === MODE_DRIVE) {
        driveTime += dt;
        driveOdo += odoDelta(startRow.odoKm, r.odoKm);
      } else {
        idleTime += dt;
      }
      mode = sugMode;
      startRow = row;
    }
    prevValid = row;
    prefix.push(snapshot(row));
  }

  return prefix;
}

export function tripTotals(
  rows: TorqueRow[],
  prefix: PrefixStat[],
): { driveTimeSec: number; idleTimeSec: number; driveOdoKm: number; tripOdoKm: number } {
  const last = prefix[prefix.length - 1] ?? { driveTimeSec: 0, idleTimeSec: 0, driveOdoKm: 0 };
  let minOdo = Infinity;
  let maxOdo = -Infinity;
  for (const r of rows) {
    if (!Number.isFinite(r.odoKm)) continue;
    if (r.odoKm < minOdo) minOdo = r.odoKm;
    if (r.odoKm > maxOdo) maxOdo = r.odoKm;
  }
  const tripOdoKm = maxOdo > -Infinity && minOdo < Infinity ? Math.max(0, maxOdo - minOdo) : 0;
  return { driveTimeSec: last.driveTimeSec, idleTimeSec: last.idleTimeSec, driveOdoKm: last.driveOdoKm, tripOdoKm };
}

import { readFileSync } from 'node:fs';
import { parseTorqueText } from '../src/core/parser';
import { computePrefixStats, tripTotals } from '../src/core/stats';
import { PlaybackEngine } from '../src/core/playback';
import { formatHourMin, formatDateUTC, formatSpeed, formatInst } from '../src/core/format';

const assert = (c: boolean, m: string) => {
  if (!c) {
    console.error('FAIL:', m);
    process.exitCode = 1;
  } else console.log('ok:', m);
};

// 1. legacy concatenated format
const legacy = readFileSync('../TorqueProVisualizer/demo_data.json', 'utf8');
const p1 = parseTorqueText(legacy);
assert(p1.rows.length === 3465, `legacy parses to 3465 rows (got ${p1.rows.length})`);
assert(p1.warnings.length > 0, 'legacy warns about wrapped format');

// 2. valid array (bundled sample)
const sample = readFileSync('public/demo_sample.json', 'utf8');
const p2 = parseTorqueText(sample);
assert(p2.rows.length === 300, 'sample parses to 300 rows');

// 3. stats totals ≈ trip duration
const prefix = computePrefixStats(p1.rows);
const t = tripTotals(p1.rows, prefix);
const dur = p1.rows[p1.rows.length - 1].currTime - p1.rows[0].currTime;
assert(
  Math.abs(t.driveTimeSec + t.idleTimeSec - dur) < 5,
  `drive+idle ≈ duration (${t.driveTimeSec + t.idleTimeSec} vs ${dur})`,
);
assert(t.tripOdoKm > 0, `trip distance positive: ${t.tripOdoKm.toFixed(2)} km`);
console.log(`drive/idle/dist: ${t.driveTimeSec}s / ${t.idleTimeSec}s / ${t.tripOdoKm.toFixed(2)}km`);

// 4. playback
const eng = new PlaybackEngine(p1.rows);
eng.seekFraction(0.5);
assert(Math.abs(eng.progress - 0.5) < 0.01, 'seek 0.5 → progress 0.5');
const f = eng.frame();
assert(!!f && f.index > 1000 && f.index < 2500, `mid-trip index sane: ${f?.index}`);
eng.play();
const before = eng.logicalSec;
eng.update(1); // 1 wall-sec at 7x
assert(eng.logicalSec === before + 7, 'speedup advances logical clock (+7s)');

// 5. formatting parity
assert(formatHourMin(3661) === '01h01m', 'formatHourMin 3661 → 01h01m');
assert(formatDateUTC(1699783526) === '2023-11-12 10:05', `UTC date label: ${formatDateUTC(1699783526)}`);
assert(formatSpeed(8) === '008 km/h', 'speed pad');
assert(formatInst(14.57) === 'Instant: 14.5%', `inst format: ${formatInst(14.57)}`);

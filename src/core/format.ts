/** Display formatting. Matches legacy `formatHourMin` + `gmdate("Y-m-d H:i")`. */

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');

export function formatHourMin(timeSec: number): string {
  const s = Math.max(0, Math.floor(timeSec));
  return `${pad2(Math.floor(s / 3600))}h${pad2(Math.floor((s % 3600) / 60))}m`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(r)}` : `${m}:${pad2(r)}`;
}

/** UTC label, like the legacy `gmdate("Y-m-d H:i")`. */
export function formatDateUTC(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

export function formatSpeed(kmh: number): string {
  return `${pad3(Math.round(kmh))} km/h`;
}

export function formatInst(inst: number): string {
  const v = Math.max(0, inst);
  const whole = Math.floor(v);
  const frac = Math.floor((v - whole) * 10);
  return `Instant: ${pad2(whole)}.${frac}%`;
}

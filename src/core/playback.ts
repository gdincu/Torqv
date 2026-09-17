import type { TorqueRow } from './types';
import { lerp } from './geo';

/**
 * Frame-accurate playback engine.
 *
 * Legacy model: render frame N = log row N (with `speedup` row-skipping).
 * New model: logical trip time advances by wallClock * speedup and we
 * binary-search the row index, interpolating lat/lon between rows so the
 * car glides smoothly even at 30x on a 120 Hz phone display.
 */
export interface Frame {
  index: number;
  row: TorqueRow;
  prev: TorqueRow | null;
  interpLon: number;
  interpLat: number;
  /** Fraction of the whole trip elapsed (0..1). */
  progress: number;
}

export class PlaybackEngine {
  readonly rows: TorqueRow[];
  readonly startTime: number;
  readonly endTime: number;
  readonly durationSec: number;

  logicalSec = 0;
  index = 0;
  playing = false;
  speedup = 7;

  constructor(rows: TorqueRow[]) {
    this.rows = rows;
    this.startTime = rows.length ? rows[0].currTime : 0;
    this.endTime = rows.length ? rows[rows.length - 1].currTime : 0;
    this.durationSec = Math.max(0, this.endTime - this.startTime);
  }

  get progress(): number {
    if (this.durationSec <= 0 || this.rows.length <= 1) return this.rows.length ? 1 : 0;
    return Math.min(1, Math.max(0, this.logicalSec / this.durationSec));
  }

  play(): void {
    if (!this.rows.length) return;
    if (this.logicalSec >= this.durationSec) this.logicalSec = 0; // replay
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  toggle(): boolean {
    if (this.playing) this.pause();
    else this.play();
    return this.playing;
  }

  seekFraction(f: number): void {
    this.logicalSec = Math.min(1, Math.max(0, f)) * this.durationSec;
    this.reindex();
  }

  stepRows(delta: number): void {
    this.pause();
    this.index = Math.min(this.rows.length - 1, Math.max(0, this.index + delta));
    this.logicalSec = this.rows.length ? this.rows[this.index].currTime - this.startTime : 0;
  }

  /** Advance by wall-clock seconds; returns the current frame. */
  update(dtWallSec: number): Frame | null {
    if (!this.rows.length) return null;
    if (this.playing) {
      this.logicalSec += dtWallSec * this.speedup;
      if (this.logicalSec >= this.durationSec) {
        this.logicalSec = this.durationSec;
        this.playing = false; // stop at the end (UI flips the button back)
      }
      this.reindex();
    }
    return this.frame();
  }

  frame(): Frame | null {
    if (!this.rows.length) return null;
    const index = Math.min(this.index, this.rows.length - 1);
    const row = this.rows[index];
    const prev = index > 0 ? this.rows[index - 1] : null;
    const t = this.startTime + this.logicalSec;
    let interpLon = row.lon;
    let interpLat = row.lat;
    if (prev && Number.isFinite(prev.lat) && Number.isFinite(row.lat) && row.currTime > prev.currTime) {
      const f = Math.min(1, Math.max(0, (t - prev.currTime) / (row.currTime - prev.currTime)));
      interpLat = lerp(prev.lat, row.lat, f);
      interpLon = lerp(prev.lon, row.lon, f);
    }
    return { index, row, prev, interpLon, interpLat, progress: this.progress };
  }

  private reindex(): void {
    const t = this.startTime + this.logicalSec;
    let lo = 0;
    let hi = this.rows.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.rows[mid].currTime <= t) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    this.index = ans;
  }
}

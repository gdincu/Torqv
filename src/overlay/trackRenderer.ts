import type { TorqueRow } from '../core/types';
import { headingDeg } from '../core/geo';

/**
 * Canvas 2D overlay: track polyline + car marker + trip label.
 *
 * Legacy parity (`index.php:151-186`):
 * - segment color by CarId: `elantra_red_r` -> blue, `elantra_red_l` ->
 *   red, anything else -> green (the legacy quirk is kept so old logs
 *   look identical; see README migration table)
 *
 * Car marker: a user-supplied/default PNG sprite drawn upright
 * (no rotation) when available, otherwise a built-in vector marker.
 */
export const TRACK_COLORS: Record<string, string> = {
  elantra_red_r: '#1c4cbf',
  elantra_red_l: '#ff7878',
};
export const TRACK_FALLBACK = '#00cc66';

export function trackColor(carId: string): string {
  return TRACK_COLORS[carId] ?? TRACK_FALLBACK;
}

export type Projector = (lon: number, lat: number) => { x: number; y: number };

export class TrackRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  /** Custom/default car sprite. Drawn upright (no rotation) when set + loaded. */
  private carSprite: HTMLImageElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not supported.');
    this.ctx = ctx;
  }

  setCarSprite(img: HTMLImageElement | null): void {
    this.carSprite = img;
  }

  /** Size the backing store to the displayed size × devicePixelRatio. */
  resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  cssSize(): { w: number; h: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }

  draw(
    rows: TorqueRow[],
    uptoIndex: number,
    car: { lon: number; lat: number },
    tripLabel: string,
    project: Projector,
    dark: boolean,
  ): void {
    const { ctx } = this;
    const { w, h } = this.cssSize();
    ctx.clearRect(0, 0, w, h);

    // Track: one sub-path per color run so CarId changes don't break the line.
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let runColor = '';
    let penDown = false;
    const end = Math.min(uptoIndex, rows.length - 1);
    for (let i = 0; i <= end; i++) {
      const r = rows[i];
      if (r.lat === -1 || !Number.isFinite(r.lon) || !Number.isFinite(r.lat)) {
        penDown = false;
        continue;
      }
      const c = trackColor(r.CarId);
      if (c !== runColor) {
        if (penDown) ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = c;
        // Halo so the track reads on both light and dark basemaps.
        ctx.shadowColor = dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)';
        ctx.shadowBlur = 4;
        runColor = c;
        penDown = false;
        // Re-anchor: connect from the previous valid point.
        const p0 = i > 0 ? prevValid(rows, i - 1) : null;
        if (p0) {
          const q = project(p0.lon, p0.lat);
          ctx.moveTo(q.x, q.y);
          penDown = true;
        }
      }
      const q = project(r.lon, r.lat);
      if (!penDown) {
        ctx.moveTo(q.x, q.y);
        penDown = true;
      } else {
        ctx.lineTo(q.x, q.y);
      }
    }
    if (penDown) ctx.stroke();
    ctx.shadowBlur = 0;

    // Car marker: sprite (upright, no rotation) when available, else vector.
    const cp = project(car.lon, car.lat);
    if (!this.drawCarSprite(cp.x, cp.y)) {
      const anchor = rows[end];
      const ref = anchor && anchor.lat !== -1 ? anchor : null;
      const hd = ref ? headingDeg(ref.lat, ref.lon, car.lat, car.lon) || headingDegOf(rows, end) : 0;
      this.drawCar(cp.x, cp.y, hd, dark);
    }

    // Trip label under the car (legacy `%0.0fkm` red text).
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = dark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)';
    ctx.strokeText(tripLabel, cp.x, cp.y + 34);
    ctx.fillStyle = '#e5484d';
    ctx.fillText(tripLabel, cp.x, cp.y + 34);
  }

  private drawCarSprite(x: number, y: number): boolean {
    const img = this.carSprite;
    if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) return false;
    try {
      // Fit the longest side to ~44px, keep aspect, draw centered + upright.
      const target = 44;
      const scale = target / Math.max(img.naturalWidth, img.naturalHeight);
      const w = Math.max(1, img.naturalWidth * scale);
      const h = Math.max(1, img.naturalHeight * scale);
      const { ctx } = this;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 6;
      ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
      ctx.restore();
      return true;
    } catch {
      return false;
    }
  }

  private drawCar(x: number, y: number, heading: number, dark: boolean): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((heading * Math.PI) / 180);
    const L = 26; // length (px, along heading)
    const W = 14; // width
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 6;
    // Body
    ctx.fillStyle = dark ? '#f2f4f8' : '#1b2330';
    roundRect(ctx, -L / 2, -W / 2, L, W, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Windshield + rear window
    ctx.fillStyle = dark ? '#1b2330' : '#9fc2e8';
    roundRect(ctx, 0, -W / 2 + 2.5, L / 2 - 5, W - 5, 2);
    ctx.fill();
    roundRect(ctx, -L / 2 + 3, -W / 2 + 2.5, 5, W - 5, 2);
    ctx.fill();
    // Heading nose
    ctx.fillStyle = '#e5484d';
    ctx.beginPath();
    ctx.moveTo(L / 2 + 5, 0);
    ctx.lineTo(L / 2 - 1, -4);
    ctx.lineTo(L / 2 - 1, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function prevValid(rows: TorqueRow[], from: number): TorqueRow | null {
  for (let i = from; i >= 0; i--) {
    const r = rows[i];
    if (r.lat !== -1 && Number.isFinite(r.lon) && Number.isFinite(r.lat)) return r;
  }
  return null;
}

function headingDegOf(rows: TorqueRow[], end: number): number {
  const a = prevValid(rows, end - 1);
  const b = prevValid(rows, end);
  if (!a || !b) return 0;
  return headingDeg(a.lat, a.lon, b.lat, b.lon);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

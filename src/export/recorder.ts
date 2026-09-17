import type { OsdSnapshot } from '../core/types';
import { formatDateUTC, formatHourMin, formatInst, formatSpeed } from '../core/format';

/**
 * Realtime exporter: composites the GPU basemap + track overlay + OSD
 * onto one canvas and records it with MediaRecorder.
 *
 * Why composite manually: the map is WebGL and the track is a separate
 * transparent canvas — `overlay.captureStream()` alone would give a
 * track on a transparent background. Drawing both (cover-fit) plus the
 * OSD text reproduces exactly what the user sees.
 *
 * Codec: prefer VP9 WebM, then VP8, then Safari's MP4 support. The
 * result downloads as `.webm` or `.mp4` accordingly. Faster-than-
 * realtime / 4K H.264 is a documented follow-up (Tauri + ffmpeg, see
 * README) — phones throttle on sustained 4K software encode.
 */
export class Exporter {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private raf = 0;
  private running = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not supported.');
    this.ctx = ctx;
  }

  get isRecording(): boolean {
    return this.running;
  }

  pickMime(): { mime: string; ext: string } {
    const cands: Array<[string, string]> = [
      ['video/webm;codecs=vp9', 'webm'],
      ['video/webm;codecs=vp8', 'webm'],
      ['video/webm', 'webm'],
      ['video/mp4', 'mp4'],
    ];
    for (const [mime, ext] of cands) {
      try {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return { mime, ext };
      } catch {
        /* ignore */
      }
    }
    return { mime: '', ext: 'webm' };
  }

  supported(): boolean {
    return typeof MediaRecorder !== 'undefined';
  }

  start(
    mapCanvas: HTMLCanvasElement | null,
    overlayCanvas: HTMLCanvasElement,
    osd: () => OsdSnapshot,
    width: number,
    height: number,
  ): void {
    if (this.running) return;
    if (!this.supported()) throw new Error('MediaRecorder is not supported in this browser.');
    this.canvas.width = width;
    this.canvas.height = height;
    const { mime } = this.pickMime();
    this.chunks = [];
    const stream = this.canvas.captureStream(60);
    this.rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 8_000_000,
    });
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.running = true;
    this.rec.start(500);

    const loop = () => {
      if (!this.running) return;
      this.composite(mapCanvas, overlayCanvas, osd());
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  async stop(): Promise<Blob> {
    const rec = this.rec;
    if (!rec || !this.running) return new Blob([], { type: 'video/webm' });
    this.running = false;
    cancelAnimationFrame(this.raf);
    return new Promise((resolve) => {
      rec.onstop = () => {
        const type = rec.mimeType || 'video/webm';
        resolve(new Blob(this.chunks, { type }));
      };
      rec.stop();
    });
  }

  private composite(
    mapCanvas: HTMLCanvasElement | null,
    overlayCanvas: HTMLCanvasElement,
    s: OsdSnapshot,
  ): void {
    const { ctx } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, W, H);
    if (mapCanvas && mapCanvas.width > 0) drawCover(ctx, mapCanvas, W, H);
    drawCover(ctx, overlayCanvas, W, H);

    // OSD bar (mirrors the DOM bar).
    const barH = Math.round(H * 0.062);
    ctx.fillStyle = 'rgba(10,13,19,0.72)';
    ctx.fillRect(0, 0, W, barH);
    ctx.fillStyle = '#f5f7fa';
    const fs = Math.max(12, Math.round(barH * 0.34));
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const parts = [
      formatSpeed(s.speedKmh),
      formatInst(s.instCon),
      `Fuel: ${String(Math.round(s.fuelPct)).padStart(3, '0')}%`,
      `Temp: ${String(Math.round(s.outC)).padStart(3, '0')}°C`,
      `Drv: ${formatHourMin(s.driveTimeSec)}`,
      `Idle: ${formatHourMin(s.idleTimeSec)}`,
      formatDateUTC(s.currTime),
    ];
    ctx.fillText(parts.join('   '), 14, barH / 2 + 1);
  }
}

function drawCover(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, W: number, H: number): void {
  const sw = src.width;
  const sh = src.height;
  if (!sw || !sh) return;
  const scale = Math.max(W / sw, H / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

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
    // Higher bitrate for larger frames: 8 Mbps showed blockiness on map
    // detail, so scale with resolution (≈12 Mbps at 720p, 20 Mbps at 1080p).
    const videoBitsPerSecond = width * height >= 1920 * 1080 ? 20_000_000 : 12_000_000;
    this.rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond,
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, W, H);
    if (mapCanvas && mapCanvas.width > 0) drawCover(ctx, mapCanvas, W, H);
    drawCover(ctx, overlayCanvas, W, H);

    // OSD bar with equal slots filling the full width (mirrors the DOM bar;
    // the speed cell gets 1.5x). Font auto-shrinks until every metric fits.
    const barH = Math.round(H * 0.062);
    ctx.fillStyle = 'rgba(10,13,19,0.72)';
    ctx.fillRect(0, 0, W, barH);
    const cells: Array<{ text: string; grow: number }> = [
      { text: formatSpeed(s.speedKmh), grow: 1.5 },
      { text: formatInst(s.instCon), grow: 1 },
      { text: `Fuel: ${String(Math.round(s.fuelPct)).padStart(3, '0')}%`, grow: 1 },
      { text: `Temp: ${String(Math.round(s.outC)).padStart(3, '0')}°C`, grow: 1 },
      { text: `Drv: ${formatHourMin(s.driveTimeSec)}`, grow: 1 },
      { text: `Idle: ${formatHourMin(s.idleTimeSec)}`, grow: 1 },
      { text: formatDateUTC(s.currTime), grow: 1 },
    ];
    const padX = Math.round(W * 0.012);
    const availW = W - padX * 2;
    const totalGrow = cells.reduce((n, c) => n + c.grow, 0);
    let fs = Math.max(12, Math.round(barH * 0.36));
    for (let i = 0; i < 12; i++) {
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      const fits = cells.every((c) => {
        const slot = (availW * c.grow) / totalGrow;
        return ctx.measureText(c.text).width <= slot - 8;
      });
      if (fits || fs <= 8) break;
      fs = Math.max(8, Math.floor(fs * 0.9));
    }
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    ctx.fillStyle = '#f5f7fa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let x = padX;
    for (const c of cells) {
      const slot = (availW * c.grow) / totalGrow;
      ctx.fillText(c.text, x + slot / 2, barH / 2 + 1);
      x += slot;
    }
    ctx.textAlign = 'left';
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

import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import type { OsdSnapshot, TorqueRow } from './core/types';
import { parseTorqueText } from './core/parser';
import { computePrefixStats, tripTotals, type PrefixStat } from './core/stats';
import { PlaybackEngine } from './core/playback';
import { formatDateUTC, formatDuration, formatHourMin, formatInst, formatSpeed } from './core/format';
import { MapAdapter } from './map/mapAdapter';
import { TrackRenderer } from './overlay/trackRenderer';
import { Exporter } from './export/recorder';
import { registerSW, wireInstall } from './pwa';

/** Default view = start of the legacy demo log (Craiova, RO). */
const DEFAULT_CENTER: [number, number] = [23.7786, 44.2558];
const DEFAULT_ZOOM = 12;

/** Bundled top-down car marker (transparent, drawn upright). */
const DEFAULT_CAR_SRC = './car-default.png';
const CAR_STORAGE_KEY = 'tqv-car-icon';

function loadCarImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load car icon.`));
    img.src = src;
  });
}

const $ = <T extends HTMLElement>(id: string, _guard?: new () => T): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

let rows: TorqueRow[] = [];
let prefix: PrefixStat[] = [];
let engine: PlaybackEngine | null = null;
let adapter: MapAdapter;
let renderer: TrackRenderer;
let exporter = new Exporter();
let sourceName = '';
let dark = false;

function currentSnapshot(): OsdSnapshot | null {
  const f = engine?.frame();
  if (!f || !prefix.length) return null;
  const p = prefix[f.index] ?? { driveTimeSec: 0, idleTimeSec: 0, driveOdoKm: 0 };
  return {
    speedKmh: f.row.speedKmh,
    instCon: Math.max(0, f.row.instCon),
    fuelPct: f.row.FuelPct,
    outC: f.row.outC,
    driveTimeSec: p.driveTimeSec,
    idleTimeSec: p.idleTimeSec,
    tripOdoKm: p.driveOdoKm,
    currTime: f.row.currTime,
  };
}

function loadTrip(next: TorqueRow[], name: string, warnings: string[]): void {
  rows = next;
  sourceName = name;
  prefix = computePrefixStats(rows);
  engine = new PlaybackEngine(rows);
  engine.speedup = Number(($('sel-speed') as HTMLSelectElement).value) || 7;

  const first = rows.find((r) => r.lat !== -1 && Number.isFinite(r.lon));
  if (first) adapter.jumpTo(first.lon, first.lat, adapter.map.getZoom());
  renderer.resize();

  $('btn-play', HTMLButtonElement).disabled = false;
  $('scrub', HTMLInputElement).disabled = false;
  $('btn-rec', HTMLButtonElement).disabled = !exporter.supported();

  const t = tripTotals(rows, prefix);
  $('stat-src').textContent = name;
  $('stat-pts').textContent = String(rows.length);
  $('stat-dur').textContent = engine.durationSec > 0 ? formatDuration(engine.durationSec) : '—';
  $('stat-dist').textContent = `${t.tripOdoKm.toFixed(1)} km`;
  $('stat-split').textContent = `${formatHourMin(t.driveTimeSec)} / ${formatHourMin(t.idleTimeSec)}`;

  const warn = $('warn');
  if (warnings.length) {
    warn.hidden = false;
    warn.textContent = warnings.join('\n');
  } else {
    warn.hidden = true;
  }
  setPlaying(true);
}

function setPlaying(on: boolean): void {
  if (!engine) return;
  if (on) engine.play();
  else engine.pause();
  $('btn-play').innerHTML = engine.playing ? '&#10074;&#10074; Pause' : '&#9654; Play';
}

async function loadFile(file: File): Promise<void> {
  const text = await file.text();
  try {
    const { rows: parsed, warnings } = parseTorqueText(text);
    if (!parsed.length) throw new Error('No usable rows found in this file.');
    loadTrip(parsed, file.name, warnings);
  } catch (err) {
    const warn = $('warn');
    warn.hidden = false;
    warn.textContent = err instanceof Error ? err.message : String(err);
  }
}

async function loadDemo(): Promise<void> {
  const res = await fetch('./demo_sample.json');
  if (!res.ok) throw new Error(`Demo data missing (${res.status}).`);
  const data = (await res.json()) as unknown;
  const { rows: parsed, warnings } = parseTorqueText(JSON.stringify(data));
  loadTrip(parsed, 'demo_sample.json (300 pts)', warnings);
}

function updateOsd(): void {
  const f = engine?.frame();
  const s = currentSnapshot();
  if (!f || !s || !engine) return;
  $('osd-speed').textContent = formatSpeed(s.speedKmh);
  $('osd-inst').textContent = formatInst(s.instCon);
  $('osd-fuel').textContent = `Fuel: ${String(Math.round(s.fuelPct)).padStart(3, '0')}%`;
  $('osd-temp').textContent = `Temp: ${String(Math.round(s.outC)).padStart(3, '0')}°C`;
  $('osd-drv').textContent = `Drv: ${formatHourMin(s.driveTimeSec)}`;
  $('osd-idle').textContent = `Idle: ${formatHourMin(s.idleTimeSec)}`;
  $('osd-date').textContent = formatDateUTC(s.currTime);
  const scrub = $('scrub') as HTMLInputElement;
  if (document.activeElement !== scrub) scrub.value = String(Math.round(f.progress * 1000));
  $('time-label').textContent = `${formatDuration(engine.logicalSec)} / ${formatDuration(engine.durationSec)}`;
  if (!engine.playing && engine.logicalSec >= engine.durationSec && engine.durationSec > 0) {
    $('btn-play').innerHTML = '&#9654; Replay';
  }
}

function frame(): void {
  if (engine && rows.length) {
    const f = engine.frame();
    if (f) {
      adapter.followCar(f.interpLon, f.interpLat);
      const p = prefix[f.index];
      renderer.draw(
        rows,
        f.index,
        { lon: f.interpLon, lat: f.interpLat },
        `${(p?.driveOdoKm ?? 0).toFixed(0)}km`,
        (lon, lat) => adapter.project(lon, lat),
        dark,
      );
      updateOsd();
      if (!engine.playing && $('btn-play').innerHTML.includes('Pause')) {
        $('btn-play').innerHTML = '&#9654; Play';
      }
    }
  }
}

function main(): void {
  registerSW();
  wireInstall($('btn-install'), $('install-hint'));

  adapter = new MapAdapter($('map'), DEFAULT_CENTER, DEFAULT_ZOOM);
  renderer = new TrackRenderer($('overlay') as HTMLCanvasElement);
  renderer.resize();
  window.addEventListener('resize', () => renderer.resize());
  adapter.map.on('move', () => renderer.resize());

  // Car marker: bundled default, or a custom transparent PNG from this
  // browser (localStorage). Sprite is drawn upright — no heading rotation.
  const carPreview = $('car-preview') as HTMLImageElement;
  const applyCarSrc = (src: string) => {
    // Hide the preview box while the file is missing (e.g. before
    // public/car-default.png is added) instead of showing broken-image.
    carPreview.onerror = () => {
      carPreview.style.visibility = 'hidden';
    };
    carPreview.onload = () => {
      carPreview.style.visibility = '';
    };
    carPreview.src = src;
    loadCarImage(src)
      .then((img) => renderer.setCarSprite(img))
      .catch(() => renderer.setCarSprite(null));
  };
  try {
    applyCarSrc(localStorage.getItem(CAR_STORAGE_KEY) || DEFAULT_CAR_SRC);
  } catch {
    applyCarSrc(DEFAULT_CAR_SRC);
  }
  $('car-input').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.type !== 'image/png') {
      const warn = $('warn');
      warn.hidden = false;
      warn.textContent = `Car icon must be a transparent PNG (got ${file.type || file.name}).`;
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/png')) return;
      applyCarSrc(dataUrl);
      try {
        localStorage.setItem(CAR_STORAGE_KEY, dataUrl);
      } catch {
        /* quota exceeded — icon works for this session only */
      }
    };
    reader.readAsDataURL(file);
  });
  $('btn-car-reset').addEventListener('click', () => {
    try {
      localStorage.removeItem(CAR_STORAGE_KEY);
    } catch {
      /* storage unavailable — just restore the default for now */
    }
    applyCarSrc(DEFAULT_CAR_SRC);
  });

  // Playback clock.
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (engine) engine.update(dt);
    frame();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Controls.
  $('file-input').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void loadFile(file);
    input.value = '';
  });
  $('btn-demo').addEventListener('click', () => {
    loadDemo().catch((err) => {
      const warn = $('warn');
      warn.hidden = false;
      warn.textContent = err instanceof Error ? err.message : String(err);
    });
  });
  $('btn-play').addEventListener('click', () => {
    if (engine) setPlaying(!engine.playing);
  });
  ($('sel-speed') as HTMLSelectElement).addEventListener('change', (e) => {
    if (engine) engine.speedup = Number((e.target as HTMLSelectElement).value) || 7;
  });
  ($('scrub') as HTMLInputElement).addEventListener('input', (e) => {
    engine?.seekFraction(Number((e.target as HTMLInputElement).value) / 1000);
  });
  $('btn-zin').addEventListener('click', () => adapter.zoomBy(1));
  $('btn-zout').addEventListener('click', () => adapter.zoomBy(-1));
  ($('chk-follow') as HTMLInputElement).addEventListener('change', (e) => {
    adapter.setFollow((e.target as HTMLInputElement).checked);
  });
  ($('chk-dark') as HTMLInputElement).addEventListener('change', (e) => {
    dark = (e.target as HTMLInputElement).checked;
    adapter.setDark(dark);
  });
  ($('chk-info') as HTMLInputElement).addEventListener('change', (e) => {
    ($('osd') as HTMLElement).style.display = (e.target as HTMLInputElement).checked ? '' : 'none';
  });
  adapter.setFollow(true);
  // Keep the overlay aligned while the basemap eases.
  adapter.map.on('move', () => {
    if (engine) frame();
  });

  // Export.
  const recBtn = $('btn-rec');
  const recStatus = $('rec-status');
  if (!exporter.supported()) {
    recStatus.textContent = 'Recording is not supported in this browser — try Chrome/Edge on desktop or Android.';
  }
  recBtn.addEventListener('click', () => {
    void (async () => {
      if (exporter.isRecording) {
        const blob = await exporter.stop();
        const { ext } = exporter.pickMime();
        const url = URL.createObjectURL(blob);
        const a = $('dl-link') as HTMLAnchorElement;
        a.href = url;
        a.download = `torque-trip.${ext}`;
        a.hidden = false;
        recBtn.innerHTML = '&#9679; Record';
        recStatus.textContent = `Saved ${(blob.size / 1048576).toFixed(1)} MB — use Download.`;
        if (engine) setPlaying(false);
      } else {
        if (!engine) return;
        const [w, h] = (($('sel-res') as HTMLSelectElement).value || '1280x720').split('x').map(Number);
        try {
          exporter.start(adapter.getCanvas(), renderer.canvas, () => currentSnapshot() ?? {
            speedKmh: 0, instCon: 0, fuelPct: 0, outC: 0,
            driveTimeSec: 0, idleTimeSec: 0, tripOdoKm: 0, currTime: 0,
          }, w, h);
          ($('dl-link') as HTMLAnchorElement).hidden = true;
          recBtn.innerHTML = '&#9632; Stop';
          recStatus.textContent = 'Recording… press Play and let the trip run.';
          setPlaying(true);
        } catch (err) {
          recStatus.textContent = err instanceof Error ? err.message : String(err);
        }
      }
    })();
  });
}

main();

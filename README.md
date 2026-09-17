# Torque Pro Visualizer — PWA rewrite (v2)

GPU-accelerated, installable visualizer for Torque Pro logs. Runs on a phone
or an old PC from one codebase. Files never leave the device — everything is
parsed and rendered locally.

This is a full rewrite of `../TorqueProVisualizer` (PHP + GD + ffmpeg batch
renderer). See **Migration table** below for what moved where.

## Architecture

```
index.html                  app shell (mobile-first, installable)
manifest.webmanifest        PWA manifest (standalone, icons)
public/sw.js                hand-rolled SW: app-shell offline + tile runtime cache
src/main.ts                 UI wiring: file/demo loading, transport, OSD, export
src/core/
  types.ts                  TorqueRow / TripInfo / OsdSnapshot (canonical schema)
  parser.ts                 tolerant log parser (valid array OR legacy
                            concatenated {...},{...}, + GPS-speed override,
                            odo-sentinel carry-forward)
  stats.ts                  O(N) prefix port of LiveData.php (drive/idle split)
  playback.ts               rAF engine: wallClock × speedup → binary search +
                            lat/lon interpolation (smooth at any refresh rate)
  geo.ts                    slippy-map math port of global.php + haversine
  format.ts                 formatHourMin + UTC date (gmdate parity)
src/map/
  style.ts                  keyless vector style + OSM raster fallback
  mapAdapter.ts             MapLibre GL wrapper + smooth follow-car viewport
src/overlay/
  trackRenderer.ts          Canvas overlay: CarId-colored track, vector car
                            marker with heading, trip label
src/export/
  recorder.ts               realtime composite (map + overlay + OSD) →
                            MediaRecorder (WebM/MP4 by browser support)
src/pwa.ts                  SW registration + install prompt
```

### Data flow

`log file → parser → rows → computePrefixStats (1×, O(N)) → PlaybackEngine
→ per frame: MapLibre GPU basemap + Canvas overlay + DOM OSD → optional
MediaRecorder composite export`

The legacy renderer re-scanned rows `0..frame` for **every** frame (O(N²))
on the CPU with GD. Here statistics are precomputed once; each frame is a
binary search + interpolation, and the map is drawn by the GPU — this is the
part that makes a phone faster than the old PC.

## Migration table (v1 → v2)

| v1 | v2 | Notes |
|---|---|---|
| `index.php` `EvDashboardOverview` | `src/main.ts` + `src/overlay/trackRenderer.ts` + `src/map/mapAdapter.ts` | same OSD fields, same follow behavior |
| `LiveData.php` mode `>1 km/h → drive` | `src/core/stats.ts` | identical rules incl. 60 s gap + trailing flush; O(N) prefix instead of O(N²) |
| `global.php` tile math | `src/core/geo.ts` | same formulas; tile *fetching* deleted — GPU vector tiles instead |
| `global.php:80 fetchTile` OSM scrape | `src/map/style.ts` | `demotiles` vector tiles; raster OSM fallback, both attributed |
| `GenerateVideo.bat` mjpeg → 4K mp4 | `src/export/recorder.ts` + command below | realtime WebM/MP4 in-browser; 4K via ffmpeg stays a desktop step |
| `resources/*.png` car sprites | vector marker in `trackRenderer.ts` | heading-aware, resolution-independent |
| `elantra_red_r → #1c4cbf`, `elantra_red_l → #ff7878`, else `#00cc66` | `TRACK_COLORS` / `TRACK_FALLBACK` | legacy quirk preserved on purpose |
| `svggraph.php` | deleted | dead fork leftover (undefined `$data`, missing vendored lib) |

## Deploy to GitHub Pages

`.github/workflows/deploy-pages.yml` builds (`npm ci` + `npm run build`)
and publishes `dist/` on every push to `main`. One-time setup:

1. Create the repo on GitHub (without a README — this folder is the source).
2. First push from here:
   ```powershell
   git init -b main
   git add .
   git commit -m "Torque Pro Visualizer PWA"
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. Repo → Settings → Pages → Source: **GitHub Actions**.

The site lands at `https://<you>.github.io/<repo>/`. The build uses
relative paths (`base: './'` in `vite.config.ts`), so project subpaths,
the service worker, and `demo_sample.json` all resolve correctly.

## Develop / build / run

```powershell
npm install
npm run gen:icons    # PWA icons (zero-dep generator)
npm run gen:sample   # public/demo_sample.json from the v1 demo log
npm run dev          # http://localhost:5173
npm run build        # tsc + vite build → dist/
npm run preview      # serve the production build (SW active here, not in dev)
```

Install on a phone: serve `dist/` over HTTPS (or `localhost` for testing),
open it, then *Add to Home screen* / Install. Offline works for the app
shell; map tiles are cached as you view them (capped at 300).

## Usage

1. **Open log** — pick a Torque Pro JSON export (valid array *or* the legacy
   concatenated format; both parse). Or **Load demo** for 300 bundled points.
2. Transport: play/pause, scrub, speedup `1–30×` (`7×` matches the old default).
3. Toggles: follow-car, dark map, OSD bar. Zoom `+`/`−`.
4. **Record** → captures playback in realtime → **Download** (`.webm` on
   Chrome/Edge/Firefox, `.mp4` where Safari supports it).

Optional desktop 4K (unchanged from v1's second stage):

```powershell
ffmpeg -i torque-trip.webm -pix_fmt yuv420p -c:v libx264 -crf 18 -vf scale=3840:2160 final_4K.mp4
```

## Known limits / roadmap

- Export is **realtime** (records while the trip plays). Faster-than-realtime
  and true 4K in-browser need WebCodecs + ffmpeg.wasm or a Tauri wrapper
  around the same UI with a bundled ffmpeg — the `core/` modules are already
  dependency-free so they can move verbatim.
- The free `demotiles` style is for demo use; for heavy use point
  `VECTOR_STYLE_URL` at your own tileserver / MapTiler key or a self-hosted
  PMTiles file (then the map works fully offline).
- Attribution: © OpenStreetMap contributors, © OpenMapTiles (shown in-app).

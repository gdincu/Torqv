# Torqv

Torqv is an installable web app (phone + desktop) that replays Torque Pro
trip logs on an interactive map: watch the car drive the logged route while
speed, consumption, fuel, temperature, and drive/idle stats update live.

Everything runs locally in the browser — log files never leave the device.

## Features

- **Trip playback on a real map** — GPU-rendered OpenStreetMap-based vector
  map (OpenFreeMap, no API key), with an OSM raster fallback when offline.
- **Live dashboard (OSD)** — speed, instant consumption, fuel level, outside
  temperature, drive/idle timers, and the log timestamp.
- **Transport controls** — play/pause, scrub through the trip, playback speed
  `1–30×` (default `7×`).
- **Trip stats** — point count, duration, distance, and drive/idle split.
- **Custom car marker** — a bundled default car icon plus transparent-PNG
  upload (drawn upright, stored in the browser only).
- **Video export** — record the playback to `.webm` / `.mp4` and download it.
- **Installable PWA** — Add to Home Screen / Install; the app shell works
  offline and viewed map tiles are cached on-device.
- **Demo included** — 300 bundled points via **Load demo**, no file needed.

## Log format

Open a Torque Pro JSON export. Both shapes parse:

- a valid JSON array of objects, or
- concatenated `{...},{...},` objects (auto-wrapped into an array).

Recognized fields per row (unknown fields are ignored):

| Field | Meaning |
|---|---|
| `currTime` (or `time`, `timestamp`) | Unix seconds. Required — rows without it are skipped. |
| `lat` (or `latitude`), `lon` (or `lng`, `longitude`) | Position. `lat: -1` marks a gap (no fix) and breaks the track line. |
| `speedKmh` | Speed in km/h. `speedKmhGPS`, when present, wins. |
| `odoKm` | Odometer in km. The `16777210` sentinel means “unknown” and carries the last known value forward. |
| `instCon` | Instant consumption shown in the OSD. |
| `outC` (or `temp`, `outsideTemp`) | Outside temperature in °C. |
| `FuelPct` (or `fuel`, `fuelPct`) | Fuel level in %. |
| `CarId` (or `carId`, `car`) | Colors the track: `elantra_red_r` → blue, `elantra_red_l` → red, anything else → green. |

Rows out of order are sorted by timestamp (with a warning).

## Usage

1. **Open log** — pick a Torque Pro JSON export, or **Load demo** to try it.
2. Press **Play**; drag the scrub bar or change **Speedup** anytime.
3. Toggles: **Follow car** (smooth pan), **Dark map**, **Show OSD bar**. Zoom with `+`/`−`.
4. **Car marker** — **Upload** a transparent PNG to replace the car icon, or
   **Default** to restore the bundled one. The icon is drawn upright (it does
   not rotate with heading) and is kept in the browser only.
5. **Record** — captures the playback in realtime → **Download** the video
   (`.webm` on Chrome/Edge/Firefox, `.mp4` where Safari supports it).

Optional desktop 4K from a recording:

```powershell
ffmpeg -i torque-trip.webm -pix_fmt yuv420p -c:v libx264 -crf 18 -vf scale=3840:2160 final_4K.mp4
```

## Drive / idle stats

- Speed above `1 km/h` counts as driving, otherwise idle.
- Segments separated by a time gap over `60 s` are credited up to the last
  row before the gap; the trailing segment is credited to the current mode.
- Rows with `odoKm` or `instCon` of `-1` are skipped for stats.

## Architecture

```
index.html                  app shell (mobile-first, installable)
public/manifest.webmanifest PWA manifest (standalone, icons)
public/sw.js                service worker: offline app shell + map-tile cache
public/car-default.png      bundled default car marker
public/demo_sample.json     bundled 300-point demo trip
src/main.ts                 UI wiring: loading, transport, OSD, export, car icon
src/core/
  types.ts                  TorqueRow / TripInfo / OsdSnapshot
  parser.ts                 tolerant log parser (array or concatenated objects,
                            GPS-speed override, odometer sentinel handling)
  stats.ts                  single-pass drive/idle + distance accumulators
  playback.ts               rAF engine: wall clock × speedup → binary search +
                            lat/lon interpolation
  geo.ts                    slippy-map math + haversine distance
  format.ts                 duration, speed, consumption, and UTC date labels
src/map/
  style.ts                  OpenFreeMap vector styles (light/dark) + OSM raster fallback
  mapAdapter.ts             MapLibre GL wrapper + smooth follow-car viewport
src/overlay/
  trackRenderer.ts          canvas overlay: CarId-colored track, PNG car sprite
                            (upright) with vector fallback, trip label
src/export/
  recorder.ts               realtime composite (map + overlay + OSD) →
                            MediaRecorder video
src/pwa.ts                  service-worker registration + install prompt
```

Data flow:

`log file → parser → rows → prefix stats (1×) → playback engine
→ per frame: MapLibre basemap + canvas overlay + DOM OSD → optional
MediaRecorder export`

Statistics are precomputed once per trip; each frame is a binary search plus
interpolation, and the map itself is drawn by the GPU — that combination is
what keeps playback smooth on phones.

## Develop / build / run

```powershell
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build → dist/
npm run preview      # serve the production build (service worker active here, not in dev)
npm test             # parser / stats / playback / formatting smoke tests
npm run gen:icons    # regenerate the PWA icons (zero dependencies)
```

Install on a phone: serve `dist/` over HTTPS (or `localhost` for testing),
open it, then *Add to Home screen* / Install. Offline works for the app
shell; map tiles are cached as you view them (capped at 300).

## Deploy to GitHub Pages

`.github/workflows/deploy-pages.yml` builds (`npm ci` + `npm run build`)
and publishes `dist/` on every push to `main`. One-time setup:

1. Create the repo on GitHub.
2. Push `main`.
3. Repo → Settings → Pages → Source: **GitHub Actions**.

The site lands at `https://<you>.github.io/<repo>/`. The build uses
relative paths (`base: './'` in `vite.config.ts`), so project subpaths,
the service worker, and `demo_sample.json` all resolve correctly.

## Privacy

Log files are parsed and rendered on-device. Nothing is uploaded anywhere.

## Known limits

- Export is **realtime** (it records while the trip plays). Faster-than-realtime
  and true 4K in-browser need WebCodecs + ffmpeg.wasm or a native wrapper
  around the same UI with a bundled ffmpeg — the `core/` modules are already
  dependency-free so they can move verbatim.
- The free OpenFreeMap styles are fine for normal use; for heavy use point
  `LIGHT_STYLE_URL` / `DARK_STYLE_URL` at your own tileserver / MapTiler key
  or a self-hosted PMTiles file (then the map works fully offline).
- Attribution: © OpenStreetMap contributors, styles © OpenFreeMap (shown in-app).

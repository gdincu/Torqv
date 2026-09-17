import type { StyleSpecification } from 'maplibre-gl';

/**
 * Basemap styles. No API key required.
 *
 * Default: OpenFreeMap vector tiles (GPU-rendered, worldwide OSM data
 * with roads — the whole point of the rewrite). These are maintained
 * forks of the OpenMapTiles styles served from tiles.openfreemap.org.
 * Fallback: OSM raster with proper attribution (the legacy code scraped
 * `b.tile.openstreetmap.org` with no attribution and a 0.5 s throttle
 * per tile — see `global.php:80`).
 *
 * Why not demotiles.maplibre.org anymore: that demo source has almost
 * no road detail outside a few cities, so most trips rendered on a
 * near-blank background.
 */
export const LIGHT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
/** Kept for backwards-compat imports: the default (light) vector style. */
export const VECTOR_STYLE_URL = LIGHT_STYLE_URL;

export function rasterOsmStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
        maxzoom: 19,
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };
}

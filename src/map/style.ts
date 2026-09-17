import type { StyleSpecification } from 'maplibre-gl';

/**
 * Basemap styles. No API key required.
 *
 * Default: free OpenMapTiles demo vector tiles (GPU-rendered, the whole
 * point of the rewrite). Fallback: OSM raster with proper attribution
 * (the legacy code scraped `b.tile.openstreetmap.org` with no
 * attribution and a 0.5 s throttle per tile — see `global.php:80`).
 */
export const VECTOR_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

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

import maplibregl from 'maplibre-gl';
import { VECTOR_STYLE_URL, rasterOsmStyle } from './style';

/**
 * Thin wrapper around a MapLibre GL map (GPU basemap).
 *
 * Legacy parity (`index.php:206-212`): the viewport smoothly follows the
 * car. Instead of hand-shifting a tile center, we project the car to
 * screen space and `panTo` only when it leaves a comfort box — margins
 * scale down on narrow phone screens (legacy used fixed 600px / 300px).
 */
export class MapAdapter {
  readonly map: maplibregl.Map;
  follow = true;
  private fellBack = false;
  private lastPan = 0;

  constructor(container: HTMLElement, center: [number, number], zoom: number) {
    this.map = new maplibregl.Map({
      container,
      style: VECTOR_STYLE_URL,
      center,
      zoom,
      attributionControl: false,
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    this.map.on('error', () => {
      // Vector tiles unreachable (offline / blocked)? Fall back to raster.
      if (!this.fellBack) {
        this.fellBack = true;
        this.map.setStyle(rasterOsmStyle());
      }
    });
  }

  setFollow(on: boolean): void {
    this.follow = on;
  }

  setDark(on: boolean): void {
    // The demo vector style has no dark variant; a CSS invert keeps one
    // code path for both styles. `hue-rotate` preserves map hues.
    this.map.getContainer().classList.toggle('map-dark', on);
  }

  jumpTo(lon: number, lat: number, zoom: number): void {
    this.map.jumpTo({ center: [lon, lat], zoom });
  }

  zoomBy(delta: number): void {
    if (delta > 0) this.map.zoomIn();
    else this.map.zoomOut();
  }

  followCar(lon: number, lat: number): void {
    if (!this.follow || !Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const now = performance.now();
    if (now - this.lastPan < 350) return; // don't fight the easing
    const size = this.map.getContainer().getBoundingClientRect();
    const mx = Math.min(600, size.width * 0.28);
    const my = Math.min(300, size.height * 0.28);
    const p = this.map.project([lon, lat]);
    const outside =
      p.x < mx || p.x > size.width - mx || p.y < my || p.y > size.height - my;
    if (outside) {
      this.lastPan = now;
      this.map.panTo([lon, lat], { duration: 400 });
    }
  }

  project(lon: number, lat: number): { x: number; y: number } {
    return this.map.project([lon, lat]);
  }

  getCanvas(): HTMLCanvasElement | null {
    try {
      return this.map.getCanvas();
    } catch {
      return null;
    }
  }
}

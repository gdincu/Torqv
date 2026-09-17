/** Slippy-map math + small geo helpers. Port of `global.php:45-75`. */

export function lonToTile(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

export function latToTile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom);
}

export function lonPerPixel(tileNo: number, zoom: number): number {
  const a1 = (tileNo / Math.pow(2, zoom)) * 360 - 180;
  const a2 = ((tileNo + 1) / Math.pow(2, zoom)) * 360 - 180;
  return Math.abs(a2 - a1) / 512;
}

export function latPerPixel(tileNo: number, zoom: number): number {
  const n1 = Math.PI * (1 - (2 * tileNo) / Math.pow(2, zoom));
  const n2 = Math.PI * (1 - (2 * (tileNo + 1)) / Math.pow(2, zoom));
  const a1 = (Math.atan(Math.sinh(n1)) * 180) / Math.PI;
  const a2 = (Math.atan(Math.sinh(n2)) * 180) / Math.PI;
  return Math.abs(a2 - a1) / 512;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Heading in degrees (0 = north, clockwise), for the car marker. */
export function headingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dy = lat2 - lat1;
  const dx = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

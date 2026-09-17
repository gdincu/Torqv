/** Canonical Torque Pro log row (normalized superset of the legacy PHP schema). */
export interface TorqueRow {
  currTime: number; // unix seconds
  lon: number;
  lat: number;
  alt: number;
  instCon: number;
  speedKmh: number;
  odoKm: number; // NaN when unknown (legacy sentinel 1.677721e7)
  outC: number;
  FuelPct: number;
  CarId: string;
}

export interface TripInfo {
  points: number;
  startTime: number;
  endTime: number;
  durationSec: number;
  distanceKm: number;
}

/** Snapshot of everything the OSD / exporter needs for one frame. */
export interface OsdSnapshot {
  speedKmh: number;
  instCon: number;
  fuelPct: number;
  outC: number;
  driveTimeSec: number;
  idleTimeSec: number;
  tripOdoKm: number;
  currTime: number; // unix seconds (UTC label via formatDateUTC)
}

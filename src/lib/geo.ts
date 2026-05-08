// Haversine distance in km
export function haversineKm(
  lon1: number, lat1: number, lon2: number, lat2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Returns ids of points within `radiusKm` of (lon, lat).
// Linear scan is fine up to ~10k points; swap to kdbush if dataset grows.
export function neighborsWithin(
  points: Array<{ id: number; lon: number; lat: number }>,
  lon: number,
  lat: number,
  radiusKm = 50,
): number[] {
  const out: number[] = [];
  for (const p of points) {
    if (haversineKm(lon, lat, p.lon, p.lat) <= radiusKm) out.push(p.id);
  }
  return out;
}

// Build a polygon approximating a circle of given radius (km) around a point.
export function circlePolygon(
  lon: number,
  lat: number,
  radiusKm = 50,
  steps = 96,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const R = 6371;
  const latRad = (lat * Math.PI) / 180;
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const dLat = (radiusKm / R) * Math.cos(bearing);
    const dLon = ((radiusKm / R) * Math.sin(bearing)) / Math.cos(latRad);
    coords.push([
      lon + (dLon * 180) / Math.PI,
      lat + (dLat * 180) / Math.PI,
    ]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

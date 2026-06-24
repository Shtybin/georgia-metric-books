// Server-only helper: derive feature IDs from a scope string.
// Extracted from aiAudit.functions.ts so aiOrchestrator can reuse it
// without duplicating parsing logic.
import parishesRaw from "../../public/data/parishes.geojson?raw";

const parishes = JSON.parse(parishesRaw) as GeoJSON.FeatureCollection<
  GeoJSON.Point,
  Record<string, any>
>;

export function selectFeatureIdsForScope(scope: string): number[] {
  if (scope.startsWith("ids:")) {
    return scope
      .slice(4)
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
  }
  if (scope.startsWith("uezd:")) {
    const key = scope.slice(5).toLowerCase();
    return parishes.features
      .filter((f) => {
        const u = (f.properties.uezd?.ru || f.properties.uezd?.en || "")
          .toLowerCase();
        return u.includes(key);
      })
      .map((f) => f.id as number)
      .filter((n) => Number.isFinite(n));
  }
  return parishes.features
    .map((f) => f.id as number)
    .filter((n) => Number.isFinite(n));
}

import { describe, it, expect } from "vitest";
import { HISTORICAL_MAPS } from "./tbilisi-historical";

describe("HISTORICAL_MAPS registry", () => {
  it("exposes 1898 and 1904 as fully attached tile maps", () => {
    const tileIds = HISTORICAL_MAPS
      .filter((m) => m.config?.kind === "tiles")
      .map((m) => m.id)
      .sort();
    // Защита от случайной регистрации заготовки без растра в UI выпадашек.
    expect(tileIds).toEqual(["1898", "1904"]);
  });

  it("placeholder entries have null config and are skipped by UI filters", () => {
    const placeholders = HISTORICAL_MAPS.filter((m) => m.config === null);
    expect(placeholders.length).toBeGreaterThan(0);
    for (const p of placeholders) {
      expect(p.notes, `${p.id} must explain how to attach the raster`).toBeTruthy();
    }
  });
});

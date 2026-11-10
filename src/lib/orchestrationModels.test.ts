import { describe, expect, it } from "vitest";
import { ORCHESTRATION_AUDIT_MODEL, ORCHESTRATION_GEO_MODEL } from "./orchestrationModels";

describe("requested orchestration model upgrades", () => {
  it("uses Gemini 4 Argon for deep audit", () => {
    expect(ORCHESTRATION_AUDIT_MODEL).toBe("google/gemini-4-argon");
  });
  it("uses Gemini 3.8 Flash for geolocation", () => {
    expect(ORCHESTRATION_GEO_MODEL).toBe("google/gemini-3.8-flash");
  });
});
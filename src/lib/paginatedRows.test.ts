import { expect, it } from "vitest";
import { readAllRows } from "./paginatedRows";

it("includes approved corrections beyond the first 1,000 rows", async () => {
  const records = Array.from({ length: 1702 }, (_, id) => ({ id }));
  const result = await readAllRows(async (from, to) => ({ data: records.slice(from, to + 1), error: null }));
  expect(result).toHaveLength(1702);
  expect(result[1701]).toEqual({ id: 1701 });
});

it("rejects a failed page rather than silently omitting corrections", async () => {
  await expect(readAllRows(async () => ({ data: null, error: { message: "denied" } }))).rejects.toThrow("denied");
});
// Validates public/data/unlocated.json:
//  1. contains exactly EXPECTED_COUNT records
//  2. each entry has count === 1 (no re-grouping)
//  3. stats.json matches (withoutCoords === unlocatedGroups === EXPECTED_COUNT)
//
// Run: bun scripts/check-unlocated.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EXPECTED_COUNT = 5197;
const root = process.cwd();

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const unlocated = JSON.parse(
  readFileSync(join(root, "public/data/unlocated.json"), "utf8"),
);
const stats = JSON.parse(
  readFileSync(join(root, "public/data/stats.json"), "utf8"),
);

if (!Array.isArray(unlocated)) fail("unlocated.json is not an array");

if (unlocated.length !== EXPECTED_COUNT) {
  fail(
    `unlocated.json length = ${unlocated.length}, expected ${EXPECTED_COUNT}`,
  );
}

const grouped = unlocated.filter(
  (r: any) => typeof r.count === "number" && r.count > 1,
);
if (grouped.length > 0) {
  fail(
    `Found ${grouped.length} grouped entries (count > 1). Each row must be its own entry. ` +
      `Example: ${JSON.stringify(grouped[0]).slice(0, 200)}`,
  );
}

const badCount = unlocated.filter((r: any) => r.count !== 1);
if (badCount.length > 0) {
  fail(
    `Found ${badCount.length} entries with count !== 1. Example: ${JSON.stringify(
      badCount[0],
    ).slice(0, 200)}`,
  );
}

if (stats.withoutCoords !== EXPECTED_COUNT) {
  fail(
    `stats.withoutCoords = ${stats.withoutCoords}, expected ${EXPECTED_COUNT}`,
  );
}
if (stats.unlocatedGroups !== EXPECTED_COUNT) {
  fail(
    `stats.unlocatedGroups = ${stats.unlocatedGroups}, expected ${EXPECTED_COUNT}. ` +
      `Regrouping has been re-introduced.`,
  );
}

console.log(
  `✓ unlocated.json OK: ${unlocated.length} records, all count === 1, stats consistent.`,
);

#!/usr/bin/env bun
/**
 * Lightweight mutation testing harness for src/lib/aiAuditFindings.ts.
 *
 * For each mutation we:
 *   1. patch the source file in place
 *   2. run the unit + fuzz test suites
 *   3. expect a non-zero exit (the mutant is "killed")
 *   4. restore the original source
 *
 * A surviving mutant means the test suite did NOT catch a real change to
 * the logic — i.e. the invariants are too weak. The harness exits non-zero
 * if any mutant survives.
 *
 * Run:  bun scripts/mutation-test-aiAuditFindings.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SRC = "src/lib/aiAuditFindings.ts";
const TESTS = [
  "src/lib/aiAuditFindings.test.ts",
  "src/lib/aiAuditFindings.fuzz.test.ts",
];

type Mutation = {
  id: string;
  description: string;
  find: string;
  replace: string;
};

// Each mutation targets a single logical decision in deriveFindings.
// If a fuzz/unit invariant is strong enough, the mutant must be killed.
const MUTATIONS: Mutation[] = [
  {
    id: "M1-triLang-drop-ka",
    description: "triLang no longer requires .ka",
    find: "!!yc.yearsRaw?.ru && !!yc.yearsRaw?.en && !!yc.yearsRaw?.ka",
    replace: "!!yc.yearsRaw?.ru && !!yc.yearsRaw?.en",
  },
  {
    id: "M2-triLang-drop-en",
    description: "triLang no longer requires .en",
    find: "!!yc.yearsRaw?.ru && !!yc.yearsRaw?.en && !!yc.yearsRaw?.ka",
    replace: "!!yc.yearsRaw?.ru && !!yc.yearsRaw?.ka",
  },
  {
    id: "M3-haveProposedRange-drop-order-check",
    description: "haveProposedRange ignores pStart <= pEnd",
    find: "const haveProposedRange = pStart != null && pEnd != null && pStart <= pEnd;",
    replace: "const haveProposedRange = pStart != null && pEnd != null;",
  },
  {
    id: "M4-wouldShorten-flip-start",
    description: "wouldShorten compares pStart < curStart instead of >",
    find: "(pStart > curStart || pEnd < curEnd)",
    replace: "(pStart < curStart || pEnd < curEnd)",
  },
  {
    id: "M5-wouldShorten-drop-end",
    description: "wouldShorten ignores the upper bound",
    find: "(pStart > curStart || pEnd < curEnd)",
    replace: "(pStart > curStart)",
  },
  {
    id: "M6-sameRange-always-false",
    description: "sameRange is hardcoded to false (identical ranges leak through)",
    find: "const sameRange = curStart === pStart && curEnd === pEnd;",
    replace: "const sameRange = false;",
  },
  {
    id: "M7-drop-wouldShorten-guard",
    description: "Emission skips the !wouldShorten guard",
    find: "if (triLang && haveProposedRange && !wouldShorten && !sameRange) {",
    replace: "if (triLang && haveProposedRange && !sameRange) {",
  },
  {
    id: "M8-drop-triLang-guard",
    description: "Emission skips the triLang guard",
    find: "if (triLang && haveProposedRange && !wouldShorten && !sameRange) {",
    replace: "if (haveProposedRange && !wouldShorten && !sameRange) {",
  },
  {
    id: "M9-proposed-startYear-no-min",
    description: "proposed.startYear uses raw pStart (could shorten when widened)",
    find: "if (pStart != null) proposed.startYear = Math.min(curStart ?? pStart, pStart);",
    replace: "if (pStart != null) proposed.startYear = pStart;",
  },
  {
    id: "M10-proposed-endYear-no-max",
    description: "proposed.endYear uses raw pEnd (could shorten when widened)",
    find: "if (pEnd != null) proposed.endYear = Math.max(curEnd ?? pEnd, pEnd);",
    replace: "if (pEnd != null) proposed.endYear = pEnd;",
  },
  {
    id: "M11-missing_years-ignores-ok-flag",
    description: "missing_years emits even when missing_years_ok=true",
    find: "if (ai.missing_years_ok === false && ai.missing_years_correction) {",
    replace: "if (ai.missing_years_correction) {",
  },
  {
    id: "M12-missing_years-ignores-empty",
    description: "missing_years emits for empty/null correction",
    find: "if (ai.missing_years_ok === false && ai.missing_years_correction) {",
    replace: "if (ai.missing_years_ok === false) {",
  },
  {
    id: "M13-accepts-string-years_correction",
    description: "Legacy string years_correction is no longer ignored",
    find: 'if (ai.years_ok === false && ai.years_correction && typeof ai.years_correction === "object") {',
    replace: "if (ai.years_ok === false && ai.years_correction) {",
  },
];

const original = readFileSync(SRC, "utf8");

function run(): { ok: boolean; tail: string } {
  const res = spawnSync("bunx", ["vitest", "run", ...TESTS], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = (res.stdout ?? "") + (res.stderr ?? "");
  return { ok: res.status === 0, tail: out.split("\n").slice(-15).join("\n") };
}

function applyMutation(m: Mutation): boolean {
  const count = original.split(m.find).length - 1;
  if (count !== 1) {
    console.error(`  ⚠ mutation ${m.id} matched ${count} occurrences — expected exactly 1`);
    return false;
  }
  writeFileSync(SRC, original.replace(m.find, m.replace), "utf8");
  return true;
}

function restore() {
  writeFileSync(SRC, original, "utf8");
}

async function main() {
  console.log(`Mutation testing ${SRC}`);
  console.log(`Tests: ${TESTS.join(", ")}`);
  console.log("─".repeat(70));

  // Baseline: tests must pass on unmodified source
  const baseline = run();
  if (!baseline.ok) {
    restore();
    console.error("✗ Baseline failed — fix the suite before mutation testing.");
    console.error(baseline.tail);
    process.exit(2);
  }
  console.log("✓ Baseline green\n");

  const survived: Mutation[] = [];
  const killed: Mutation[] = [];
  const invalid: Mutation[] = [];

  for (const m of MUTATIONS) {
    process.stdout.write(`[${m.id}] ${m.description} … `);
    const ok = applyMutation(m);
    if (!ok) {
      restore();
      invalid.push(m);
      continue;
    }
    const res = run();
    restore();
    if (res.ok) {
      console.log("SURVIVED ✗");
      survived.push(m);
    } else {
      console.log("killed ✓");
      killed.push(m);
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log(`Killed:   ${killed.length}/${MUTATIONS.length}`);
  console.log(`Survived: ${survived.length}`);
  if (invalid.length) console.log(`Invalid:  ${invalid.length}`);

  if (survived.length) {
    console.log("\nSurviving mutants (tests did NOT catch these changes):");
    for (const m of survived) console.log(`  • ${m.id} — ${m.description}`);
  }

  process.exit(survived.length === 0 && invalid.length === 0 ? 0 : 1);
}

process.on("SIGINT", () => { restore(); process.exit(130); });
process.on("uncaughtException", (e) => { restore(); throw e; });

main();

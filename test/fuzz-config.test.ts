/**
 * The property runner every test under `test/property/` goes through (`test/_helpers/fuzz-config.ts`):
 * how deep a run goes, which seed it starts from, and what a failure prints so it replays.
 *
 * A pull request runs each property at its own count, 100 cases unless the test names more. The
 * nightly properties run sets `COSYTE_PROPERTY_RUNS=10000`, and every property must then run that
 * many; a failure must print the `COSYTE_PROPERTY_SEED` and `COSYTE_PROPERTY_PATH` that replay it,
 * which is the line the shared nightly job records.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  checkFuzzTarget,
  checkProperty,
  fuzzTimeout,
  propertyTimeout,
} from "./_helpers/fuzz-config.js";

type Env = Record<string, string | undefined>;
type Runner = typeof checkProperty;

/** Run a property that always holds and count the cases it ran. */
function casesRun(baseRuns: number | undefined, env: Env, runner: Runner = checkProperty): number {
  let cases = 0;
  runner(
    "counts cases",
    fc.property(fc.nat(), () => {
      cases += 1;
    }),
    baseRuns,
    env,
  );
  return cases;
}

/** The message a property that fails on any number above 10 throws. */
function failureMessage(env: Env, runner: Runner = checkProperty): string {
  try {
    runner(
      "small numbers",
      fc.property(fc.nat(), (n) => n <= 10),
      100,
      env,
    );
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("the property did not fail");
}

/** The seed and path a failure message names. */
function replayOf(message: string): { seed: string; path: string } {
  const found = /COSYTE_PROPERTY_SEED=(-?\d+) COSYTE_PROPERTY_PATH=([\d:]+)/.exec(message);
  if (found === null) throw new Error(`no replay line in: ${message}`);
  return { seed: found[1] ?? "", path: found[2] ?? "" };
}

describe("the property runner", () => {
  it("runs 100 cases when neither the test nor the environment names a depth", () => {
    expect(casesRun(undefined, {})).toBe(100);
  });

  it("runs a test's own count on a pull request", () => {
    expect(casesRun(300, {})).toBe(300);
  });

  it("runs the nightly depth, COSYTE_PROPERTY_RUNS, over any test's own count", () => {
    const nightly = { COSYTE_PROPERTY_RUNS: "10000" };
    expect(casesRun(undefined, nightly)).toBe(10_000);
    expect(casesRun(300, nightly)).toBe(10_000);
  });

  it("multiplies a fuzz target's own count by NCPDP_FUZZ_RUNS, and only a fuzz target's", () => {
    expect(casesRun(100, { NCPDP_FUZZ_RUNS: "3" }, checkFuzzTarget)).toBe(300);
    expect(casesRun(100, { NCPDP_FUZZ_RUNS: "3" })).toBe(100);
  });

  it("runs the nightly depth on a fuzz target too", () => {
    expect(casesRun(300, { COSYTE_PROPERTY_RUNS: "10000" }, checkFuzzTarget)).toBe(10_000);
  });

  it("prints the seed and path of a failure, and they replay the same case", () => {
    const first = failureMessage({});
    expect(first).toContain("small numbers: property failed after");
    expect(first).toContain("Replay exactly: COSYTE_PROPERTY_SEED=");
    const { seed, path } = replayOf(first);
    const again = failureMessage({ COSYTE_PROPERTY_SEED: seed, COSYTE_PROPERTY_PATH: path });
    expect(replayOf(again).seed).toBe(seed);
    expect(again).toContain("Counterexample: [11]");
  });

  it("starts a fuzz target from NCPDP_FUZZ_SEED when the nightly fuzz run names one", () => {
    const fuzzSeed = { NCPDP_FUZZ_SEED: "4242" };
    expect(replayOf(failureMessage(fuzzSeed, checkFuzzTarget)).seed).toBe("4242");
    const both = { NCPDP_FUZZ_SEED: "4242", COSYTE_PROPERTY_SEED: "99" };
    expect(replayOf(failureMessage(both, checkFuzzTarget)).seed).toBe("99");
  });

  it("prints the replay line in a time-budget fuzz run too", () => {
    const env = { NCPDP_FUZZ_SECONDS: "1", NCPDP_FUZZ_SEED: "7" };
    expect(replayOf(failureMessage(env, checkFuzzTarget)).seed).toBe("7");
  });

  it("gives a test the time its depth needs", () => {
    expect(propertyTimeout(10_000, 100, {})).toBe(10_000);
    expect(propertyTimeout(10_000, 100, { COSYTE_PROPERTY_RUNS: "10000" })).toBe(1_000_000);
    expect(propertyTimeout(10_000, 4000, { COSYTE_PROPERTY_RUNS: "10000" })).toBe(25_000);
    expect(propertyTimeout(10_000, 4000, { COSYTE_PROPERTY_RUNS: "50" })).toBe(10_000);
    expect(propertyTimeout(10_000, 100, { NCPDP_FUZZ_SECONDS: "120" })).toBe(10_000);
    expect(fuzzTimeout(10_000, 300, {})).toBe(10_000);
    expect(fuzzTimeout(10_000, 100, { NCPDP_FUZZ_RUNS: "3" })).toBe(30_000);
    expect(fuzzTimeout(10_000, 100, { NCPDP_FUZZ_SECONDS: "120" })).toBe(240_000);
    expect(fuzzTimeout(10_000, 300, { COSYTE_PROPERTY_RUNS: "10000" })).toBe(333_334);
  });
});

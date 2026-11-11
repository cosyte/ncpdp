import { configDefaults } from "vitest/config";

import config from "./vitest.config.js";

/**
 * The Vitest run StrykerJS uses for mutation testing (`stryker.config.mjs`): the suite of
 * `vitest.config.ts`, without two folders.
 *
 * - `test/perf/`: the scaling gates read a clock and assert on ratios of time. Under Stryker's
 *   instrumentation every measured call pays for a mutant switch, so they would time out or measure
 *   the instrumentation. They check speed, not what the code returns, and run in their own job.
 * - `test/scripts/`: these test this repository's own tooling in `scripts/` (the PHI scan, the
 *   changeset and changelog gates, the release caller), not the library, and only the library is
 *   mutated. On the main branch's CI run of 2026-11-11 the PHI scan suite took 31 s, the longest
 *   file in the suite by far.
 *
 * The instrumented code runs several times slower than the plain build, so a test's budget here is
 * 60 s rather than 10 s. StrykerJS sets each mutant's own timeout from the time the test took in its
 * first run, so this budget does not slow the mutant runs.
 */
export default {
  ...config,
  test: {
    ...config.test,
    exclude: [...configDefaults.exclude, "test/perf/**", "test/scripts/**"],
    testTimeout: 60_000,
  },
};

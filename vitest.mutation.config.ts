import { configDefaults } from "vitest/config";

import config from "./vitest.config.js";

/**
 * The Vitest run StrykerJS uses for mutation testing (`stryker.config.mjs`): the suite of
 * `vitest.config.ts`, without two folders and three files.
 *
 * - `test/perf/`: the scaling gates read a clock and assert on ratios of time. Under Stryker's
 *   instrumentation every measured call pays for a mutant switch, so they would time out or measure
 *   the instrumentation. They check speed, not what the code returns, and run in their own job.
 * - `test/scripts/`: these test this repository's own tooling in `scripts/` (the PHI scan, the
 *   changeset and changelog gates, the release caller), not the library, and only the library is
 *   mutated. On the main branch's CI run of 2026-11-11 the PHI scan suite took 31 s, the longest
 *   file in the suite by far.
 * - `test/conversion-surface.test.ts`, `test/telecom/segment-inventory.test.ts` and
 *   `test/telecom/vocab-provenance.test.ts`: each reads source files under `src/` as text (what a
 *   file imports, the segment inventory's table, every code-keyed map) and checks their shape.
 *   StrykerJS rewrites those files in its sandbox to switch mutants on, so the text they read is not
 *   the committed text: the first full run, on 2026-11-11, failed within seconds on four of its
 *   eight shards, each holding a file these tests read. They check what the source says, not what
 *   it does when run.
 *
 * The instrumented code runs several times slower than the plain build, so a test's budget here is
 * 60 s rather than 10 s. StrykerJS sets each mutant's own timeout from the time the test took in its
 * first run, so this budget does not slow the mutant runs.
 */
export default {
  ...config,
  test: {
    ...config.test,
    exclude: [
      ...configDefaults.exclude,
      "test/perf/**",
      "test/scripts/**",
      "test/conversion-surface.test.ts",
      "test/telecom/segment-inventory.test.ts",
      "test/telecom/vocab-provenance.test.ts",
    ],
    testTimeout: 60_000,
  },
};

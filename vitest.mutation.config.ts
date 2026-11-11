import { configDefaults } from "vitest/config";

import config from "./vitest.config.js";

/**
 * The Vitest run StrykerJS uses for mutation testing (`stryker.config.mjs`): the suite of
 * `vitest.config.ts`, without two folders and one file, with `NCPDP_MUTATION_RUN` set.
 *
 * - `test/perf/`: the scaling gates read a clock and assert on ratios of time. Under Stryker's
 *   instrumentation every measured call pays for a mutant switch, so they would time out or measure
 *   the instrumentation. They check speed, not what the code returns, and run in their own job.
 * - `test/scripts/`: these test this repository's own tooling in `scripts/` (the PHI scan, the
 *   changeset and changelog gates, the release caller), not the library, and only the library is
 *   mutated. On the main branch's CI run of 2026-11-11 the PHI scan suite took 31 s, the longest
 *   file in the suite by far.
 * - `test/telecom/vocab-provenance.test.ts`: every test in it reads the files under `src/` as text
 *   and checks the shape of the code-keyed maps declared there. StrykerJS rewrites those files in
 *   its sandbox to switch mutants on, so the text is not the committed text, and the code it runs
 *   is module-level tables, whose mutants the score leaves out (static). It kills no scored mutant.
 *
 * `NCPDP_MUTATION_RUN` (`UNDER_MUTATION` in `test/_helpers/runtime.ts`) does two things. The few
 * tests elsewhere that read source text skip (the first full run, on 2026-11-11, failed in its
 * initial test run on the shards holding the files they read), while the rest of their files run.
 * And `test/docs-content.test.ts` builds `dist/` once, in StrykerJS's first run, from the sources
 * it has rewritten, instead of before every mutant run: on that first full run, 369 of the 387
 * mutants that timed out were covered by that file, so the length of the build, not the mutant,
 * decided whether a mutant counted as caught.
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
      "test/telecom/vocab-provenance.test.ts",
    ],
    env: { ...config.test?.env, NCPDP_MUTATION_RUN: "1" },
    testTimeout: 60_000,
  },
};

import { cosyteVitest } from "@cosyte/vitest-config";

/** Every metric at 100. */
const FULL = { lines: 100, branches: 100, functions: 100, statements: 100 };

/**
 * Vitest config for @cosyte/ncpdp from the shared @cosyte/vitest-config standard.
 *
 * Coverage is gated at 100% for lines, branches, functions and statements, across the whole package
 * and in each `src/` directory listed in `coverageDirs` (barrels excepted, per the shared standard).
 * A threshold only ever rises: a line that truly cannot be reached carries an inline `v8 ignore`
 * comment naming its reason, never a lowered number here. Add a new `src/` directory to both
 * `coverageDirs` and the thresholds below when it lands.
 *
 * THE `include` BELOW IS THE SOLE SELECTOR FOR EVERY TEST CI RUNS, and it is guarded.
 * `@cosyte/vitest-config` supplies no `include` of its own and spreads this `test` block last, so
 * narrowing this line (or adding an `exclude`, or a `projects` split) silently drops whole suites
 * while every required check stays green. Coverage cannot backstop it: coverage is measured over
 * `src/**` only, so dropping the PHI-scanner suite or the `test/property` fuzz layer costs no
 * coverage percent at all.
 *
 * `pnpm check:test-selection` is the gate. It asks vitest which files this config actually resolves
 * to and reds if a tracked test file in its subject is not among them, so a narrowing here fails a
 * required check rather than passing quietly. Widen this glob freely; narrowing it is the thing to
 * think twice about, and the gate will make you. Note the scope: only `test/property` and the PHI
 * suite are watched by a name-independent rule, so a suite renamed out of the `.test.`/`.spec.`
 * shape is invisible to it. Narrowing this glob is caught either way.
 */
export default cosyteVitest({
  coverageDirs: ["common", "script", "telecom", "profiles"],
  coverageThresholds: {
    ...FULL,
    "src/common/**": FULL,
    "src/script/**": FULL,
    "src/telecom/**": FULL,
    "src/profiles/**": FULL,
  },
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});

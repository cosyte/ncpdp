import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/ncpdp from the shared @cosyte/vitest-config standard.
 *
 * Per-directory >= 90 coverage gates on the core dir(s). Add directories to `coverageDirs` as the
 * parser grows (e.g. "model", "serialize", "helpers", "builder"): mirror @cosyte/hl7's layout once
 * the corresponding source lands.
 *
 * THE `include` BELOW IS THE SOLE SELECTOR FOR EVERY TEST CI RUNS, and it is guarded.
 * `@cosyte/vitest-config` supplies no `include` of its own and spreads this `test` block last, so
 * narrowing this line (or adding an `exclude`, or a `projects` split) silently drops whole suites
 * while every required check stays green. Coverage cannot backstop it: coverage is measured over
 * `src/**` only, so dropping the PHI-scanner suite or the `test/property` fuzz layer costs no
 * coverage percent at all.
 *
 * `pnpm check:test-selection` is the gate. It asks vitest which files this config actually resolves
 * to and reds if any tracked test file is not among them, so a narrowing here fails a required
 * check rather than passing quietly. Widen this glob freely; narrowing it is the thing to think
 * twice about, and the gate will make you.
 */
export default cosyteVitest({
  coverageDirs: ["common", "script", "telecom", "profiles"],
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});

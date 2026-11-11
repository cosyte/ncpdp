import { cosyteStryker } from "@cosyte/vitest-config/stryker";

// Mutation testing for @cosyte/ncpdp, on the shared StrykerJS config.
//
//   pnpm mutate full                         every source file; its score is the floor's
//   pnpm mutate changed --base origin/main   only the source files a change touched
//   pnpm quality:mutation [--base origin/main]
//
// The shared config mutates `src/**/*.ts` without tests, declarations, generated code and the
// barrels it finds by reading `src/` (a file of nothing but re-exports). Static mutants (code that
// runs once, when a module loads: the segment inventories, the reject and DUR vocabularies, the
// warning registries) are left out by the shared default, since no test can be traced to them and
// each one reruns the whole suite; coverage still holds every such line to having run.
export default cosyteStryker({
  // The suite without the tests that read a clock or test this repository's own tooling (see that
  // file).
  vitestConfig: "vitest.mutation.config.ts",
  stryker: {
    // A mutant times out when a test takes longer than timeoutFactor times its first, unmutated
    // run plus timeoutMS. At StrykerJS's defaults (1.5 and 5,000 ms), 387 of 4,242 scored mutants
    // timed out on the first full run (2026-11-11), and a mutant near that line can be a timeout on
    // one run and a survivor on the next, which moves the score the ratchet compares exactly. A
    // wider margin lets a slow mutant that still finishes finish every time, so only a mutant that
    // never ends times out.
    timeoutFactor: 3,
    timeoutMS: 10_000,
  },
});

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
});

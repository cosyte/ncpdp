import config from "./stryker.config.mjs";

// The full mutation run whose score `quality-floor.json` holds: every file `stryker.config.mjs`
// names, the whole of `src/` but its barrels. It runs weekly in CI
// (`.github/workflows/weekly-mutation.yml`), shared out across parallel jobs, and by hand with
// `pnpm mutate:full`. A pull request mutates every source file it changes, through
// `stryker.config.mjs`, and must kill every mutant in the lines it changed.
export default config;

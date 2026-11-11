/**
 * Where the suite is running, for the few tests that cannot run on every system and runtime CI
 * covers (Linux, Windows and macOS on Node.js, and Linux under Bun and Deno). Every test skipped
 * with these names its reason beside the skip, and the library itself is tested everywhere: what
 * is skipped starts a subprocess through a shim or tests this repository's own tooling.
 *
 * @module
 */

/** Windows, where `node_modules/.bin/*` and `pnpm` are `.cmd` shims a subprocess call without a shell cannot start. */
export const ON_WINDOWS: boolean = process.platform === "win32";

/**
 * A mutation run: `vitest.mutation.config.ts` sets `NCPDP_MUTATION_RUN`. StrykerJS rewrites the files
 * under `src/` in its sandbox to switch mutants on, so a test that reads their text skips here; it
 * checks what the source says, and runs in `pnpm test` on every pull request.
 */
export const UNDER_MUTATION: boolean = process.env["NCPDP_MUTATION_RUN"] === "1";

/** Deno, whose `node` runs a `.ts` script itself rather than through the `tsx` loader. */
export const ON_DENO: boolean = "Deno" in globalThis;

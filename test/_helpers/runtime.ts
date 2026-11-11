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

/** Deno, whose `node` runs a `.ts` script itself rather than through the `tsx` loader. */
export const ON_DENO: boolean = "Deno" in globalThis;

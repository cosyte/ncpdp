/**
 * `pnpm attw`: the shared attw publish gate, `cosyte-attw` from `@cosyte/script-utils`, run in this
 * process with every argument passed on, except on Windows.
 *
 * Not on Windows: the gate starts `npm`, `pnpm` and `attw` by name with no shell, and Windows cannot
 * start their `.cmd` launchers that way, so on every Node.js line there it fails before it reads the
 * package (`spawnSync ... node_modules\.bin\attw ENOENT`). The gate checks the built files in the
 * tarball npm would publish, which are the same bytes on every system, and it runs on Linux and
 * macOS in CI and on Linux before every release. Once `cosyte-attw` starts its tools through a
 * shell or `process.execPath` on Windows, this file goes and the script is `cosyte-attw` again.
 */

import { runAttwCli } from "@cosyte/script-utils/attw";

if (process.platform === "win32") {
  console.log(
    "attw: skipped on Windows, where cosyte-attw cannot start the .cmd launchers of npm, pnpm and attw; it runs on Linux and macOS (scripts/attw.ts)",
  );
} else {
  process.exitCode = runAttwCli(process.argv.slice(2));
}

/**
 * Runs every example under `examples/*.ts` (depth 1) against the BUILT package and fails if any of
 * them fails. Each example checks its own output and exits non-zero on a mismatch; this runner also
 * requires the `<name>: ok` line each one prints last, so an example that stopped early without an
 * error still fails. An empty `examples/` fails too: a runner that ran nothing proves nothing.
 *
 * The examples import `@cosyte/ncpdp/<subpath>` by name, which Node resolves through this
 * package's own `exports` map to `dist/`, so build first:
 *
 *     pnpm build && pnpm examples
 *
 * File names are passed to `spawnSync` as arguments, never through a shell.
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";

const root = join(import.meta.dirname, "..");
const tsx = join(root, "node_modules", ".bin", "tsx");

const examples = readdirSync(join(root, "examples"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => entry.name)
  .sort();

if (examples.length === 0) {
  console.error("FAIL no examples found under examples/, so nothing was run");
  process.exit(1);
}

let failed = 0;
for (const file of examples) {
  const marker = `${basename(file, ".ts")}: ok`;
  const result = spawnSync(tsx, [join("examples", file)], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const markerSeen = result.stdout.split("\n").includes(marker);

  if (result.error !== undefined || result.status !== 0 || !markerSeen) {
    failed += 1;
    const cause = result.error === undefined ? "" : ` (${result.error.message})`;
    console.error(`FAIL ${file}`);
    console.error(`  exit status: ${String(result.status)}${cause}`);
    console.error(`  final line "${marker}" printed: ${String(markerSeen)}`);
    if (result.stderr !== "") console.error(result.stderr.trimEnd().replace(/^/gm, "  | "));
    continue;
  }
  console.log(`OK   ${file}`);
}

console.log(`${String(examples.length - failed)} of ${String(examples.length)} examples passed`);
process.exit(failed === 0 ? 0 : 1);

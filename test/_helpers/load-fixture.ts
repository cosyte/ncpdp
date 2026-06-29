import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Read a synthetic SCRIPT fixture from `test/fixtures/script/`.
 *
 * All fixtures are fully synthetic — no real PHI. Loader for the accuracy corpus.
 *
 * @param name - File name under `test/fixtures/script/` (e.g. `newrx-basic.xml`).
 * @returns The file contents as UTF-8.
 */
export function loadScriptFixture(name: string): string {
  return readFileSync(join(here, "..", "fixtures", "script", name), "utf8");
}

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

/**
 * Read a synthetic Telecommunication-standard fixture from
 * `test/fixtures/telecom/`. The framing control chars (FS/GS/RS, 0x1C–0x1E)
 * are valid single-byte code points, so a UTF-8 read is lossless and the
 * returned string can be passed straight to `parseTelecom`.
 *
 * All fixtures are fully synthetic — no real BIN/PCN/NDC/cardholder.
 *
 * @param name - File name under `test/fixtures/telecom/` (e.g. `pbm-person-code.ncpdp`).
 * @returns The file contents as UTF-8.
 */
export function loadTelecomFixture(name: string): string {
  return readFileSync(join(here, "..", "fixtures", "telecom", name), "utf8");
}

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fences, messageLiterals, section } from "./_helpers/first-use.js";

/**
 * The first example under the README's `## Usage` is EXECUTED here, and the output block printed
 * beside it is the assertion. An npm README is frozen at publish, so a wrong example there cannot be
 * corrected short of another release.
 *
 * The block is READ OUT OF README.md at test time, never copied into this file. It runs in a
 * subprocess against the source entry point of the subpath it imports (`src/<subpath>/index.ts`,
 * the single file the bundler compiles into that subpath's published artifact), with only the
 * package specifier rewritten. Running against the source rather than `dist/` keeps this suite out
 * of the `dist/` rebuild `test/docs-content.test.ts` performs in parallel.
 *
 * SECURITY: the subprocess is spawned with spawnSync and array args; no shell.
 */
const root = join(import.meta.dirname, "..");
const readme = readFileSync(join(root, "README.md"), "utf8");
const tsx = join(root, "node_modules", ".bin", "tsx");
const CASE_TIMEOUT = 120_000;

const usage = fences(section(readme, "## Usage"));
const example = usage[0];
const shown = usage[1];

let dir = "";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ncpdp-readme-usage-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** `@cosyte/ncpdp` or `@cosyte/ncpdp/<sub>` to the source entry point of that subpath. */
function sourceEntry(specifier: string): string {
  const sub = specifier.slice("@cosyte/ncpdp".length).replace(/^\//, "");
  return join(root, "src", sub, "index.ts");
}

function run(source: string, fileName: string): { code: number; stdout: string; stderr: string } {
  const rewritten = source.replace(
    /(\bfrom\s*)"(@cosyte\/ncpdp(?:\/[\w-]+)?)"/g,
    (_m, kw: string, spec: string) => `${kw}${JSON.stringify(sourceEntry(spec))}`,
  );
  expect(rewritten, "the example imports the package").not.toBe(source);
  const path = join(dir, fileName);
  writeFileSync(path, `${rewritten}\n`, "utf8");
  const r = spawnSync(tsx, [path], { cwd: root, encoding: "utf8", shell: false, timeout: 60_000 });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe("the README ## Usage example", () => {
  it("AC-NP2: the first block under ## Usage is the example, the next its printed output", () => {
    expect(["js", "ts"]).toContain(example?.lang);
    expect(shown?.lang).toBe("text");
  });

  it(
    "AC-NP2: runs, and prints exactly the output the README shows beside it",
    () => {
      const r = run(example?.body ?? "", "usage.mts");
      expect(r.stderr).toBe("");
      expect(r.code).toBe(0);
      expect(r.stdout).toBe(`${shown?.body ?? ""}\n`);
    },
    CASE_TIMEOUT,
  );

  it("AC-NP5: every SCRIPT message literal it prints is a committed fixture (it prints none)", () => {
    expect(messageLiterals(example?.body ?? "")).toEqual([]);
  });

  it(
    "AC-NP4: a changed input value changes the output",
    () => {
      const body = example?.body ?? "";
      expect(body.split('"SYNTHCARD09"').length - 1, "the example carries one SYNTHCARD09").toBe(1);
      const mutated = body.replace('"SYNTHCARD09"', '"SYNTHCARD08"');
      const r = run(mutated, "usage-control.mts");
      expect(r.code).toBe(0);
      expect(r.stdout).not.toBe(`${shown?.body ?? ""}\n`);
      expect(r.stdout).toBe(`${shown?.body ?? ""}\n`.replace("SYNTHCARD09", "SYNTHCARD08"));
    },
    CASE_TIMEOUT,
  );
});

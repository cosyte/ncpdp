/**
 * Tests for `scripts/check-src-strings.mjs`, the internal-reference rules over `src/` string
 * literals: the one surface the shared gate (`cosyte-internal-refs`) does not read.
 *
 * Each case runs the real script against a throwaway git repository that carries this
 * repository's own `scripts/internal-refs.json`, so the rules under test are the shared gate's,
 * compiled from the same configuration. The seeded cases are the ones that must red; the
 * refusals are the routes by which a pass that read nothing could otherwise report clean.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "check-src-strings.mjs");
const CONFIG = join(REPO_ROOT, "scripts", "internal-refs.json");

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * A throwaway git repository holding `files`, every one of them staged, plus this repository's
 * configuration unless `withConfig` is false.
 */
function repoWith(files: Record<string, string>, withConfig = true): string {
  const root = mkdtempSync(join(tmpdir(), "ncpdp-src-strings-"));
  roots.push(root);
  spawnSync("git", ["init", "-q"], { cwd: root });
  const staged: string[] = [];
  if (withConfig) {
    mkdirSync(join(root, "scripts"));
    copyFileSync(CONFIG, join(root, "scripts", "internal-refs.json"));
    staged.push("scripts");
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
    staged.push(path);
  }
  if (staged.length > 0) spawnSync("git", ["add", "--", ...staged], { cwd: root });
  return root;
}

/** Run the script with `cwd` as the repository under test. */
function run(cwd: string): { code: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("check-src-strings: what it must catch", () => {
  it("reds on an item identifier in a warning message, naming the file, line and rule", () => {
    const r = run(
      repoWith({
        "src/warnings.ts":
          'export const OK = "fine";\nexport const M = "Not modeled (NCPDP-9).";\n',
      }),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("src/warnings.ts:2");
    expect(r.stderr).toContain("internal project identifier");
  });

  it("reds on phase language in a template literal", () => {
    const r = run(
      repoWith({ "src/a.ts": "export const m = (x: string) => `Added in Phase 9: ${x}`;\n" }),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("phase or wave language");
  });

  it("reds on an ADR number and a traceability marker in a nested source file", () => {
    const r = run(
      repoWith({ "src/telecom/x.ts": 'export const m = "Fixed by ADR 0015 [S-SIG].";\n' }),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("ADR reference");
    expect(r.stderr).toContain("internal traceability marker");
  });
});

describe("check-src-strings: what it must let through", () => {
  it("passes the real message vocabulary: field references, transaction codes and synthetic ids", () => {
    const r = run(
      repoWith({
        "src/a.ts":
          'export const m = "Reject Code 511-FB and Reason for Service 439-E4 on B1, SYNTH-MSG-0001.";\n',
      }),
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("check-src-strings: OK");
  });

  it("does not read whole-line comments: doc comments are the shared gate's, `//` is ours", () => {
    const r = run(
      repoWith({
        "src/a.ts":
          '// NCPDP-7 shipped this\n/** Decided in ADR 0015. */\nexport const ok = "fine";\n',
      }),
    );
    expect(r.code).toBe(0);
  });
});

describe("check-src-strings: the refusals", () => {
  it("refuses (exit 2) with no configuration to compile the rules from", () => {
    const r = run(repoWith({ "src/a.ts": 'export const ok = "fine";\n' }, false));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("scripts/internal-refs.json");
  });

  it("refuses (exit 2) when git lists no tracked source", () => {
    const r = run(repoWith({ "README.md": "# demo\n" }));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("no tracked src/*.ts");
  });

  it("refuses (exit 2) when no string literal is extracted", () => {
    const r = run(repoWith({ "src/a.ts": "export const n = 1;\n" }));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("extracted no string literal");
  });
});

describe("check-src-strings: against this repository", () => {
  it("passes", () => {
    const r = run(REPO_ROOT);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  });
});

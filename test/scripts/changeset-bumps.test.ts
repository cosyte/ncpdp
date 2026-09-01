import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALLOWED_BUMPS,
  ChangesetScanRefusal,
  checkChangesetText,
  isChangesetFile,
  OWN_PACKAGE,
  scanChangesetDir,
} from "../../scripts/changeset-bumps.js";

/**
 * Every case here SEEDS the violation and requires the checker to name it. A gate that asserts it
 * can detect is documentation; the two rules this guards (a bump type outside `patch`/`minor`, and
 * a file whose declaration cannot be read) are both one word in a file nobody re-reads, so the
 * question is not whether the rule is written down but whether it fires.
 *
 * SEEDED IN AN OS TEMP DIRECTORY, NEVER IN THE REPO. `.changeset/` is read by Changesets itself
 * and by a required check; writing a deliberately broken changeset into it to test tooling is how
 * a stray file ends up in a release. That is why the rules are pure functions over a directory
 * path rather than hardcoded to the repo's own, and why the command around them takes no argument.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VALID = `---\n"${OWN_PACKAGE}": patch\n---\n\nA real fix a consumer can observe.\n`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ncpdp-changeset-bumps-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const seed = (name: string, text: string): void => {
  writeFileSync(join(dir, name), text);
};

describe("changeset bump guard: the subject", () => {
  it("checks every .md except README.md, and nothing else", () => {
    expect(isChangesetFile("brown-jars-shave.md")).toBe(true);
    expect(isChangesetFile("README.md")).toBe(false);
    expect(isChangesetFile("config.json")).toBe(false);
    expect(isChangesetFile("pre.json")).toBe(false);
  });

  it("does not trip on the non-changeset files that share the directory", () => {
    seed("README.md", "# Changesets\n\nGuidance prose, not a changeset. No frontmatter at all.\n");
    seed("config.json", '{\n  "changelog": "@changesets/cli/changelog"\n}\n');
    seed("good.md", VALID);
    const scan = scanChangesetDir(dir);
    expect(scan.problems).toEqual([]);
    expect(scan.checked).toEqual(["good.md"]);
    expect(scan.entries).toHaveLength(3);
  });

  it("reports zero pending changesets as OK over zero, not as a refusal", () => {
    // Deliberately unlike the PHI scanner and the attw gate next door, both of which refuse an
    // empty target set. An empty `.changeset/` is the normal state in the hours after a release,
    // so refusing on it would red a clean tree. A MISSING directory still refuses, below.
    seed("README.md", "# Changesets\n");
    const scan = scanChangesetDir(dir);
    expect(scan.problems).toEqual([]);
    expect(scan.checked).toEqual([]);
  });

  it("refuses a missing directory rather than reporting a clean scan of nothing", () => {
    expect(() => scanChangesetDir(join(dir, "does-not-exist"))).toThrow(ChangesetScanRefusal);
  });
});

describe("changeset bump guard: the bump type", () => {
  it("accepts patch and minor", () => {
    for (const bump of ALLOWED_BUMPS) {
      expect(
        checkChangesetText("x.md", `---\n"${OWN_PACKAGE}": ${bump}\n---\n\nSummary.\n`),
      ).toEqual([]);
    }
  });

  it("names the file and the value it found for a major", () => {
    const problems = checkChangesetText("x.md", `---\n"${OWN_PACKAGE}": major\n---\n\nSummary.\n`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(".changeset/x.md");
    expect(problems[0]).toContain('"major"');
    expect(problems[0]).toContain("1.0.0");
  });

  it("tolerates surrounding whitespace on an otherwise good declaration", () => {
    // A trailing space is a typo, not a different bump type, and reddening on it would teach
    // authors that the gate is noise. The value is trimmed before it is compared; the SET it is
    // compared against is what does the work.
    expect(
      checkChangesetText("x.md", `---\n"${OWN_PACKAGE}":   minor  \n---\n\nSummary.\n`),
    ).toEqual([]);
  });

  it("names the file and the value it found for any other bump type", () => {
    for (const bump of ["none", "premajor", "Patch", "PATCH", "patchy", "0.1.0", ""]) {
      const problems = checkChangesetText(
        "x.md",
        `---\n"${OWN_PACKAGE}": ${bump}\n---\n\nSummary.\n`,
      );
      expect(problems.length, `bump ${JSON.stringify(bump)} was accepted`).toBeGreaterThan(0);
      expect(problems.join("\n")).toContain(".changeset/x.md");
    }
  });

  it("names the file and the package for a foreign package name", () => {
    const problems = checkChangesetText("x.md", `---\n"@cosyte/hl7": patch\n---\n\nSummary.\n`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(".changeset/x.md");
    expect(problems[0]).toContain("@cosyte/hl7");
    expect(problems[0]).toContain(OWN_PACKAGE);
  });

  it("catches a bad line among good ones rather than stopping at the first", () => {
    const problems = checkChangesetText(
      "x.md",
      `---\n"${OWN_PACKAGE}": patch\n"@cosyte/hl7": major\n---\n\nSummary.\n`,
    );
    // One for the foreign package, one for the bump type. Both on the same line, both reported.
    expect(problems).toHaveLength(2);
  });

  it("reads an unquoted package name, which a hand-edited file often has", () => {
    expect(checkChangesetText("x.md", `---\n${OWN_PACKAGE}: minor\n---\n\nSummary.\n`)).toEqual([]);
    const problems = checkChangesetText("x.md", `---\n${OWN_PACKAGE}: major\n---\n\nSummary.\n`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"major"');
  });
});

describe("changeset bump guard: a file it cannot read is a failure, never a skip", () => {
  // THIS IS THE RULE THAT MAKES THE FIRST ONE WORTH ANYTHING. A parser that skips what it cannot
  // understand reports "all clean" over the one file where a wrong bump is hiding. Every shape
  // below must be REPORTED BY NAME, and the surrounding files must still be reported as clean, so
  // a malformed file cannot be confused with an absent one.
  const malformed: ReadonlyArray<readonly [string, string]> = [
    ["no frontmatter at all", "Just a summary, no frontmatter.\n"],
    ["frontmatter that does not start at line 1", `\n---\n"${OWN_PACKAGE}": patch\n---\n`],
    ["an unterminated block", `---\n"${OWN_PACKAGE}": patch\n\nSummary with no closing fence.\n`],
    ["an empty block", "---\n---\n\nSummary.\n"],
    ["a whitespace-only block", "---\n   \n\t\n---\n\nSummary.\n"],
    ["a line with no colon", `---\n${OWN_PACKAGE} patch\n---\n\nSummary.\n`],
    ["a bare value with no key", "---\n: patch\n---\n\nSummary.\n"],
    ["an empty file", ""],
  ];

  for (const [label, text] of malformed) {
    it(`reports ${label} by name`, () => {
      const problems = checkChangesetText("broken.md", text);
      expect(problems.length, `${label} was skipped`).toBeGreaterThan(0);
      expect(problems.join("\n")).toContain(".changeset/broken.md");
    });
  }

  it("reports the malformed file and still checks the rest of the directory", () => {
    seed("good.md", VALID);
    seed("broken.md", "no frontmatter here\n");
    seed("major.md", `---\n"${OWN_PACKAGE}": major\n---\n\nSummary.\n`);
    const scan = scanChangesetDir(dir);
    expect(scan.checked).toEqual(["broken.md", "good.md", "major.md"]);
    const joined = scan.problems.join("\n");
    expect(joined).toContain(".changeset/broken.md");
    expect(joined).toContain(".changeset/major.md");
    expect(joined).not.toContain(".changeset/good.md");
    expect(scan.problems).toHaveLength(2);
  });
});

describe("changeset bump guard: the command", () => {
  // End to end through the real script against the real `.changeset/`, so the wiring is proved and
  // not just the logic: the command resolves its own subject, and today's tree is clean.
  it("exits 0 over this repository's own changesets", () => {
    const r = spawnSync("./node_modules/.bin/tsx", ["scripts/check-changeset-bumps.ts"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("check-changeset-bumps: OK");
    // The report carries its denominators: an OK is worthless without the number it is an OK over.
    expect(r.stdout).toMatch(/\d+ changeset file\(s\) checked, of \d+ entr/);
  });
});

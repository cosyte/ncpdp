/**
 * The release caller's caller-side precondition, asserted from inside this repository.
 *
 * WHY THIS SUITE EXISTS. `.github/workflows/release.yml` here is a thin caller of the org's shared
 * release pipeline. A called workflow's `GITHUB_TOKEN` can only be DOWNGRADED by the callee, never
 * elevated, so a calling job that grants less than the callee declares is an ELEVATION, and GitHub
 * refuses the whole workflow at STARTUP: no job runs, no step runs, no log is written, and the run
 * is reported as `startup_failure` with nothing in it to read. That is not hypothetical. This repo's
 * `Release` workflow was refused that way on every push to `main` from June 2026 until the caller
 * gained `actions: read`, and the only reason anyone found out was a fleet-wide CI sweep, weeks
 * later. A refusal with no logs is invisible to every gate this repo already had, because none of
 * them look at the caller's `permissions:` block. This one does.
 *
 * WHAT IS PROVED HERE, in the order it matters:
 *
 *   1. THE REAL FILE, ON THIS TREE, KEEPS THE PRECONDITION. That case is what reds if a future edit
 *      drops a grant, retargets the delegation, or reshapes the job.
 *   2. THE CHECK SEES. Every rule is proved by MUTATING THE REAL FILE and watching the mutant go
 *      red, never by a green run over the tree as it stands. Each mutation asserts that it actually
 *      changed the text, so a mutation that silently stopped applying fails loudly instead of
 *      testing nothing.
 *   3. THE CHECK REFUSES RATHER THAN PASSING ON THE ABSENCE OF EVIDENCE. Pointed at a path that
 *      does not exist, at an empty file, at a file with no `jobs:` block, or at indentation it
 *      cannot read, it produces a finding that NAMES THE FILE. A workflow gate that reports clean
 *      because it found nothing to read is the same defect as the refusal it is looking for.
 *
 * WHAT THIS SUITE DELIBERATELY DOES NOT CLAIM, and read this before trusting a green run:
 *
 *   * IT DOES NOT READ THE CALLEE. The four grants below are RECORDED from a dated read of
 *     `cosyte/.github`, not fetched. Nothing in this repository can see that file, so if the shared
 *     pipeline adds a FIFTH grant tomorrow, this suite stays green and the next push to `main` is
 *     refused at startup exactly as before. What catches that is the shared pipeline's own
 *     caller-side note and a human reading it, not this file. Recording the contract is worth doing
 *     anyway: it turns a silent regression on THIS side, which is the side that actually regressed,
 *     into a failing required check.
 *   * IT DOES NOT PROVE THE WORKFLOW SUCCEEDS. A run that starts can still fail, and a run that
 *     starts is normally HELD at the `release` environment for a human approver, which is the
 *     designed control and not a defect. This suite is about the refusal that happens BEFORE any of
 *     that.
 *   * IT IS NOT A YAML PARSER, and it is not trying to be. It reads a two-space-indented mapping at
 *     the three depths it needs (top level, job id, job key, and the grants under `permissions:`)
 *     and REFUSES anything else, naming the file. `scripts/check-test-selection.ts` reads workflow
 *     text the same way and for the same reason: the alternative is a runtime dependency this
 *     package will not take for a gate.
 *
 * THE RECORDED CONTRACT AND ITS PROVENANCE. Source: `cosyte/.github`, `.github/workflows/release.yml`
 * on its default branch, read 2026-08-28. It declares `contents: write`, `id-token: write`,
 * `pull-requests: write` and `actions: read`, and it puts its release job in the caller's `release`
 * environment, which is where the human approval on npm publish lives. `actions: read` is the grant
 * the callee added last and the one this caller was missing: the callee reads the caller's
 * environment protection with it.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

/** How the caller is named in every finding: the path a reader would open. */
const CALLER_LABEL = ".github/workflows/release.yml";
const CALLER_PATH = join(REPO_ROOT, ".github", "workflows", "release.yml");

/** The delegation target, owner and repo and path, without the `@ref` suffix. */
const SHARED_PIPELINE = "cosyte/.github/.github/workflows/release.yml";

/** The environment the callee's own job runs in, and therefore where the human gate sits. */
const RELEASE_ENVIRONMENT = "release";

type Access = "none" | "read" | "write";

const ACCESS_RANK: Readonly<Record<Access, number>> = { none: 0, read: 1, write: 2 };

const isAccess = (value: string): value is Access =>
  value === "none" || value === "read" || value === "write";

/**
 * What the shared pipeline declares, and therefore the floor the calling job has to request. A
 * caller may grant MORE than this; it may not grant less. See the provenance note in the banner.
 */
const REQUIRED_GRANTS: ReadonlyArray<readonly [string, Access]> = [
  ["actions", "read"],
  ["contents", "write"],
  ["id-token", "write"],
  ["pull-requests", "write"],
];

// ---------------------------------------------------------------------------
// THE READER. Structural, text-based, and fail-closed on anything it does not recognise.

interface Line {
  /** Count of leading spaces. */
  readonly indent: number;
  /** The line with its indentation removed and its trailing whitespace trimmed. */
  readonly body: string;
}

/**
 * Strip a trailing `# ...` comment from a scalar value. A quoted value keeps everything up to its
 * closing quote, so a `#` inside quotes survives; an unquoted value is cut at the first `#` that
 * follows whitespace, which is the only place YAML starts a comment.
 */
function stripInlineComment(value: string): string {
  const quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : "";
  if (quote !== "") {
    const end = value.indexOf(quote, 1);
    return end === -1 ? value : value.slice(0, end + 1);
  }
  const hash = value.search(/(^|\s)#/);
  return (hash === -1 ? value : value.slice(0, hash)).trim();
}

const KEY_LINE = /^([A-Za-z0-9_.-]+):(?:[ \t]+(.*))?$/;

/** The key a line declares, or `undefined` when the line is not a `key:` line at all. */
function keyOf(line: Line): string | undefined {
  return KEY_LINE.exec(line.body)?.[1];
}

/** The scalar a `key: value` line carries, comment stripped. Empty when the key opens a block. */
function valueOf(line: Line): string {
  return stripInlineComment(KEY_LINE.exec(line.body)?.[2] ?? "");
}

/** Significant lines only: blank lines and whole-line comments carry nothing this reader needs. */
function significantLines(text: string): Line[] {
  const out: Line[] = [];
  for (const raw of text.split("\n")) {
    const body = raw.trimEnd();
    if (body.trim() === "" || body.trimStart().startsWith("#")) continue;
    out.push({ indent: body.length - body.trimStart().length, body: body.trimStart() });
  }
  return out;
}

/** The lines strictly beneath `start`, up to the next line at or above `outerIndent`. */
function blockAfter(lines: readonly Line[], start: number, outerIndent: number): Line[] {
  const out: Line[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || line.indent <= outerIndent) break;
    out.push(line);
  }
  return out;
}

/** Thrown for a shape this reader will not guess at. Caught and turned into a named finding. */
class Unreadable extends Error {}

function refuse(why: string): never {
  throw new Unreadable(why);
}

interface CallingJob {
  readonly id: string;
  /** Job-level keys, at one indentation step inside the job id. */
  readonly keys: readonly Line[];
  /** Index of each job-level key within the whole line list, so blocks under it can be read. */
  readonly keyIndexes: readonly number[];
  readonly usesValue: string;
}

/**
 * Every job in the `jobs:` mapping, read at fixed depths: job ids one step in, job keys two steps
 * in. Anything at another depth is a shape this reader does not know, and it refuses rather than
 * skipping the line, because a skipped line is exactly where a dropped grant would hide.
 */
function readJobs(lines: readonly Line[]): CallingJob[] {
  const jobsIdx = lines.findIndex((l) => l.indent === 0 && keyOf(l) === "jobs");
  if (jobsIdx === -1) refuse("declares no top-level `jobs:` block");

  const jobIndexes: number[] = [];
  for (let i = jobsIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.indent === 0) break;
    if (line.indent === 2) {
      if (keyOf(line) === undefined) refuse(`has an unreadable job heading: \`${line.body}\``);
      jobIndexes.push(i);
    } else if (line.indent < 4) {
      refuse(`indents \`${line.body}\` by ${String(line.indent)}, which this reader cannot place`);
    }
  }
  if (jobIndexes.length === 0) refuse("declares `jobs:` with no job under it");

  return jobIndexes.map((idx) => {
    const heading = lines[idx];
    if (heading === undefined) refuse("lost a job heading while reading it");
    const id = keyOf(heading) ?? refuse("lost a job id while reading it");
    const keys: Line[] = [];
    const keyIndexes: number[] = [];
    for (let i = idx + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line === undefined || line.indent <= 2) break;
      if (line.indent !== 4) continue;
      if (keyOf(line) === undefined) {
        refuse(`has an unreadable key in job \`${id}\`: \`${line.body}\``);
      }
      keys.push(line);
      keyIndexes.push(i);
    }
    const uses = keys.find((k) => keyOf(k) === "uses");
    return { id, keys, keyIndexes, usesValue: uses === undefined ? "" : valueOf(uses) };
  });
}

/**
 * The grants a calling job requests. A job with no `permissions:` block at all requests nothing
 * here: it inherits the repository default, which is `contents: read` on this org, and every grant
 * the callee declares is then an elevation. That is the state this repo was actually in.
 */
function grantsOf(lines: readonly Line[], job: CallingJob): Map<string, Access> {
  const granted = new Map<string, Access>();

  const at = job.keys.findIndex((k) => keyOf(k) === "permissions");
  if (at === -1) return granted;

  const permissions = job.keys[at];
  const permissionsIdx = job.keyIndexes[at];
  if (permissions === undefined || permissionsIdx === undefined) {
    refuse("lost the `permissions:` block while reading it");
  }

  const inline = valueOf(permissions);
  if (inline !== "") {
    if (inline === "write-all") {
      for (const [name] of REQUIRED_GRANTS) granted.set(name, "write");
      return granted;
    }
    if (inline === "read-all") {
      for (const [name] of REQUIRED_GRANTS) granted.set(name, "read");
      return granted;
    }
    if (inline === "{}") return granted;
    refuse(
      `writes \`permissions: ${inline}\` on job \`${job.id}\`, a spelling this check does not know`,
    );
  }

  const block = blockAfter(lines, permissionsIdx, 4);
  if (block.length === 0) {
    refuse(`opens \`permissions:\` on job \`${job.id}\` with nothing under it`);
  }
  for (const line of block) {
    const name = keyOf(line);
    const level = name === undefined ? "" : valueOf(line);
    if (name === undefined || !isAccess(level)) {
      refuse(`has an unreadable grant on job \`${job.id}\`: \`${line.body}\``);
    }
    granted.set(name, level);
  }
  return granted;
}

/**
 * Read the release caller at `path` and return every finding against it. An empty array is the only
 * clean result; every other return NAMES `label`, so a reader is told which file to open.
 */
function auditReleaseCaller(path: string, label: string): string[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return [`${label}: could not be read, so nothing about the release caller is proven (${why})`];
  }

  if (text.trim() === "") {
    return [`${label}: is empty, so nothing about the release caller is proven`];
  }
  for (const raw of text.split("\n")) {
    if (/^[ ]*\t/.test(raw)) {
      return [`${label}: indents with a tab, which is not YAML indentation and cannot be read`];
    }
  }

  const lines = significantLines(text);
  const findings: string[] = [];

  try {
    const jobs = readJobs(lines);
    const delegating = jobs.filter((j) => j.usesValue.split("@")[0] === SHARED_PIPELINE);

    if (delegating.length === 0) {
      const seen = jobs
        .filter((j) => j.usesValue !== "")
        .map((j) => `\`${j.id}\` -> \`${j.usesValue}\``);
      findings.push(
        `${label}: no job delegates to \`${SHARED_PIPELINE}\` ` +
          `(${seen.length === 0 ? "no job declares `uses:` at all" : seen.join(", ")}). ` +
          `That delegation is what puts the release job in the \`${RELEASE_ENVIRONMENT}\` ` +
          `environment, which is the human approval on npm publish, and it is the only ` +
          `caller-side carrier of it: losing it loses the gate silently.`,
      );
      return findings;
    }
    if (delegating.length > 1) {
      refuse(
        `has ${String(delegating.length)} jobs delegating to \`${SHARED_PIPELINE}\`, ` +
          "so which one is the release caller is a guess this check will not make",
      );
    }

    const job = delegating[0];
    if (job === undefined) refuse("lost the delegating job while reading it");

    const ref = job.usesValue.split("@")[1] ?? "";
    if (ref.trim() === "") {
      findings.push(
        `${label}: job \`${job.id}\` names \`${SHARED_PIPELINE}\` with no \`@ref\`, ` +
          "which is not a resolvable delegation",
      );
    }

    const environment = job.keys.find((k) => keyOf(k) === "environment");
    if (environment !== undefined) {
      findings.push(
        `${label}: job \`${job.id}\` carries \`${environment.body}\`. A job that calls a ` +
          "reusable workflow does not take an `environment:` key, so this is refused at startup " +
          `like any other malformed calling job. The \`${RELEASE_ENVIRONMENT}\` environment is ` +
          "declared by the shared pipeline's own job and must stay there.",
      );
    }

    const granted = grantsOf(lines, job);
    for (const [name, required] of REQUIRED_GRANTS) {
      const actual = granted.get(name) ?? "none";
      if (ACCESS_RANK[actual] >= ACCESS_RANK[required]) continue;
      findings.push(
        `${label}: job \`${job.id}\` does not request \`${name}: ${required}\` ` +
          `(it grants \`${name}: ${actual}\`). The shared release pipeline declares that grant, ` +
          "a called workflow can only downgrade the caller's token, and GitHub refuses the whole " +
          "workflow at startup rather than reporting the elevation.",
      );
    }
  } catch (error) {
    if (!(error instanceof Unreadable)) throw error;
    return [`${label}: ${error.message}, so nothing about the release caller is proven`];
  }

  return findings;
}

// ---------------------------------------------------------------------------
// THE CASES.

let scratch: string;
let serial = 0;

const REAL_TEXT = readFileSync(CALLER_PATH, "utf8");

/** Audit a mutant of the real caller. The label stays the real path: that is what a reader opens. */
function auditMutant(mutate: (text: string) => string): string[] {
  const mutated = mutate(REAL_TEXT);
  if (mutated === REAL_TEXT) {
    throw new Error("this mutation changed nothing, so the case below would prove nothing");
  }
  serial += 1;
  const path = join(scratch, `release-${String(serial)}.yml`);
  writeFileSync(path, mutated);
  return auditReleaseCaller(path, CALLER_LABEL);
}

/** Audit arbitrary text written to a throwaway file. */
function auditText(text: string): string[] {
  serial += 1;
  const path = join(scratch, `text-${String(serial)}.yml`);
  writeFileSync(path, text);
  return auditReleaseCaller(path, CALLER_LABEL);
}

/** Drop the whole `<key>:` line from the caller. */
const withoutLine = (key: string) => (text: string) =>
  text
    .split("\n")
    .filter((l) => !new RegExp(`^\\s*${key}:`).test(l))
    .join("\n");

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "ncpdp-release-caller-"));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("the release caller keeps the shared pipeline's caller-side precondition", () => {
  it("is clean on the real workflow in this repository", () => {
    expect(auditReleaseCaller(CALLER_PATH, CALLER_LABEL)).toEqual([]);
  });

  it("is clean on an unmutated copy, so the harness is not what makes the mutants red", () => {
    expect(auditText(REAL_TEXT)).toEqual([]);
  });

  it("still reads the caller when its comments and blank lines are gone", () => {
    const stripped = REAL_TEXT.split("\n")
      .filter((l) => l.trim() !== "" && !l.trimStart().startsWith("#"))
      .join("\n");
    expect(auditText(stripped)).toEqual([]);
  });
});

describe("a grant the shared pipeline declares cannot be dropped from the caller", () => {
  for (const [name, required] of REQUIRED_GRANTS) {
    it(`names \`${name}: ${required}\` when that line is removed`, () => {
      const findings = auditMutant(withoutLine(name));
      expect(findings).toHaveLength(1);
      expect(findings.join("\n")).toContain(`${name}: ${required}`);
      expect(findings.join("\n")).toContain(CALLER_LABEL);
    });
  }

  it("names `contents: write` when the caller downgrades it to `read`", () => {
    const findings = auditMutant((t) => t.replace("contents: write", "contents: read"));
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain("contents: write");
    expect(findings.join("\n")).toContain("it grants `contents: read`");
  });

  it("names every grant when the calling job declares no `permissions:` block at all", () => {
    const findings = auditMutant((t) =>
      t
        .split("\n")
        .filter((l) => !/^\s{4,6}(permissions|actions|contents|id-token|pull-requests):/.test(l))
        .join("\n"),
    );
    expect(findings).toHaveLength(REQUIRED_GRANTS.length);
    for (const [name, required] of REQUIRED_GRANTS) {
      expect(findings.join("\n")).toContain(`${name}: ${required}`);
    }
  });

  it("accepts `permissions: write-all`, because a caller may grant more than the floor", () => {
    expect(
      auditMutant((t) =>
        t
          .split("\n")
          .filter((l) => !/^\s{6}(actions|contents|id-token|pull-requests):/.test(l))
          .map((l) => l.replace(/^(\s{4})permissions:.*$/, "$1permissions: write-all"))
          .join("\n"),
      ),
    ).toEqual([]);
  });

  it("refuses `permissions: read-all`, which is three of the four grants short", () => {
    const findings = auditMutant((t) =>
      t
        .split("\n")
        .filter((l) => !/^\s{6}(actions|contents|id-token|pull-requests):/.test(l))
        .map((l) => l.replace(/^(\s{4})permissions:.*$/, "$1permissions: read-all"))
        .join("\n"),
    );
    expect(findings).toHaveLength(3);
    expect(findings.join("\n")).toContain("contents: write");
    expect(findings.join("\n")).toContain("id-token: write");
    expect(findings.join("\n")).toContain("pull-requests: write");
    expect(findings.join("\n")).not.toContain("does not request `actions: read`");
  });
});

describe("the delegation and the release environment cannot be lost quietly", () => {
  it("reds when the caller delegates somewhere other than the shared pipeline", () => {
    const findings = auditMutant((t) =>
      t.replace(SHARED_PIPELINE, "cosyte/.github/.github/workflows/some-other.yml"),
    );
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain(SHARED_PIPELINE);
    expect(findings.join("\n")).toContain(RELEASE_ENVIRONMENT);
  });

  it("reds when the caller stops delegating at all and inlines its own job", () => {
    const findings = auditMutant((t) =>
      t
        .split("\n")
        .map((l) => l.replace(/^(\s{4})uses:.*$/, "$1steps: []"))
        .join("\n"),
    );
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain("no job declares `uses:` at all");
  });

  it("reds when the caller names the shared pipeline with no `@ref`", () => {
    const findings = auditMutant((t) => t.replace(`${SHARED_PIPELINE}@main`, SHARED_PIPELINE));
    expect(findings.join("\n")).toContain("no `@ref`");
  });

  it("reds when the calling job pins an `environment:` of its own", () => {
    const findings = auditMutant((t) =>
      t.replace(/^(\s{4})uses:/m, "$1environment: staging\n$1uses:"),
    );
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain("environment: staging");
    expect(findings.join("\n")).toContain(RELEASE_ENVIRONMENT);
  });

  it("reds on an `environment:` key whatever it names, because the key is what is refused", () => {
    const findings = auditMutant((t) =>
      t.replace(/^(\s{4})uses:/m, `$1environment: ${RELEASE_ENVIRONMENT}\n$1uses:`),
    );
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain("does not take an `environment:` key");
  });
});

describe("the check refuses rather than passing on the absence of evidence", () => {
  it("names the file when it is not there at all", () => {
    const findings = auditReleaseCaller(join(scratch, "not-here.yml"), CALLER_LABEL);
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain(CALLER_LABEL);
    expect(findings.join("\n")).toContain("could not be read");
  });

  it("names the file when it is empty", () => {
    const findings = auditText("");
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain(CALLER_LABEL);
    expect(findings.join("\n")).toContain("is empty");
  });

  it("names the file when it holds nothing but comments and whitespace", () => {
    const findings = auditText("# a release workflow used to live here\n\n   \n");
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain(CALLER_LABEL);
    expect(findings.join("\n")).toContain("no top-level `jobs:` block");
  });

  it("names the file when there is no `jobs:` block", () => {
    const findings = auditText("name: Release\non:\n  push:\n    branches: [main]\n");
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain("no top-level `jobs:` block");
  });

  it("names the file when `jobs:` has nothing under it", () => {
    const findings = auditText("name: Release\njobs:\n");
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain("no job under it");
  });

  it("names the file when it is indented with tabs", () => {
    const findings = auditMutant((t) => t.replace(/^ {4}uses:/m, "\tuses:"));
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain("indents with a tab");
  });

  it("names the file on a `permissions:` spelling it does not know", () => {
    const findings = auditMutant((t) =>
      t
        .split("\n")
        .filter((l) => !/^\s{6}(actions|contents|id-token|pull-requests):/.test(l))
        .map((l) => l.replace(/^(\s{4})permissions:.*$/, "$1permissions: everything"))
        .join("\n"),
    );
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain("a spelling this check does not know");
  });

  it("names the file on a grant level it does not know", () => {
    const findings = auditMutant((t) => t.replace("actions: read", "actions: maybe"));
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain("unreadable grant");
  });

  it("names the file when `permissions:` opens with nothing under it", () => {
    const findings = auditMutant((t) =>
      t
        .split("\n")
        .filter((l) => !/^\s{6}(actions|contents|id-token|pull-requests):/.test(l))
        .join("\n"),
    );
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain("with nothing under it");
  });

  it("refuses rather than guessing when two jobs delegate to the shared pipeline", () => {
    const findings = auditText(
      [
        "name: Release",
        "on:",
        "  push:",
        "    branches: [main]",
        "jobs:",
        "  release:",
        "    permissions:",
        "      actions: read",
        "      contents: write",
        "      id-token: write",
        "      pull-requests: write",
        `    uses: ${SHARED_PIPELINE}@main`,
        "  release-again:",
        `    uses: ${SHARED_PIPELINE}@main`,
        "",
      ].join("\n"),
    );
    expect(findings).toHaveLength(1);
    expect(findings.join("\n")).toContain("2 jobs delegating");
  });
});

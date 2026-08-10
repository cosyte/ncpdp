/**
 * Unit tests for `scripts/check-agent-notes.ts`, the two-file-contract gate.
 *
 * WHAT IS BEING PROVED, in the order it matters:
 *
 *   1. THE GATE SEES. Each of the three things it claims to check is seeded into a throwaway repo
 *      and shown RED, then repaired and shown GREEN in the same tree. A gate is only worth its
 *      exit code once it has been watched to fail.
 *   2. THE GATE REFUSES RATHER THAN REPORTING CLEAN OVER A CORPUS IT NEVER OPENED. This is the
 *      control, and it is the whole reason the exit codes are split 1/2. Pointed at an empty tree
 *      it must exit 2, never 0. So must a tree in which EITHER pointer matcher finds nothing, and
 *      so must a NUL-bearing tracked file, because this gate has no binary skip.
 *   3. BOTH MATCHERS ARE EXERCISED SEPARATELY. This repo writes the large majority of its pointers
 *      in the bare form and only a handful in the qualified one, so a suite that fed only the
 *      qualified form would leave the matcher that does most of the work here untested. No count
 *      is written down: one case below reads both off the gate's own OK line and asserts the
 *      relationship, which is the only version of that claim that cannot go stale.
 *   4. THE BYPASS CLASSES ARE REPRODUCED END TO END, not asserted in the abstract. Two of them are
 *      the ones this repo measured against a `/^#{1,6} /` heading guard (a single leading space,
 *      and a setext underline); both are FALSE-RED bypasses, because a missed heading is a missing
 *      anchor and a missing anchor reds a pointer that works. The opposite direction is an ATX
 *      line inside a code fence, which must NOT mint an anchor, or a dangling pointer passes.
 *   5. THE REAL TREE IS GREEN, run through the real script. That case is what puts this gate on the
 *      required `ci / verify` contexts and on the meta-repo's `scripts/verify.sh ncpdp` ladder
 *      without either having to name it, and it is what reds if a future edit breaks an anchor on
 *      either side of the pair.
 *
 * WHAT IS DELIBERATELY NOT PROVED HERE: that any sibling repo satisfies the same contract.
 * Measured 2026-08-06, `config`, `hl7`, `workflow`, `crew`, `knowledgebase`, `.github` and
 * `claude-containers` carry no narrative file at all, so a universal assertion would be an
 * overclaim. The script's banner says so; this file does not restate the argument, it declines to
 * test the universal.
 *
 * RUNNER: the cases spawn `node` directly on the `.ts` gate and rely on node's native type
 * stripping, because a `tsx` start costs several times a `node` start on a spawn-bound suite. That
 * is this file's own choice and NOT a repo precedent: `test/scripts/phi-scan.test.ts` spawns `tsx`
 * at every call site, and a first draft of this paragraph claimed otherwise.
 * `pnpm check:agent-notes` runs `tsx`, so ONE
 * case below spawns `tsx` and asserts the two runners agree byte for byte. Delete it and a
 * tsx-only breakage ships green, with the cheap runner testing something the commit gate does not
 * run.
 *
 * The throwaway repos are created under the OS temp dir, never under `test/`. `test/` is a
 * `phi-scan` walk root and that scanner refuses on an emptied root, so unrelated churn there would
 * couple two gates that have nothing to do with each other.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const GATE_PATH = join(REPO_ROOT, "scripts", "check-agent-notes.ts");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const NODE_BIN = process.execPath;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runGate(args: string[], bin: string = NODE_BIN): RunResult {
  const r = spawnSync(bin, [GATE_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

let scratch: string;

/**
 * Build a throwaway git repo and return its path. Only the INDEX is populated (`git add`), not a
 * commit: `git ls-files` reads the index, so no commit and therefore no committer identity is
 * needed, which keeps these cases independent of whatever git config the box carries.
 */
function repo(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(join(scratch, "tree-"));
  git(dir, ["init", "-q"]);
  write(dir, files);
  return dir;
}

function write(dir: string, files: Record<string, string | Buffer>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    const slash = rel.lastIndexOf("/");
    if (slash > 0) mkdirSync(join(dir, rel.slice(0, slash)), { recursive: true });
    writeFileSync(abs, content);
  }
  git(dir, ["add", "-A"]);
}

function git(dir: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", shell: false });
  if ((r.status ?? -1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

/**
 * The contract basename, assembled rather than written out, and that is load-bearing rather than a
 * style choice.
 *
 * The gate scans every tracked text file for the QUALIFIED pointer form and carves out NO exemption
 * for its own source or for this file. So a qualified pointer written literally here would be read
 * as a pointer into THIS repo's narrative file and checked against its anchors, while every fixture
 * below names a section that exists only inside a throwaway repo. The fix is deliberately the
 * fixture and NOT an exemption: a gate's own tests are exactly where a genuinely broken pointer
 * would hide, so they stay in scope, and this repo's PHI scanner has already paid once for an
 * exemption drawn wider than one path.
 *
 * The BARE form needs no such care, because its domain is the cursor and the narrative file only,
 * and this file is neither. It is assembled anyway, so that a future widening of that domain does
 * not turn this suite into findings against the real tree.
 */
const NOTES_NAME = `agent-notes${"."}md`;
const NOTES_PATH = `documentation/${NOTES_NAME}`;

/** A path-qualified pointer at `anchor`. */
function ptr(anchor: string): string {
  return `${NOTES_PATH}${"#"}${anchor}`;
}

/** A bare pointer at `anchor`: an inline code span holding nothing but `#` and the anchor. */
function bare(anchor: string): string {
  return `\`${"#"}${anchor}\``;
}

/** The narrative half, with one real section. */
const NOTES = `# notes\n\nPreamble.\n\n## The section\n\nBody.\n`;

/**
 * A conformant cursor. EVERY fixture needs BOTH forms, because zero from either matcher is a
 * refusal, and a fixture carrying only one would exit 2 for a reason the case is not about.
 */
function cursor(qualified: string, bareAnchor: string = "the-section"): string {
  return `# cursor\n\nWhy: ${ptr(qualified)}\n\nAlso: ${bare(bareAnchor)}\n`;
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "ncpdp-agent-notes-"));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("check-agent-notes: the contract it asserts", () => {
  it("is green on a tree that keeps the contract", () => {
    const dir = repo({ "CLAUDE.md": cursor("the-section"), [NOTES_PATH]: NOTES });
    const r = runGate(["--root", dir]);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("check-agent-notes: OK");
    // The OK line must show its arithmetic, not just its verdict, and it must show BOTH counts.
    expect(r.stdout).toContain("1 qualified pointer(s)");
    expect(r.stdout).toContain("1 bare pointer(s)");
    expect(r.stdout).toContain("2 tracked path(s) reconciled = 2 opened + 0 skipped");
  });

  it("reds when a QUALIFIED pointer dangles, and goes green when the anchor is repaired", () => {
    const dir = repo({ "CLAUDE.md": cursor("the-wrong-anchor"), [NOTES_PATH]: NOTES });

    const before = runGate(["--root", dir]);
    expect(before.code).toBe(1);
    expect(before.stderr).toContain("#the-wrong-anchor does not resolve");
    expect(before.stderr).toContain("CLAUDE.md:3");

    write(dir, { "CLAUDE.md": cursor("the-section") });
    expect(runGate(["--root", dir]).code).toBe(0);
  });

  it("reds when a BARE pointer dangles, which is the form this repo mostly writes", () => {
    const dir = repo({
      "CLAUDE.md": cursor("the-section", "the-wrong-anchor"),
      [NOTES_PATH]: NOTES,
    });

    const before = runGate(["--root", dir]);
    expect(before.code).toBe(1);
    expect(before.stderr).toContain("#the-wrong-anchor does not resolve");
    expect(before.stderr).toContain("CLAUDE.md:5");

    write(dir, { "CLAUDE.md": cursor("the-section") });
    expect(runGate(["--root", dir]).code).toBe(0);
  });

  it("checks a BARE pointer written inside the narrative file itself", () => {
    // One such self-reference exists on the real tree, so the domain includes the narrative file.
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: `${NOTES}\n## Two\n\nSee ${bare("no-such-anchor")}.\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("#no-such-anchor does not resolve");
  });

  it("reds on a section that is nothing but its heading, and goes green when the body returns", () => {
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: "# notes\n\nPreamble.\n\n## The section\n\n## Next\n\nBody.\n",
    });

    const before = runGate(["--root", dir]);
    expect(before.code).toBe(1);
    expect(before.stderr).toContain('section "The section" (#the-section) has no body');

    write(dir, { [NOTES_PATH]: NOTES });
    expect(runGate(["--root", dir]).code).toBe(0);
  });

  it("does NOT red a container heading, whose body is its subsections", () => {
    // A pointer at `#group` resolves on GitHub and the reader lands on real content, so reporting
    // it would be a red against a link that works. The real narrative file reaches this shape.
    const dir = repo({
      "CLAUDE.md": cursor("group", "group"),
      [NOTES_PATH]: "# notes\n\nPreamble.\n\n## Group\n\n### Sub\n\nReal body here.\n",
    });
    const r = runGate(["--root", dir]);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  });

  it("still reds an emptied LEAF beneath a container, so the exemption opens no false green", () => {
    const dir = repo({
      "CLAUDE.md": cursor("sub", "sub"),
      [NOTES_PATH]: "# notes\n\nPreamble.\n\n## Group\n\n### Sub\n\n## Other\n\nBody.\n",
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('section "Sub" (#sub) has no body');
  });

  it("treats a TRAILING heading as a leaf, never a container, since nothing deeper follows it", () => {
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: `${NOTES}\n### Trailing\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('section "Trailing" (#trailing) has no body');
  });

  it("reds when the narrative half is not tracked at all, and calls it a finding not a refusal", () => {
    const dir = repo({ "CLAUDE.md": cursor("the-section") });
    const r = runGate(["--root", dir]);
    // Exit 1, not 2: this is a broken contract a human acts on, not a scan that failed.
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("the narrative half of the pair is not tracked");
  });

  it("reds when the cursor half is not tracked", () => {
    const dir = repo({
      [NOTES_PATH]: `${NOTES}\nSelf: ${bare("the-section")}\n`,
      "README.md": `See ${ptr("the-section")}.\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("the cursor half of the pair is not tracked");
  });

  it("finds a QUALIFIED pointer wherever it is written, not only in CLAUDE.md", () => {
    // Measured on this tree: the narrative file and `CHANGELOG.md` both name the contract file, so
    // a markdown-only or CLAUDE.md-only sweep would not open either.
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: NOTES,
      "scripts/thing.ts": `// see ${ptr("not-a-section")}\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("scripts/thing.ts:1");
  });
});

describe("check-agent-notes: the controls, and every other refusal", () => {
  it("REFUSES when pointed at a tree with nothing tracked in it", () => {
    const dir = mkdtempSync(join(scratch, "empty-"));
    git(dir, ["init", "-q"]);
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("listed no readable tracked file");
    expect(r.stdout).not.toContain("OK");
  });

  it("REFUSES when pointed at something that is not a git repository", () => {
    const dir = mkdtempSync(join(scratch, "norepo-"));
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stdout).not.toContain("OK");
  });

  it("REFUSES a tree with zero QUALIFIED pointers, even though bare ones resolve", () => {
    // The per-form refusal, in the direction a combined count would hide. Everything here is
    // healthy except that one matcher saw nothing.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${bare("the-section")}\n`,
      [NOTES_PATH]: NOTES,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("ZERO QUALIFIED pointers");
    expect(r.stdout).not.toContain("OK");
  });

  it("REFUSES a tree with zero BARE pointers, even though qualified ones resolve", () => {
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section")}\n`,
      [NOTES_PATH]: NOTES,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("ZERO BARE pointers");
  });

  it("REFUSES a NUL-BEARING tracked file rather than skipping it, because there is no skip", () => {
    // THE POSITIVE CONTROL FOR "NO EXCLUSION LIST". A sibling gate skips such a file and discloses
    // it as a miss; here a pointer inside one would be a pointer the gate never read, so it
    // refuses instead. The refusal names the path.
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: NOTES,
      "blob.bin": Buffer.from(`binary \0 payload ${ptr("totally-bogus-anchor")}\n`, "utf8"),
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("contains a NUL byte");
    expect(r.stderr).toContain("blob.bin");
    expect(r.stdout).not.toContain("OK");
  });

  it("REFUSES when two tracked files carry the contract basename, rather than guessing", () => {
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: NOTES,
      [`docs-content/${NOTES_NAME}`]: NOTES,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(`named ${NOTES_NAME}`);
  });

  it("REFUSES an unknown flag rather than scanning with it ignored", () => {
    expect(runGate(["--everything"]).code).toBe(2);
  });

  it("REFUSES a tracked path that is a SYMLINK, rather than scanning bytes from outside the tree", () => {
    const dir = repo({ "CLAUDE.md": cursor("the-section"), [NOTES_PATH]: NOTES });
    writeFileSync(join(dir, "outside.txt"), "secret\n");
    symlinkSync(join(dir, "outside.txt"), join(dir, "link.md"));
    git(dir, ["add", "-A"]);

    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("tracked path is a symbolic link");
    // The target is deliberately not printed.
    expect(r.stderr).not.toContain("outside.txt");
  });

  it("REFUSES a tracked path that is missing from the working tree", () => {
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: NOTES,
      "gone.md": "here for now\n",
    });
    rmSync(join(dir, "gone.md"));

    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("tracked path is missing from the working tree");
  });

  it("REFUSES a tracked path replaced on disk by a DIRECTORY", () => {
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: NOTES,
      "swapped.md": "a regular file, for now\n",
    });
    rmSync(join(dir, "swapped.md"));
    mkdirSync(join(dir, "swapped.md"));

    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("tracked path is not a regular file");
  });

  it("REFUSES a tracked path replaced by a FIFO instead of hanging on it forever", () => {
    // THIS IS WHAT MAKES O_NONBLOCK LOAD-BEARING RATHER THAN DECORATION. Opening a FIFO for
    // reading blocks until a writer appears, so without the flag the gate would hang here
    // indefinitely rather than refuse, and a hung gate reports nothing at all.
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: NOTES,
      "pipe.md": "a regular file, for now\n",
    });
    const fifo = join(dir, "pipe.md");
    rmSync(fifo);
    const mk = spawnSync("mkfifo", [fifo], { encoding: "utf8", shell: false });
    if ((mk.status ?? -1) !== 0) return; // no mkfifo here; the directory case still covers the class

    const r = runGate(["--root", dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("tracked path is not a regular file");
  }, 15_000);
});

describe("check-agent-notes: the bypass classes, reproduced end to end", () => {
  it("sees a heading indented by one space (bypass 1: /^#{1,6} / misses it)", () => {
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: "# notes\n\nPreamble.\n\n ## The section\n\nBody.\n",
    });
    // A guard that missed this would report a FALSE RED against a link GitHub resolves.
    expect(runGate(["--root", dir]).code).toBe(0);
  });

  it("sees a setext heading (bypass 2: an underline, not a hash)", () => {
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: "# notes\n\nPreamble.\n\nThe section\n-----------\n\nBody.\n",
    });
    expect(runGate(["--root", dir]).code).toBe(0);
  });

  it("does NOT mint an anchor from an ATX line inside a code fence", () => {
    // The one direction that would let a dangling pointer through. The real narrative file embeds
    // a shell reproduction whose comment lines start at column 0, so this is not hypothetical.
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: "# notes\n\nPreamble.\n\n## Real\n\n```sh\n# The section\n```\n",
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("#the-section does not resolve");
  });

  it("does NOT mint a setext anchor from YAML front matter, in EITHER spelling", () => {
    // A NEAR-DEGENERATE CONTROL, CORRECTED. Asserting only `#title-phantom` proves nothing: with
    // front-matter tracking removed the phantom is `#---title-phantom`, because the setext
    // paragraph walk-back reaches the OPENING fence too, so `#title-phantom` dangles either way.
    // The second fixture is the discriminating one, and the ASSERTED STDERR STRING is what makes
    // it so, not its exit code: measured by deleting the front-matter block from a copy of the
    // gate, it never reaches 0 (2 through the self-test, or 1 on the phantom section having no
    // body), but it never prints "pointer #---title-phantom does not resolve" either. Both
    // fixtures are asserted so a reader cannot mistake the first for the proof.
    const notes = "---\ntitle: phantom\n---\n\n# notes\n\nP.\n\n## Real\n\nBody.\n";
    const obvious = repo({
      "CLAUDE.md": cursor("title-phantom", "title-phantom"),
      [NOTES_PATH]: notes,
    });
    expect(runGate(["--root", obvious]).code).toBe(1);

    const discriminating = repo({
      "CLAUDE.md": cursor("---title-phantom", "---title-phantom"),
      [NOTES_PATH]: notes,
    });
    const r = runGate(["--root", discriminating]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("pointer #---title-phantom does not resolve");
  });

  it("gives a wrapped setext heading the anchor of the whole paragraph, softbreak DELETED", () => {
    // A wrapped setext heading is ONE heading whose text carries a newline, and the slug rule
    // DELETES a newline rather than hyphenating it, so the two halves run together. Both
    // directions are asserted: joining with a space produces a slug GitHub does not mint.
    const notes = "# notes\n\nP.\n\nThe long\nsection name\n------------\n\nBody.\n";

    const green = repo({
      "CLAUDE.md": cursor("the-longsection-name", "the-longsection-name"),
      [NOTES_PATH]: notes,
    });
    expect(runGate(["--root", green]).code).toBe(0);

    const red = repo({
      "CLAUDE.md": cursor("the-long-section-name", "the-long-section-name"),
      [NOTES_PATH]: notes,
    });
    expect(runGate(["--root", red]).code).toBe(1);
  });

  it("disambiguates two identical headings the way GitHub does", () => {
    const dir = repo({
      "CLAUDE.md": cursor("same-1", "same-1"),
      [NOTES_PATH]: "# notes\n\nP.\n\n## Same\n\nA.\n\n## Same\n\nB.\n",
    });
    expect(runGate(["--root", dir]).code).toBe(0);
  });

  it("re-suffixes a slug that collides with an already-generated one", () => {
    // github-slugger loops rather than counting: `Same`, `Same`, `Same-1` yields `same`, `same-1`,
    // `same-1-1`. A counter yields `same-1` twice and reds a pointer GitHub resolves.
    const dir = repo({
      "CLAUDE.md": cursor("same-1-1", "same-1-1"),
      [NOTES_PATH]: "# notes\n\nP.\n\n## Same\n\nA.\n\n## Same\n\nB.\n\n## Same-1\n\nC.\n",
    });
    expect(runGate(["--root", dir]).code).toBe(0);
  });

  it("keeps the leading hyphen a dropped leading character leaves behind", () => {
    // github-slugger does NOT trim, so a heading opening with the marker this repo uses for a
    // load-bearing rule slugs with a leading hyphen. A trim would pass a pointer written without
    // it and resolve to nothing on GitHub.
    const notes = "# notes\n\nP.\n\n## ▶ The section\n\nBody.\n";
    const green = repo({
      "CLAUDE.md": cursor("-the-section", "-the-section"),
      [NOTES_PATH]: notes,
    });
    expect(runGate(["--root", green]).code).toBe(0);

    const red = repo({ "CLAUDE.md": cursor("the-section", "the-section"), [NOTES_PATH]: notes });
    expect(runGate(["--root", red]).code).toBe(1);
  });

  it("keeps an underscore in a slug, which is what makes two real anchors here resolve", () => {
    // `closed-list-not-a-length-bound-snippet_max` and the transaction-names anchor are both live
    // pointers in CLAUDE.md. A slugger treating `_` as emphasis, or stripping it, would red them.
    const dir = repo({
      "CLAUDE.md": cursor("codes-not_verbatim-and-x", "codes-not_verbatim-and-x"),
      [NOTES_PATH]: "# notes\n\nP.\n\n## Codes, NOT_VERBATIM and X\n\nBody.\n",
    });
    expect(runGate(["--root", dir]).code).toBe(0);
  });

  it("hyphenates per SPACE rather than per run, which a real anchor here depends on", () => {
    // `### The --diff-filter polarity lesson` slugs with THREE hyphens and CLAUDE.md cites it
    // twice. A per-run collapse would red both.
    const dir = repo({
      "CLAUDE.md": cursor("the---diff-filter-polarity-lesson", "the---diff-filter-polarity-lesson"),
      [NOTES_PATH]: "# notes\n\nP.\n\n## The --diff-filter polarity lesson\n\nBody.\n",
    });
    expect(runGate(["--root", dir]).code).toBe(0);
  });

  it("does not read a four-space-indented hash line as a heading, matching CommonMark", () => {
    // Disclosed miss (vi) says the fence tracker does not model indented code blocks, and that
    // this is not reachable as a phantom anchor because ATX indentation is bounded at three
    // spaces. This pins that second half.
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: "# notes\n\nP.\n\n## Real\n\n    ## The section\n\nBody.\n",
    });
    expect(runGate(["--root", dir]).code).toBe(1);
  });

  it("deletes a non-ASCII space separator from a slug, as the upstream rule does", () => {
    // The separator is written as an escape, not a literal: a bare U+00A0 is invisible to a reader
    // and to a diff.
    const dir = repo({
      "CLAUDE.md": cursor("ab", "ab"),
      [NOTES_PATH]: "# notes\n\nP.\n\n## A\u00a0B\n\nBody.\n",
    });
    expect(runGate(["--root", dir]).code).toBe(0);
  });
});

/**
 * One case per DISCLOSED MISS in the script header that is marked [PINNED], each written in the
 * direction the miss actually fails. A disclosure that names a test must name one that exists, or
 * the disclosure does the same work the overclaim it warns about does. If a miss is added to the
 * header, a case belongs here or the marking must say [SCOPE].
 */
describe("check-agent-notes: the disclosed misses, each in the direction it fails", () => {
  it("(i) reds a pointer split across a line wrap, because there is no rejoin here", () => {
    // FALSE RED, and that is the safe direction. Every pointer on the real tree sits inside an
    // inline code span, which a wrap cannot split, and `proseWrap: preserve` keeps it that way.
    // The remedy if it ever fires is to unwrap the pointer, never to widen the matcher.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-long-")}\nsection-name\n\nAlso: ${bare("the-section")}\n`,
      [NOTES_PATH]: "# notes\n\nP.\n\n## The section\n\nBody.\n\n## The long section name\n\nB.\n",
    });
    expect(runGate(["--root", dir]).code).toBe(1);
  });

  it("(ii) reds a QUALIFIED pointer carrying a non-anchor character, matching only up to it", () => {
    const dir = repo({ "CLAUDE.md": cursor("the%20section"), [NOTES_PATH]: NOTES });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    // Matched only up to the `%`, so it is reported as `#the`, not as `#the section`.
    expect(r.stderr).toContain("pointer #the does not resolve");
  });

  it("(ii) passes a QUALIFIED pointer whose truncated prefix is itself a heading slug", () => {
    // THE OTHER GREEN ROUTE, and the one a corrected draft of miss (ii) called safe. Truncation
    // reds only when the prefix does not resolve; when it does, the broken pointer is reported as
    // resolving. Asserted green as a disclosed miss so that closing it is a deliberate change.
    const dir = repo({
      "CLAUDE.md": `# cursor\n\nWhy: ${ptr("the-section%20x")}\n\nAlso: ${bare("the-section")}\n`,
      [NOTES_PATH]: NOTES,
    });
    const r = runGate(["--root", dir]);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  });

  it("(ii) is SILENT on a BARE span carrying a non-anchor character, the other green route", () => {
    // ASSERTED GREEN ON PURPOSE, and it matters because the bare form is where almost every
    // pointer on the real tree lives. The bare pattern needs the closing
    // backtick immediately after the anchor run, so a span holding a percent escape, a trailing
    // period or a space never matches at all. It is not a hit the gate then declines the way a
    // digits-only reference is, so there is nothing to count and the OK line still reads clean.
    // A first draft of disclosed miss (ii) claimed these red. They do not, and a second draft
    // then called the qualified route safe, which the case above refutes.
    const dir = repo({
      "CLAUDE.md":
        `${cursor("the-section")}\n` +
        `Escaped: ${bare("the%20section")}\n` +
        `Trailing stop: ${bare("no-such-anchor.")}\n` +
        `Spaced: ${bare("the section")}\n`,
      [NOTES_PATH]: NOTES,
    });
    const r = runGate(["--root", dir]);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    // Only the one well-formed bare pointer was ever seen.
    expect(r.stdout).toContain("1 bare pointer(s)");
  });

  it("(vi-b) mints a phantom anchor from an ATX heading inside an HTML comment", () => {
    // ASSERTED GREEN ON PURPOSE: a disclosed FALSE GREEN rather than a pass. The fence tracker is
    // not an HTML-comment tracker, so commented-out narrative still supplies anchors that GitHub
    // will not resolve. Reachability is why it stays open: the real narrative file contains no
    // HTML comment at all. Pinning it here makes closing it a deliberate change, not a surprise.
    const dir = repo({
      "CLAUDE.md": cursor("the-section", "commented-out"),
      [NOTES_PATH]: `${NOTES}\n<!--\n## Commented out\n\nBody once lived here.\n-->\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(0);
  });

  it("(iii) ignores an anchor on any other file, including the cursor half", () => {
    const dir = repo({
      "CLAUDE.md": `${cursor("the-section")}\nAlso CLAUDE.md${"#"}no-such-anchor.\n`,
      [NOTES_PATH]: NOTES,
    });
    expect(runGate(["--root", dir]).code).toBe(0);
  });

  it("(iv) checks a pointer inside a fenced code block exactly like prose", () => {
    const dir = repo({
      "CLAUDE.md": `${cursor("the-section")}\n\`\`\`sh\n# ${ptr("bogus")}\n\`\`\`\n`,
      [NOTES_PATH]: NOTES,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("pointer #bogus does not resolve");
  });

  it("(v) does not read a BARE anchor outside the cursor and the narrative file", () => {
    // Asserted GREEN on purpose: it is disclosed in the script header, and the measured reason is
    // that the shape is ambiguous elsewhere. This tree carries the ambiguous shapes too, so the
    // case pins both halves at once.
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: NOTES,
      "README.md": `Never read: ${bare("totally-bogus-anchor")}\n`,
      "CHANGELOG.md": `A pull request reference: ${bare("47")}\n`,
      "src/thing.ts": `// the XML text node key is ${bare("text")}\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  });

  it("counts a digits-only BARE anchor as an issue link and prints it, rather than dropping it", () => {
    // Inside the domain, so it IS seen; it is classified rather than checked, and the OK line
    // carries the count so the classification is visible instead of silent.
    const dir = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: `${NOTES}\n## Two\n\nClosed in ${bare("61")}.\n`,
    });
    const r = runGate(["--root", dir]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("1 bare digits-only ref(s)");
  });

  it("(x) matches a Windows-1252 file, and REFUSES a UTF-16 one instead of missing it quietly", () => {
    // Measured with `iconv` on one real pointer. Windows-1252 keeps the pointer's own bytes ASCII,
    // so it matches and a dangling anchor there is a finding. UTF-16 carries NUL bytes, so the
    // no-skip rule turns what would be a silent miss into a refusal.
    const w1252 = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: NOTES,
      // 0x92 is a Windows-1252 right single quote and is not valid UTF-8 on its own.
      "legacy.txt": Buffer.concat([
        Buffer.from("it\x92s here: ", "latin1"),
        Buffer.from(ptr("not-a-section"), "latin1"),
        Buffer.from("\n", "latin1"),
      ]),
    });
    const rw = runGate(["--root", w1252]);
    expect(rw.code).toBe(1);
    expect(rw.stderr).toContain("pointer #not-a-section does not resolve");

    const u16 = repo({
      "CLAUDE.md": cursor("the-section"),
      [NOTES_PATH]: NOTES,
      "wide.txt": Buffer.from(ptr("not-a-section"), "utf16le"),
    });
    const ru = runGate(["--root", u16]);
    expect(ru.code).toBe(2);
    expect(ru.stderr).toContain("contains a NUL byte");
  });
});

describe("check-agent-notes: against this repo", () => {
  it("is green on this tree, with every pointer resolving", () => {
    const r = runGate([]);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(NOTES_PATH);
    expect(r.stdout).toContain("all resolving");
  });

  it("exercises BOTH matchers on this tree, not just the one a sibling would have copied", () => {
    // The claim this pins is the one the script header makes: a single-matcher port would see a
    // handful of pointers and report healthily. Both counts must be non-zero, and the bare count
    // must be the larger of the two, which is what makes the second matcher load-bearing here.
    const r = runGate([]);
    const q = /(\d+) qualified pointer\(s\)/.exec(r.stdout);
    const b = /(\d+) bare pointer\(s\)/.exec(r.stdout);
    expect(q).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Number(q?.[1])).toBeGreaterThan(0);
    expect(Number(b?.[1])).toBeGreaterThan(Number(q?.[1]));
  });

  it("accounts for every tracked path on the OK line, with nothing skipped", () => {
    // The reconciliation is the anti-`observed nothing` property, so it is asserted as a property
    // of the OUTPUT, not just of the exit code. The literal `+ 0 skipped` is the tell that no
    // exclusion list has grown here.
    const r = runGate([]);
    const m = /(\d+) tracked path\(s\) reconciled = (\d+) opened \+ 0 skipped/.exec(r.stdout);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBe(Number(m?.[2]));
    expect(Number(m?.[2])).toBeGreaterThan(0);
  });

  it("agrees byte for byte between the node runner used here and the tsx runner pnpm uses", () => {
    // `pnpm check:agent-notes` runs tsx. Every other case above runs node. Without this, a
    // tsx-only breakage ships green and the cheap runner tests something CI never runs.
    const viaNode = runGate([]);
    const viaTsx = runGate([], TSX_BIN);
    expect(viaTsx.code).toBe(viaNode.code);
    expect(viaTsx.stdout).toBe(viaNode.stdout);
  }, 30_000);
});

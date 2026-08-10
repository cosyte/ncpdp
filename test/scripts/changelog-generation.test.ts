/**
 * Tests for the CHANGELOG generation contract: `.changeset/config.json` plus the
 * shape of `CHANGELOG.md` that makes generated output land where a reader expects
 * it.
 *
 * WHY THIS FILE EXISTS. `CHANGELOG.md` is listed in `package.json#files`, so it is
 * inside every published tarball of this package. For the whole of its published
 * history the release wrote no version heading into it, because
 * `.changeset/config.json` set `"changelog": false`. The file was hand-maintained
 * under one `[Unreleased]` heading that nothing ever rolled over, and its preamble
 * described the first pre-alpha release in the future tense, as a thing still to
 * come, in tarballs that had already carried that API surface for several published
 * versions. That is not a typo to correct by hand: correcting the prose leaves the
 * mechanism that wrote it, and it drifts again on the next release. The flag is what
 * these tests hold down.
 *
 * WHAT EACH TEST PINS, AND WHY IT IS HERE:
 *
 *  1. The flag itself. `changelog` must name a generator that really resolves and
 *     really exports the two functions Changesets calls. `false` is a legal value
 *     that silently produces no version heading at all, which is the state this
 *     work replaced.
 *  2. That the release actually reaches the generator. The `version` script is a
 *     chain, and `changeset version` is the only link in it that writes a
 *     changelog. A future edit that reorders or drops that link turns the flag
 *     into decoration with nothing else going red.
 *  3. THE DEFECT, ASSERTED DIRECTLY: no `[Unreleased]` heading and no
 *     `[Unreleased]` link definition survive in the file, and its preamble makes
 *     no future-tense promise about a release. With generation on, a surviving
 *     hand-maintained `[Unreleased]` heading is worse than before, not better: the
 *     generated version section is prepended ABOVE it, leaving already released
 *     content sitting under "Unreleased" forever, in the tarball.
 *  4. That the file is still shipped. If it ever leaves `files`, the assertions
 *     above are still nice to have but stop being about a consumer-visible defect,
 *     and the next reader deserves to be told which it is.
 *  5. END TO END, AGAINST THE REAL TOOL. The repo's real `CHANGELOG.md` and real
 *     `.changeset/config.json` are copied into a throwaway package, a synthetic
 *     changeset is added, and the real `changeset version` is run. A test that
 *     reimplements where Changesets inserts text proves only that the test agrees
 *     with itself, and would keep passing through the upgrade that moved it. The
 *     released document must satisfy the shape rule TOO, and the archived history
 *     must come through byte identical: a rule that only held before the first
 *     release would wedge this repo the first time this configuration worked.
 *     The throwaway package is a real git repo, which is not tidiness: the default
 *     generator prefixes each entry with the short sha of the commit that added the
 *     changeset, so without history every case here would assert against a line
 *     shape (`- <summary>`) that no release actually writes.
 *  6. THE PREFIX COLLISION, ON THIS PACKAGE'S OWN LADDER, AND THE TWO CONSECUTIVE
 *     RELEASES THAT EXPOSE IT. `## 0.0.1` is a prefix of `## 0.0.10`. This package
 *     has already published past that pair, so any check written with
 *     `String.indexOf` or a substring `toContain` over a version heading reports a
 *     heading the document does not have. The case proves it rather than asserting
 *     it: on a document whose only version heading is `## 0.0.10`, a substring
 *     search for `## 0.0.1` returns TRUE while the exact heading list correctly
 *     does not contain it. Every version-heading comparison in this file is an
 *     exact match against that list for that reason.
 *  7. A CONTROL PROVING THE FLAG IS LOAD-BEARING. The same inputs with
 *     `"changelog": false` must produce NO version heading and leave the document
 *     byte identical. Without this, case 5 would pass on a config change that did
 *     nothing.
 *  8. THE PRETTIER PASS IS LEFT ON HERE, AND THAT IS DERIVED FROM THIS REPO'S OWN
 *     CONFIG RATHER THAN COPIED FROM A SIBLING. Changesets runs the document it
 *     writes through Prettier unless `"prettier": false` turns the pass off, and
 *     the right answer differs per repo. THIS REPO HAS NO `.prettierignore` AT ALL
 *     AND ITS `format:check` GLOBS COVER ROOT MARKDOWN, so `CHANGELOG.md` is inside
 *     the repo's own formatting gate and its archived history is already
 *     Prettier-canonical. Two measured consequences, both pinned below. With the
 *     pass ON the archived history comes through BYTE IDENTICAL, so leaving it on
 *     costs nothing. With the pass OFF the generator's raw output is NOT
 *     Prettier-canonical even for the simplest possible changeset summary (it
 *     writes `## <version>` and `### Patch Changes` on adjacent lines with no blank
 *     line between them), so every Version PR this repo ever opens would red its
 *     own `format:check` on a file nobody edited. A sibling whose `.prettierignore`
 *     lists `*.md` needs the opposite setting; DO NOT RESYNC THIS VALUE BETWEEN
 *     REPOS, derive it from the repo in front of you.
 *  9. THE SHAPE RULE, and the negative control that explains it. Changesets
 *     prepends by replacing the FIRST newline in the file, so exactly one line can
 *     sit above generated output. The rule is that NOTHING BUT THE H1 sits above
 *     the first heading, which is what makes the splice land between two headings
 *     instead of cutting a paragraph in half. It is deliberately not "the archive
 *     heading comes second": a release puts its own version heading there, so that
 *     assertion would wedge the first Version PR this configuration ever opens.
 *     The control reproduces the damage on the shape this file used to have, so the
 *     rule is demonstrated rather than asserted.
 * 10. THE WRONG-PACKAGE NEGATIVE CONTROL. A changeset that names a package this
 *     repo does not contain must not write an entry into this changelog. Without
 *     it, every green case above is consistent with a generator that writes
 *     whatever it is handed regardless of which package the changeset was for.
 * 11. A CHECK ON EVERY PENDING CHANGESET FOR A LINE THE RELEASE WOULD TURN INTO A
 *     HEADING. Summary continuation lines are indented two spaces, which is the `- `
 *     bullet's own content column, so a heading line inside a summary becomes a real
 *     heading nested in the release section, permanently once published. Neither
 *     Changesets nor the release-notes gate looks, so the check lives here, and it
 *     reads the changesets pending RIGHT NOW rather than what the last release
 *     consumed. IT IS NAMED FOR WHAT IT CHECKS, NOT "a changeset cannot smuggle a
 *     heading": the class is open, a refuter reproduced two bypasses of an earlier
 *     column-0-only draft (a leading space, and a setext underline carrying no `#` at
 *     all), and both are closed by `headingLikeLines` below rather than by the name.
 *
 * Every case runs in a temp directory built from scratch, and every mutation
 * happens there: nothing here writes into the repo, bumps its version, or consumes
 * a real changeset. Unlike `test/scripts/phi-scan.test.ts`, whose temp trees have
 * to sit under `test/` because the walk root is what that file proves, these trees
 * belong in the OS temp directory: they contain a `CHANGELOG.md` and a throwaway
 * `package.json` and have nothing to say to the PHI walk roots.
 *
 * The temp tree links this repo's Prettier and its Prettier config in, and that is
 * load-bearing rather than tidy: Changesets resolves Prettier from the tree it is
 * writing into and falls back to its own bundled copy when it finds none, so a run
 * without the links would exercise a formatter and a config that no release of this
 * package has ever used, and case 8 would prove nothing about what really lands on
 * a Version PR.
 *
 * MEASURED WHILE BUILDING THIS, AND WORTH KNOWING BEFORE DEBUGGING A RELEASE:
 * Changesets wraps the changelog write in a try/catch that only `console.warn`s.
 * A tree where `package.json` declares a Prettier config that cannot be resolved
 * bumps the version, consumes the changeset, and writes NO changelog at all, with
 * a warning as the only signal. WHATEVER THE CAUSE, A RELEASE THAT PUBLISHES WITH
 * AN UNCHANGED CHANGELOG IS A WRITE FAILURE, NOT A FLAG THAT QUIETLY REVERTED.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No exec, no
 * shell-form.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import prettier from "prettier";
import { describe, it, expect, afterAll } from "vitest";

const REPO_ROOT = process.cwd();
const CHANGELOG_PATH = join(REPO_ROOT, "CHANGELOG.md");
const CONFIG_PATH = join(REPO_ROOT, ".changeset", "config.json");
const PACKAGE_PATH = join(REPO_ROOT, "package.json");
const CHANGESET_BIN = join(REPO_ROOT, "node_modules", "@changesets", "cli", "bin.js");

/** The heading the hand-written history was moved under. Generated sections sit above it. */
const ARCHIVE_HEADING = "## Released before this file was generated";
const PROBE_SUMMARY = "A synthetic entry written by the changelog generation test.";
/**
 * The probe's summary deliberately QUOTES THE ARCHIVE HEADING on a line of its own, because a
 * changeset CAN do this by accident and the helpers below have to survive it: a quoted copy lands
 * in generated output ABOVE the real heading, where a substring search would find it first and
 * every helper anchored on it would measure the wrong block. Changesets indents every line of a
 * summary after the first, so a quoted copy cannot start at column 0; this is what proves it.
 * Stated exactly: the claim is NOT that nothing in a release section reaches column 0 (the version
 * heading, `### Patch Changes` and the entry's own `- ` bullet all do), only that nothing a SUMMARY
 * contributes below its first line does, and the generator's own column-0 lines are headings and
 * bullets that never spell the archive heading.
 *
 * DO NOT COPY THE PROBE'S SHAPE INTO A REAL CHANGESET. Two spaces is exactly the content column
 * of the `- ` bullet, so an indented `## ...` line is a real ATX heading nested in that list item,
 * and it renders as a SECOND archive divider inside the release section of a tarball that is
 * permanent once published. The changeset shipping this change writes the divider as an inline
 * code span on a line of running prose for that reason. What is safe here is exactly what makes
 * it unsafe there: the anchor survives, and the document grows a heading nobody meant to write.
 */
const PROBE_BODY = `${PROBE_SUMMARY}\n\n${ARCHIVE_HEADING}\n`;

const changelog = readFileSync(CHANGELOG_PATH, "utf8");
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as {
  changelog?: unknown;
  prettier?: unknown;
};
const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as {
  name?: string;
  files?: string[];
  prettier?: unknown;
  scripts?: Record<string, string>;
};

/** The two functions Changesets calls on whatever `changelog` names. */
interface ChangelogFunctions {
  getReleaseLine?: unknown;
  getDependencyReleaseLine?: unknown;
}
type ChangelogModule = ChangelogFunctions & { default?: ChangelogFunctions };

/**
 * The Prettier config this repo really declares, and the package that supplies it.
 *
 * Both are DERIVED from the real manifest rather than retyped. A hardcoded name goes on
 * measuring the arms of a configuration the repo has moved off, silently, and the whole
 * claim in case 8 is that the arms measured are this repo's own.
 */
const prettierConfigSpecifier = typeof pkg.prettier === "string" ? pkg.prettier : "";
const prettierConfigPackage = prettierConfigSpecifier.startsWith("@")
  ? prettierConfigSpecifier.split("/").slice(0, 2).join("/")
  : prettierConfigSpecifier.split("/")[0];

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

/**
 * Would `pnpm format:check` accept this text as the repo's `CHANGELOG.md`?
 *
 * The repo's own Prettier config is resolved against the REAL changelog path, so this asks
 * the same question CI asks rather than a question about Prettier's defaults.
 */
/**
 * Ask Prettier whether it would skip a path, rather than inferring it from the presence of a
 * `.prettierignore` file. `--file-info` is Prettier's own answer and stays correct however the
 * ignore rules are written.
 */
function prettierIgnores(relPath: string): boolean {
  const r = spawnSync(
    join(REPO_ROOT, "node_modules", ".bin", "prettier"),
    ["--file-info", relPath],
    { cwd: REPO_ROOT, encoding: "utf8", shell: false },
  );
  if ((r.status ?? -1) !== 0) {
    throw new Error(`prettier --file-info ${relPath} failed: ${r.stderr}`);
  }
  return (JSON.parse(r.stdout) as { ignored: boolean }).ignored;
}

async function formatCheckAccepts(text: string): Promise<boolean> {
  const options = await prettier.resolveConfig(CHANGELOG_PATH);
  const formatted = await prettier.format(text, {
    ...options,
    filepath: CHANGELOG_PATH,
    parser: "markdown",
  });
  return formatted === text;
}

/**
 * Build a throwaway single-package repo and run the real `changeset version` in it.
 * Returns the resulting `CHANGELOG.md` and the version `package.json` was bumped to.
 */
function runVersion(opts: {
  changelogBody: string;
  /**
   * Applied ON TOP of the repo's real `.changeset/config.json`. The base is read rather than
   * retyped so a setting added to the real config is exercised here by default instead of
   * silently diverging.
   */
  configOverrides?: Record<string, unknown>;
  /** Version the throwaway package starts at. A `patch` changeset bumps it by one. */
  from?: string;
  /**
   * The package the probe changeset names. Defaults to this package. Anything else is the
   * wrong-package negative control, and Changesets is expected to refuse the run outright.
   */
  changesetPackage?: string;
  /** Set when the run is expected to fail, so a refusal is asserted instead of a bump. */
  expectFailure?: boolean;
}): {
  changelog: string;
  version: string;
  status: number | null;
  output: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "ncpdp-changelog-"));
  roots.push(dir);
  mkdirSync(join(dir, ".changeset"));
  writeFileSync(join(dir, "CHANGELOG.md"), opts.changelogBody);
  writeFileSync(
    join(dir, ".changeset", "config.json"),
    JSON.stringify({ ...config, ...(opts.configOverrides ?? {}) }),
  );
  writeFileSync(
    join(dir, ".changeset", "probe.md"),
    `---\n"${opts.changesetPackage ?? "@cosyte/ncpdp"}": patch\n---\n\n${PROBE_BODY}`,
  );
  // `private` keeps the throwaway package unpublishable even if it escaped the temp dir.
  // `prettier` is declared because Changesets reformats the whole document it writes, and
  // it must be reformatted the way THIS repo formats it or the run proves nothing about
  // what lands on the Version PR.
  expect(prettierConfigSpecifier, "package.json declares no Prettier config to resolve").not.toBe(
    "",
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "@cosyte/ncpdp",
      version: opts.from ?? "0.0.0",
      private: true,
      prettier: prettierConfigSpecifier,
    }),
  );
  // Changesets resolves Prettier from the tree it is writing into (`require.resolve` with
  // `paths: [cwd]`) and falls back to its own BUNDLED Prettier when it finds none. That
  // fallback ignores this repo's config, so a temp tree without these two links would
  // exercise a formatter no release ever uses. Links rather than copies: pnpm's own
  // `node_modules` entries are links already.
  // The config PACKAGE is derived from the specifier for the same reason the specifier is
  // derived from the manifest: a link named by hand outlives the config it was named for.
  const configPackage = prettierConfigPackage ?? "";
  expect(configPackage, "the Prettier config specifier names no package").not.toBe("");
  mkdirSync(join(dir, "node_modules", ...configPackage.split("/").slice(0, -1)), {
    recursive: true,
  });
  symlinkSync(join(REPO_ROOT, "node_modules", "prettier"), join(dir, "node_modules", "prettier"));
  symlinkSync(
    join(REPO_ROOT, "node_modules", configPackage),
    join(dir, "node_modules", configPackage),
  );

  // THE TEMP TREE IS A REAL GIT REPO, AND THAT IS LOAD-BEARING RATHER THAN TIDY. The default
  // generator calls `getCommitThatAddsFile` on each changeset and prefixes the entry with that
  // commit's short sha, so the line a release really writes is `- <sha>: <summary>` and not the
  // summary alone. In a tree with no git history the lookup returns nothing and the prefix never
  // appears, which would leave every case below asserting against a shape no release produces.
  // The identity and the hooks path are passed per-invocation. Stated exactly: this does not
  // WRITE to any git config, and it pins the two settings that would otherwise decide what the
  // commit does. It is not independent of global git config in general, and `core.hooksPath` is
  // the one that matters, because a global value points the temp repo's `commit` at hooks this
  // suite never meant to run. Emptying it is not cosmetic: containers here really do set one.
  const git = (...args: string[]): void => {
    const g = spawnSync(
      "git",
      // `example.com` rather than a `.invalid` domain: `pnpm phi-scan` hits any email whose
      // domain is not declared in `scripts/phi-allow-list.txt`, and the reserved domains are
      // already declared there. Reusing one keeps the allow-list from growing for a git
      // identity that never leaves a temp directory.
      [
        "-c",
        "user.name=changelog test",
        "-c",
        "user.email=changelog@example.com",
        "-c",
        "core.hooksPath=",
        ...args,
      ],
      { cwd: dir, encoding: "utf8", timeout: 60_000 },
    );
    expect(g.status, `git ${args.join(" ")}: ${g.stdout ?? ""}${g.stderr ?? ""}`).toBe(0);
  };
  writeFileSync(join(dir, ".gitignore"), "node_modules\n");
  git("init", "--quiet");
  git("add", "--all");
  git("commit", "--quiet", "--no-gpg-sign", "-m", "seed");

  const r = spawnSync(process.execPath, [CHANGESET_BIN, "version"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 60_000,
  });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (opts.expectFailure === true) {
    expect(r.status, output).not.toBe(0);
  } else {
    expect(r.status, output).toBe(0);
  }

  const bumped = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string };
  return {
    changelog: readFileSync(join(dir, "CHANGELOG.md"), "utf8"),
    version: bumped.version,
    status: r.status,
    output,
  };
}

/** Every ATX heading in a markdown document, in document order. */
const headings = (text: string): string[] =>
  text.split("\n").filter((line) => /^#{1,6} /.test(line));

/**
 * Lines of a CHANGESET SUMMARY that would become a heading once the release nests the summary
 * inside its `- ` bullet. Deliberately WIDER than `headings()`, which reads a whole document
 * and only cares about column 0.
 *
 * Two shapes, both reproduced on real generator output by a refuter:
 *
 *  * ATX with up to three leading spaces. CommonMark admits them, so `/^#{1,6} /` is not the
 *    rule; the generator indents such a line and the Prettier pass then normalises it back to
 *    the bullet's content column, leaving a live heading.
 *  * A SETEXT underline (`===` or `---` under a line of text). It contains no `#`, so no ATX
 *    rule could see it, and Prettier rewrites it into an ATX heading. The underline is only a
 *    heading when the line above it is text: after a blank line, `---` is a thematic break and
 *    `- item` is a list, so neither is reported.
 */
function headingLikeLines(summary: string): string[] {
  const lines = summary.split("\n");
  const hits: string[] = [];
  lines.forEach((line, i) => {
    if (/^ {0,3}#{1,6}( |$)/.test(line)) {
      hits.push(line);
      return;
    }
    if (!/^ {0,3}(=+|-+) *$/.test(line)) return;
    const above = i === 0 ? "" : (lines[i - 1] ?? "");
    // A paragraph line above turns the underline into a setext heading. A blank line above
    // makes it a thematic break or a list bullet, neither of which is a heading.
    if (above.trim() !== "" && !/^ {0,3}([*+-]|\d+[.)]) /.test(above)) hits.push(line);
  });
  return hits;
}

/**
 * The one structural rule this file has to keep, stated so that it survives a release.
 *
 * Changesets prepends a release by replacing the FIRST newline in the document, so exactly
 * one line can sit above generated output and everything else is pushed below the newest
 * release section. The rule is therefore NOT "the archive heading comes second": a release
 * legitimately puts its own `## <version>` heading there, and asserting the pre-release
 * neighbour would red the first Version PR that this configuration ever opens. The rule is
 * that nothing but the H1 sits above the first heading, so whatever the release splices in
 * lands between two headings and can never cut a paragraph in half.
 *
 * Returns a description of the violation, or `undefined` if the document is well shaped.
 */
function shapeViolation(text: string): string | undefined {
  const lines = text.split("\n");
  if (lines[0] !== "# Changelog") return `line 1 is ${JSON.stringify(lines[0])}, not the H1`;
  const next = lines.slice(1).find((line) => line.trim() !== "");
  if (next === undefined) return "the document has no content below the H1";
  if (!/^## /.test(next)) return `prose above the first heading: ${JSON.stringify(next)}`;
  const anchors = lines.filter((line) => line === ARCHIVE_HEADING).length;
  if (anchors !== 1) return `expected exactly one archived-history heading, found ${anchors}`;
  return undefined;
}

/**
 * The header block of the archived half: from its heading down to its first entry section.
 *
 * The heading is located as a WHOLE LINE, not with `indexOf`. A changeset summary may quote
 * it (this slice's own does), and a quoted copy inside a release section sits above the real
 * heading, so a substring search would slice a few characters out of generated output and the
 * future-tense guard below would silently stop reading the preamble it exists to protect.
 * A whole-line match cannot collide: `getReleaseLine` prefixes the first line of every summary
 * with `- ` and indents every later line by two spaces, so no line a summary contributes below
 * its first can begin at column 0, and the generator's own column-0 lines are the version
 * heading, `### Patch Changes` and that bullet, none of which spell the archive heading.
 * `shapeViolation` asserts the count is one, so if that ever stops holding this fails loudly
 * instead of measuring the wrong block.
 */
function archivePreamble(text: string): string {
  const lines = text.split("\n");
  const start = lines.indexOf(ARCHIVE_HEADING);
  if (start === -1) return "";
  const end = lines.findIndex((line, i) => i > start && line.startsWith("### "));
  return (end === -1 ? lines.slice(start) : lines.slice(start, end)).join("\n");
}

/** Everything from the archived-history heading down, located the same whole-line way. */
function archivedHistory(text: string): string {
  const lines = text.split("\n");
  const start = lines.indexOf(ARCHIVE_HEADING);
  return start === -1 ? "" : lines.slice(start).join("\n");
}

describe("changelog generation is on", () => {
  it("names a changelog generator that resolves and exports what Changesets calls", () => {
    // `false` is the value this package shipped its whole published history under,
    // and it is the reason no release ever wrote a version heading.
    expect(config.changelog).not.toBe(false);
    expect(typeof config.changelog).toBe("string");

    const require = createRequire(CONFIG_PATH);
    const mod = require(config.changelog as string) as ChangelogModule;
    const fns = mod.default ?? mod;
    expect(typeof fns.getReleaseLine).toBe("function");
    expect(typeof fns.getDependencyReleaseLine).toBe("function");
  });

  it("runs `changeset version` from the release `version` script, so the flag is reached", () => {
    // The flag only does anything if the release actually invokes the tool that reads it.
    // This repo's `version` script is a chain (`changeset version`, then a version sync,
    // then a format pass), and only the first link writes a changelog.
    const version = pkg.scripts?.["version"] ?? "";
    expect(version).toMatch(/(^|&&\s*)changeset\s+version(\s|$|&)/);
  });

  it("keeps CHANGELOG.md in the published tarball, which is why any of this matters", () => {
    expect(pkg.files ?? []).toContain("CHANGELOG.md");
  });

  it("leaves the release's Prettier pass on, because this repo's markdown IS Prettier-managed", () => {
    // The discriminator, derived from this repo rather than inherited from a sibling: `format:check`
    // globs root markdown and nothing excludes `CHANGELOG.md`, so it is inside this repo's own
    // formatting gate. A repo whose `.prettierignore` covers `CHANGELOG.md` needs
    // `"prettier": false` instead; the two behavioural cases below are what make that a
    // measurement rather than a preference.
    //
    // ▶ THIS ASSERTION USED TO BE `no .prettierignore EXISTS AT ALL`, AND THAT PROXY WAS TOO WIDE.
    // It broke the moment one was added for an unrelated path (`documentation/`, which holds
    // byte-verbatim relocated prose that Prettier reindents), even though `CHANGELOG.md` stayed
    // fully Prettier-managed. A gate keyed on a filename breaking when unrelated content moves is
    // a known class here, and the remedy is to narrow the check to the property it stands for,
    // never to delete the trap to get green. So the question is asked of Prettier itself rather
    // than of the filesystem: `--file-info` reports whether THIS path is ignored.
    expect(config.prettier).toBeUndefined();
    expect(prettierIgnores("CHANGELOG.md")).toBe(false);
    expect(pkg.scripts?.["format:check"] ?? "").toContain('"*.{json,md,yml}"');
  });

  it("keeps the committed changelog Prettier-canonical, which is what makes leaving it on safe", async () => {
    await expect(formatCheckAccepts(changelog)).resolves.toBe(true);
  });
});

describe("CHANGELOG.md carries no hand-maintained Unreleased section", () => {
  it("has no [Unreleased] heading", () => {
    // With generation on this is not merely stale: the release prepends its version
    // section ABOVE this heading, so released content would sit under "Unreleased"
    // permanently, in the tarball.
    expect(headings(changelog).filter((h) => h.includes("[Unreleased]"))).toEqual([]);
  });

  it("has no [Unreleased] link definition left behind", () => {
    expect(changelog).not.toMatch(/^\[Unreleased\]:/m);
  });

  it("makes no future-tense promise about a release in its preamble", () => {
    // The published preamble read: the first pre-alpha release "will ship" the API
    // surface below. It had shipped, several versions earlier, in this same file.
    //
    // The block is located by the ARCHIVE HEADING, not by the first `### ` in the
    // document. Anchoring on the first `### ` measures the whole header today and a
    // couple of dozen bytes of generated output after the first release, at which
    // point this assertion would silently stop reading the preamble it guards.
    const preamble = archivePreamble(changelog);
    expect(preamble.length).toBeGreaterThan(200);
    expect(preamble).not.toMatch(/will ship/i);
  });
});

describe("no pending changeset opens a line with an ATX or setext heading", () => {
  // TRAP 6, AND THE ONE PLACE IT CAN BE CHECKED MECHANICALLY. `getReleaseLine` prefixes the
  // first line of a summary with `- ` and indents every later line by exactly two spaces,
  // which is the content column of that bullet. So a heading line inside a summary becomes a
  // real heading nested in the list item, and it renders as an extra heading inside the
  // release section of a tarball that is permanent once published. Nothing in Changesets
  // prevents it and the release-notes gate does not look, so the check has to be here. It
  // reads the changesets pending RIGHT NOW, so it guards the next release rather than
  // restating what the last one did.
  //
  // STATE THE CLAIM AS WHAT IS CHECKED, NOT AS "a changeset cannot smuggle a heading". An
  // earlier draft of this block was named that way and a refuter reproduced two bypasses of
  // it end to end, on real `changeset version` output. Both are closed below; the name stays
  // narrow anyway, because the class is open and a universal here would be an overclaim:
  //
  //   * A LEADING SPACE. `/^#{1,6} /` sees column 0 only, so ` ## x` walked past it. It is
  //     still a heading: CommonMark admits up to three leading spaces, the generator indents
  //     it to column 3, and the Prettier pass then normalises it back to the bullet's content
  //     column. Closed by matching `{0,3}` leading spaces, which is exactly CommonMark's rule.
  //   * A SETEXT UNDERLINE. `Smuggled` over `========` contains no `#` at all, so no ATX rule
  //     could ever see it, and Prettier REWRITES it into `# Smuggled`, an H1 nested in the
  //     release section. Closed by looking for the underline rather than for a `#`.
  //
  // Neither shape is visible to `shapeViolation` or `headings()`, which both require column 0
  // by design: those two read a whole document, where a heading at column 0 is the only kind
  // that can move the archive.
  const pendingChangesets = readdirSync(join(REPO_ROOT, ".changeset"))
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => ({
      name,
      // Everything after the `---` fenced frontmatter is the summary.
      summary: readFileSync(join(REPO_ROOT, ".changeset", name), "utf8").replace(
        /^---[\s\S]*?\n---\n/,
        "",
      ),
    }));

  it("finds the changesets it is meant to be checking", () => {
    // A directory this test could not read, or one that has gone empty between releases,
    // must not read as a pass. Zero pending changesets is a legitimate state, so this
    // asserts the enumeration worked rather than asserting a count.
    expect(existsSync(join(REPO_ROOT, ".changeset"))).toBe(true);
    expect(Array.isArray(pendingChangesets)).toBe(true);
  });

  it.each(pendingChangesets.map((c) => [c.name, c.summary] as const))(
    "%s opens no line with a heading the release would nest in its bullet",
    (_name, summary) => {
      expect(headingLikeLines(summary)).toEqual([]);
    },
  );

  // PROBE BOTH BRANCHES OF THE RULE, on shapes this repo deliberately does not commit. A
  // check that only ever runs over compliant input is green whatever it does, and the two
  // REFUSE cases here are the two a refuter used to walk past the first draft of it.
  it.each([
    ["a column-0 ATX heading", "Text.\n\n## Smuggled\n", "## Smuggled"],
    ["one leading space", "Text.\n\n ## Smuggled\n", " ## Smuggled"],
    ["three leading spaces, CommonMark's limit", "Text.\n\n   ### Smuggled\n", "   ### Smuggled"],
    ["a setext H1 underline", "Text.\n\nSmuggled\n========\n", "========"],
    ["a setext H2 underline", "Text.\n\nSmuggled\n--------\n", "--------"],
  ])("refuses %s", (_name, summary, expected) => {
    expect(headingLikeLines(summary)).toEqual([expected]);
  });

  it.each([
    // Four spaces is an indented code block, not a heading, in CommonMark.
    ["four leading spaces", "Text.\n\n    #### not a heading\n"],
    ["a thematic break after a blank line", "Text.\n\n---\n\nMore text.\n"],
    ["a list, whose bullets are not setext underlines", "Text.\n\n- one\n- two\n"],
    ["a hash inside prose or a code span", "The `##` marker and issue #12 are fine.\n"],
  ])("accepts %s", (_name, summary) => {
    expect(headingLikeLines(summary)).toEqual([]);
  });
});

describe("the shape that makes generated output land correctly", () => {
  it("puts nothing but the H1 above the first heading", () => {
    expect(shapeViolation(changelog)).toBeUndefined();
  });

  it(
    "writes the new version section between the H1 and the archived history",
    { timeout: 90_000 },
    async () => {
      const result = runVersion({ changelogBody: changelog });

      expect(result.version).not.toBe("0.0.0");
      expect(headings(result.changelog).slice(0, 3)).toEqual([
        "# Changelog",
        `## ${result.version}`,
        "### Patch Changes",
      ]);
      // The archived history survives, below the release that was just written.
      // Compared as HEADINGS, not as string offsets, for the reason the collision case proves.
      const order = headings(result.changelog);
      expect(order).toContain(ARCHIVE_HEADING);
      expect(order.indexOf(`## ${result.version}`)).toBeLessThan(order.indexOf(ARCHIVE_HEADING));
      // The changeset's own summary is what landed as the entry, in the exact line shape a
      // release writes: the default generator prefixes it with the short sha of the commit
      // that added the changeset. "The changeset summary is the changelog entry" is true of
      // the TEXT, and this pins the LINE, so a generator swap that dropped or changed the
      // prefix is visible here rather than first seen in a published tarball.
      expect(result.changelog).toContain(PROBE_SUMMARY);
      expect(result.changelog).toMatch(
        new RegExp(
          `^- [0-9a-f]{7,40}: ${PROBE_SUMMARY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "m",
        ),
      );
      // AND THE INVARIANT IS CLOSED UNDER A RELEASE: the file a release produces is
      // itself a file the next release can be prepended to. Without this the suite
      // would only ever prove the shape of a file no release had touched yet, which
      // is exactly the file that stops existing the moment this configuration works.
      expect(shapeViolation(result.changelog)).toBeUndefined();
      // THE BYTE-IDENTITY CONTROL, and the reason the Prettier pass can be left on here.
      // The release reformats the WHOLE document through Prettier, so an entry the archive
      // already carried must survive that pass unchanged. This is the assertion that would
      // catch a Prettier pass silently rewriting already-published text, which is text
      // corruption inside a tarball rather than a formatting preference.
      expect(archivedHistory(result.changelog)).toBe(archivedHistory(changelog));
      expect(archivePreamble(result.changelog)).toBe(archivePreamble(changelog));
      // And what the release produces is a document this repo's own `format:check` accepts,
      // so the Version PR is not red on a file nobody edited.
      await expect(formatCheckAccepts(result.changelog)).resolves.toBe(true);
    },
  );

  it(
    "survives the version-heading prefix collision, across two consecutive releases",
    // Above the two 60s `spawnSync` ceilings this case can spend, so a hung subprocess
    // reports as itself rather than as a case timeout.
    { timeout: 150_000 },
    () => {
      // `## 0.0.1` is a PREFIX of `## 0.0.10`, and this package has already published past
      // that pair. So a document whose only version heading is `## 0.0.10` answers TRUE to a
      // substring search for a heading it does not have. An assertion written that way goes
      // wrong inside a Version PR, with the changeset already consumed, and `prepublishOnly`
      // runs this same suite under `changeset publish`.
      const first = runVersion({ changelogBody: changelog, from: "0.0.9" });
      expect(first.version).toBe("0.0.10");

      // The collision, demonstrated on real generator output rather than asserted.
      expect(first.changelog).toContain("## 0.0.1"); // a substring check is satisfied ...
      expect(headings(first.changelog)).not.toContain("## 0.0.1"); // ... by a heading that is not there.
      expect(headings(first.changelog)).toContain("## 0.0.10");

      // A second release onto a document that already carries generated output.
      const second = runVersion({ changelogBody: first.changelog, from: first.version });
      expect(second.version).toBe("0.0.11");

      expect(headings(second.changelog).slice(0, 5)).toEqual([
        "# Changelog",
        "## 0.0.11",
        "### Patch Changes",
        "## 0.0.10",
        "### Patch Changes",
      ]);
      // Newest first, the archive last, and the history untouched by either release.
      const order = headings(second.changelog);
      expect(order.indexOf("## 0.0.10")).toBeLessThan(order.indexOf(ARCHIVE_HEADING));
      expect(shapeViolation(second.changelog)).toBeUndefined();
      expect(archivePreamble(second.changelog)).toBe(archivePreamble(changelog));
      expect(archivedHistory(second.changelog)).toBe(archivedHistory(changelog));
    },
  );

  it(
    "writes no version heading at all when the generator is off (the control)",
    { timeout: 90_000 },
    () => {
      const result = runVersion({
        changelogBody: changelog,
        configOverrides: { changelog: false },
      });

      expect(result.version).not.toBe("0.0.0");
      // The version bump still happens. The changelog is simply never touched,
      // which is the whole defect: nothing tells a reader the release went out.
      expect(result.changelog).toBe(changelog);
      // As a HEADING, not a substring, for the reason the case above proves.
      expect(headings(result.changelog)).not.toContain(`## ${result.version}`);
      expect(result.changelog).not.toContain(PROBE_SUMMARY);
    },
  );

  it(
    "reds this repo's own format:check when the Prettier pass is turned off (the control)",
    { timeout: 90_000 },
    async () => {
      // The setting proved load-bearing rather than assumed, in the direction that applies
      // HERE. `"prettier": false` is the right answer in a sibling whose `.prettierignore`
      // lists `*.md`; it is the wrong answer in this repo, and this is the measurement that
      // says so. With the pass off the generator writes `## <version>` and `### Patch Changes`
      // on adjacent lines with no blank line between them, which this repo's Prettier config
      // rejects. That is not a style quibble: `format:check` runs on every PR, so the Version
      // PR would open red on a file no human touched, and the archive is untouched either way
      // so nothing is bought in exchange.
      const off = runVersion({ changelogBody: changelog, configOverrides: { prettier: false } });

      expect(headings(off.changelog).slice(0, 2)).toEqual(["# Changelog", `## ${off.version}`]);
      await expect(formatCheckAccepts(off.changelog)).resolves.toBe(false);
      // Named concretely rather than left as "something is off": the two headings collide.
      expect(off.changelog).toContain(`## ${off.version}\n### Patch Changes`);
      // The archived history is byte identical in BOTH arms, which is what makes the
      // trade one-sided: leaving the pass on costs nothing and turning it off costs CI.
      expect(archivedHistory(off.changelog)).toBe(archivedHistory(changelog));
    },
  );

  it(
    "writes nothing for a changeset naming a different package (the negative control)",
    { timeout: 90_000 },
    () => {
      // Without this, every green case above is equally consistent with a generator that
      // writes whatever changeset it is handed into whatever changelog is in front of it.
      // The package named here is a real sibling, so this is not merely "an unknown string":
      // it is the mistake a copied changeset actually makes.
      const wrong = runVersion({
        changelogBody: changelog,
        changesetPackage: "@cosyte/hl7",
        expectFailure: true,
      });

      expect(wrong.status).not.toBe(0);
      expect(wrong.changelog).toBe(changelog);
      expect(wrong.changelog).not.toContain(PROBE_SUMMARY);
      // The version is untouched: nothing was released on the strength of another
      // package's changeset.
      expect(wrong.version).toBe("0.0.0");
    },
  );

  it(
    "splits the header when prose follows the H1 (the negative control)",
    { timeout: 90_000 },
    () => {
      const oldShape = [
        "# Changelog",
        "",
        "All notable changes to this project will be documented in this file.",
        "",
        "## [Unreleased]",
        "",
        "### Added",
        "",
        "- something that has already shipped",
        "",
      ].join("\n");

      const result = runVersion({ changelogBody: oldShape });

      // The release section is inserted between the H1 and the preamble, so the
      // preamble now reads as part of the release, and `[Unreleased]` still holds
      // shipped content below it.
      expect(headings(result.changelog)).toEqual([
        "# Changelog",
        `## ${result.version}`,
        "### Patch Changes",
        "## [Unreleased]",
        "### Added",
      ]);
      expect(result.changelog.indexOf("All notable changes")).toBeGreaterThan(
        result.changelog.indexOf(PROBE_SUMMARY),
      );
    },
  );
});

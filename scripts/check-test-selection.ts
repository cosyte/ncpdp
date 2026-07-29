#!/usr/bin/env tsx
/**
 * scripts/check-test-selection.ts
 *
 * WHAT THIS GUARDS, AND WHY IT IS NOT COVERED BY ANYTHING ELSE.
 *
 * The required CI job runs `pnpm test` and `pnpm test:coverage`, which run vitest, which
 * runs whatever the config's `include` globs select. A required JOB gates its STEPS; it
 * does not gate what those steps SELECT. So the whole PHI and property layer of this repo
 * hangs off one line of repo-local config:
 *
 *     include: ["test/**\/*.test.ts", "src/**\/*.test.ts"]
 *
 * The shared `@cosyte/vitest-config` supplies no `include` of its own and spreads the
 * repo's `test` block last, so that line is hand-written, unguarded, and a one-line edit.
 * Narrow it to `test/script` and `test/telecom` and the PHI-scanner suite and the entire
 * `test/property` fuzz layer stop running, with every required check still green.
 *
 * COVERAGE CANNOT BACKSTOP THIS. The coverage gate measures `src/**\/*.ts`. The PHI
 * scanner lives in `scripts/`, and the property suites re-exercise `src/` paths that the
 * unit suites already touch, so dropping either costs close to zero coverage percent.
 * That is what makes the failure silent rather than merely risky.
 *
 * WHAT THIS FILE DOES. It compares the set of test files that EXIST against the set of
 * test files vitest would actually RUN, checks that the package scripts CI invokes do not
 * narrow the run behind the config's back, and reds on any shortfall IN ITS SUBJECT. It then
 * proves, on every single run, that it can still observe each of those, by seeding them and
 * requiring itself to catch them.
 *
 * "IN ITS SUBJECT" IS LOAD-BEARING. That subject is three sets unioned: modules under a
 * workflow-derived path, modules referencing the PHI scanner, and files whose NAME ends
 * `.test.` / `.spec.`. Only the first two are name-independent, and today they cover 4 of
 * this repo's 24 test files. For the other 20 the filename shape is the ONLY rule. See the
 * limits below; it is the largest known hole here.
 *
 * ---------------------------------------------------------------------------
 * FIVE DESIGN RULES, each of which is load-bearing. Do not "simplify" past them.
 *
 * (1) DENY-LIST THE EXCLUSIONS, NEVER ALLOW-LIST THE INCLUSIONS. An allow-list silently
 *     skips everything it does not name. The sibling PHI gate next door shipped exactly
 *     that bug: it allow-listed git status letters with `--diff-filter=AM` and therefore
 *     skipped renames, and then type changes, because neither letter was named.
 *
 *     THIS FILE SHIPPED THE SAME BUG ONCE AND THE REFUTER FOUND IT. The first version
 *     defined its subject as tracked `*.test.ts`, which is an allow-list of FILENAME
 *     SHAPES: `git mv test/property/script-xxe-fuzz.property.test.ts <same>.spec.ts` left
 *     a fuzz suite that neither the config selected nor this gate missed, and the run
 *     printed OK over 23 files. The subject is now shape-independent WHERE A DERIVED RULE
 *     REACHES (`modulesUnder`, the PHI rule) and nowhere else. An earlier draft called the
 *     name sweep "a floor under the derived rules rather than the only rule"; that is false
 *     for the 20 of 24 files no derived rule reaches, where it IS the only rule. The
 *     allow-list is scoped, not gone, and shrinking its scope means deriving more subjects
 *     from workflows, never widening the name pattern.
 *
 * (2) OBSERVE THE RESOLVED SELECTION, NOT THE CONFIG TEXT. This asks vitest itself, via
 *     `vitest list --filesOnly`, which files it would run. Reading the globs out of
 *     `vitest.config.ts` and reasoning about them would miss every other way to narrow a
 *     selection: `exclude`, `projects`, `dir`, a workspace. Asking the runner is the only way
 *     the answer stays true when the mechanism changes. It does NOT buy a config body that
 *     branches on its own invocation, which an earlier draft claimed; see the limits below.
 *
 * (3) THE CONFIG IS NOT THE ONLY SELECTOR. THE INVOCATION IS ONE TOO. A pristine config
 *     proves nothing if the command line narrows the run, and `vitest list` cannot see
 *     that, because it resolves the config rather than the package script. The refuter's
 *     two blocking findings against the first version were both here: `vitest --run <path>`
 *     evaded a rule that keyed on the literal `vitest run`, and every `--flag=value` form
 *     (`--config=`, `--project=`, `--dir=`, `--shard=`) was invisible to a rule that only
 *     looked for bare tokens. A THIRD version tokenised arguments after a whole-word
 *     `vitest`, which failed closed on arguments but OPEN on the invocation, so a body with
 *     no `vitest` token in it at all (`pnpm run test:unit`, or
 *     `node node_modules/vitest/vitest.mjs run <paths>`) was reported as passing. The rule
 *     no longer INTERPRETS the body: it must equal one of two exact strings. Parsing a
 *     shell string is unbounded, and each round of hardening bought one more spelling
 *     rather than a closed rule. See `ALLOWED_TEST_SCRIPT_BODIES`.
 *
 * (4) THE SUBJECTS ARE DERIVED FROM ARTIFACTS THAT EXIST FOR THEIR OWN REASONS. A list in
 *     this file saying "the property suite matters" would be a second, hand-editable lever
 *     on the gate's own scope, deletable in one line by the same person narrowing the glob.
 *     So the two headline subjects are read out of committed files that are not ours to
 *     quietly edit: the fuzz workflow, which names its target path to run it at all, and
 *     the CI caller, which switches the PHI scanner on. Dropping a subject now means
 *     editing a workflow, which is a visible change to a file under review.
 *
 * (5) THE GATE MUST DEMONSTRATE ITS OWN REDNESS, NOT ASSERT IT. A guard like this is easy
 *     to make vacuous by accident: point it at the wrong root, mis-normalise a path, let a
 *     subprocess fail open, key a regex on one spelling of a CLI. So before it reports
 *     anything, it seeds the removals it exists to catch and requires itself to catch them:
 *     against the comparison logic, against the invocation rule, and end to end through a
 *     genuinely narrowed vitest config resolved by real vitest. If a seeded narrowing does
 *     NOT come back red, this exits non-zero and says the detector cannot detect. A check
 *     that cannot fail is documentation. Note which rules the self-tests cover: the first
 *     version self-tested only the two rules that were already sound, and both blocking
 *     defects landed in the two that were not covered.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES NOT COVER, stated plainly rather than left to be discovered. This is a
 * list of known limits, not a proof that the list is complete.
 *
 *   * WHICH SCRIPT the shared pipeline elects to invoke. This checks `test` and
 *     `test:coverage`, the two the shared caller in `cosyte/.github` runs today. That repo
 *     is not this one's to edit, and a change there is out of this gate's reach.
 *   * Scripts other than those two, and anything a workflow runs inline rather than through
 *     a package script.
 *   * A CONFIG THAT BRANCHES ON ITS OWN INVOCATION. `resolvedSelection` runs `vitest list`
 *     and CI runs `vitest run`, so a config whose `include` reads `process.argv` can answer
 *     the two differently. Every other config-side narrowing is caught; this one is not.
 *   * A RENAME OUT OF THE `.test.` / `.spec.` SHAPE, for any file no derived rule reaches:
 *     20 of 24 today, everything outside `test/property` and the PHI suite.
 *     `git mv test/telecom/parse.test.ts test/telecom/parse-checks.ts` stops that suite
 *     running and this gate prints OK, as does moving a suite INTO `test/_helpers/`, which
 *     no rule covers at all. THE LARGEST KNOWN HOLE, and why the OK line prints how many
 *     test modules the gate is not looking at. Closing it means DERIVING more subjects from
 *     workflows; not widening the name pattern, and not hand-listing "files that are really
 *     tests", which would be a second lever on the gate's own scope (design rule 4).
 *   * Whether a selected test ASSERTS anything useful. Selection is necessary, not
 *     sufficient. That is the refuter's job and the coverage gate's job.
 *   * A file whose only home is an untracked working tree. It is invisible here and equally
 *     invisible to CI, which is the same thing being true twice rather than a hole.
 *
 * Run it locally with `pnpm check:test-selection` (also reached by `pnpm check`, which is
 * on the meta-repo's `scripts/verify.sh ncpdp` ladder).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_DIR = join(ROOT, ".github", "workflows");

/** The two package scripts the shared CI pipeline invokes. Both must exist. */
const CI_TEST_SCRIPTS = ["test", "test:coverage"];

/** TypeScript/JavaScript module suffixes, used where a rule must not key on `.test.`. */
const CODE_FILE = /\.[cm]?[jt]sx?$/;

/** A path is compared and reported in POSIX form, whatever the host separator is. */
const toPosix = (p: string): string => p.split(sep).join("/");

/** Every problem found, printed together at the end. One run, all the news. */
const failures: string[] = [];
const fail = (message: string): void => {
  failures.push(message);
};

/**
 * A refusal is not a failure. A failure means the repo is wrong; a refusal means THIS FILE
 * could not do its job, and reporting either OK or a tidy list of violations from a scan
 * that did not complete is the worst of the three outcomes. Refusals exit immediately.
 */
function refuse(message: string): never {
  process.stderr.write(`check-test-selection: REFUSING TO REPORT\n  ${message}\n`);
  process.exit(1);
}

/** Run a command, refusing on any non-zero exit or spawn error. No silent fail-open. */
function run(cmd: string, args: string[], what: string): string {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.error) refuse(`${what}: could not run \`${cmd}\`: ${r.error.message}`);
  if (r.status !== 0) {
    refuse(
      `${what}: \`${cmd} ${args.join(" ")}\` exited ${String(r.status)}\n  ${r.stderr.trim()}`,
    );
  }
  return r.stdout;
}

// ---------------------------------------------------------------------------
// THE TWO SETS.

/** Every tracked path in the repo. The one enumeration everything else is derived from. */
function trackedFiles(): string[] {
  const out = run("git", ["ls-files", "-z"], "listing tracked files");
  const files = out.split("\0").filter(Boolean).map(toPosix).sort();
  if (files.length === 0) {
    refuse(
      "`git ls-files` reported zero tracked files, so the enumeration is broken rather than the " +
        "repo being empty. Refusing to report anything from a listing that read nothing.",
    );
  }
  return files;
}

/**
 * The repo-wide floor: tracked files whose NAME says they are tests. This is a filename
 * allow-list and is therefore the weakest rule here on purpose; it is a floor under the
 * two derived rules below, which do not key on the name at all. Suffixes are broad
 * (`.test.` and `.spec.`, any TS/JS extension) because the narrow version of this line was
 * itself the escape hatch a rename walked through.
 */
const nameShapedTests = (tracked: string[]): string[] =>
  tracked.filter((f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f));

/**
 * What RUNS. Asks vitest to resolve its own selection. `configPath` is used only by the
 * self-test below, which points it at a deliberately narrowed config.
 *
 * The output filter takes whole-line, whitespace-free, code-suffixed tokens, so a banner
 * or deprecation notice that happens to name a `.ts` file cannot be mistaken for a
 * selected file. Anything that slips through anyway is additive, and an addition can only
 * mask a real shortfall by coinciding exactly with a tracked path; the OK line reports the
 * count of selected-but-untracked entries so that stays visible rather than silent.
 */
function resolvedSelection(configPath?: string): string[] {
  const args = ["list", "--filesOnly", "-r", ROOT];
  if (configPath !== undefined) args.push("-c", configPath);
  const out = run("./node_modules/.bin/vitest", args, "resolving the vitest selection");
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/\s/.test(l) && CODE_FILE.test(l))
    .map((l) => toPosix(relative(ROOT, resolve(ROOT, l))))
    .sort();
}

// ---------------------------------------------------------------------------
// THE INVOCATION RULE (design rule 3).

/**
 * The COMPLETE, exact bodies the two CI test scripts are allowed to have.
 *
 * THIS RULE DOES NOT PARSE. Two earlier versions tried to, and each shipped a blocking
 * evasion that the next refuter pass found: the first keyed on the literal string
 * `vitest run`, so `vitest --run <path>` walked past it; the second tokenised arguments
 * after a whole-word `vitest`, which failed CLOSED on arguments but OPEN on the
 * invocation, so `"test": "pnpm run test:unit"` (or
 * `node node_modules/vitest/vitest.mjs run <paths>`, or `sh -c '...'`) contained no
 * `vitest` token, produced no arguments, and was reported as passing. Analysing a shell
 * string is an unbounded problem, and every round of hardening bought one more spelling
 * rather than a closed rule.
 *
 * So the rule is total instead: the script body must be one of these strings, character
 * for character. There is no spelling to miss, because nothing is interpreted. A wrapper,
 * a delegation to another script, an extra flag, an alternate config, a path filter and a
 * shard are all simply "not one of these two strings".
 *
 * THE COST, ACCEPTED DELIBERATELY: a legitimate addition such as
 * `--reporter=github-actions` reds until it is added here. That is a one-line, reviewed
 * commit, and the diff shows the whole new body rather than a flag name whose effect a
 * reader has to know. A gate cannot stop a visible, deliberate edit; it exists to stop a
 * silent one, and adding a narrowed body to a set called ALLOWED_TEST_SCRIPT_BODIES is
 * about as loud as an edit gets.
 */
const ALLOWED_TEST_SCRIPT_BODIES = new Set(["vitest run", "vitest run --coverage"]);

/** True when a script body is an exactly-known-good invocation. Whitespace-normalised. */
const bodyIsAllowed = (body: string): boolean =>
  ALLOWED_TEST_SCRIPT_BODIES.has(body.trim().replace(/\s+/g, " "));

// ---------------------------------------------------------------------------
// THE DERIVED SUBJECTS (design rule 4).

/**
 * Paths this repo's own workflows hand to a `vitest run`. The fuzz workflow names
 * `test/property` because it has to in order to run it at all, which makes that workflow a
 * source of truth about which directory carries the fuzz layer that no list in this file
 * could be.
 *
 * The extraction is text, not YAML, so it needs shape filters: stop at the first shell
 * metacharacter (so a redirection like `2>/dev/null` is not mistaken for a path) and keep
 * only tokens that contain a `/`. That drops the surrounding English where the notifier's
 * issue body mentions the same command, while keeping the command's real argument.
 *
 * TWO DELIBERATE CHOICES. It is NOT filtered by "does this path exist", because then
 * deleting the directory would delete the requirement along with it, which is precisely
 * the failure mode being closed. And it does not try to tell a real `run:` command from
 * prose that quotes one: both are edits to a reviewed file, and the generous reading keeps
 * a subject alive, which is the safe direction to be wrong in. An interpolated argument
 * (`vitest run ${{ matrix.target }}`) yields no literal path and therefore no subject; if
 * it is the only one, the empty-set refusal below fires rather than a quiet pass.
 */
function workflowDerivedPaths(): string[] {
  const names = run("git", ["ls-files", "-z", "--", ".github/workflows"], "listing workflows")
    .split("\0")
    .filter(Boolean);
  if (names.length === 0) refuse("no tracked workflow files found under .github/workflows");

  const found = new Set<string>();
  for (const name of names) {
    for (const line of readFileSync(join(ROOT, name), "utf8").split("\n")) {
      const after = /vitest\s+run\s+(.*)$/.exec(line)?.[1];
      if (after === undefined) continue;
      for (const raw of (after.split(/[|&;<>#]/)[0] ?? "").split(/\s+/)) {
        const tok = raw.replace(/[`'"\\,.)(]+$/, "").replace(/^[`'"\\(]+/, "");
        if (tok.startsWith("-") || tok.includes("$") || !tok.includes("/")) continue;
        found.add(toPosix(tok));
      }
    }
  }
  if (found.size === 0) {
    refuse(
      "no workflow hands a path to `vitest run`, so this gate has no derived fuzz subject to " +
        "protect. The nightly fuzz workflow used to name `test/property`. If that job was removed " +
        "on purpose, this gate's derivation has to be re-grounded on whatever replaced it, " +
        "deliberately, rather than allowed to pass vacuously.",
    );
  }
  return [...found].sort();
}

/**
 * EVERY tracked module under a derived path, and EVERY ONE OF THEM MUST RUN. No name filter,
 * and no exemption of any kind.
 *
 * THE ABSENCE OF AN EXEMPTION IS THE RULE. Two earlier versions had one and each was an
 * evasion. Exempting `_`-prefixed modules on the name alone let `git mv <xxe suite> _xxe.ts`
 * drop the XXE refusal suite. Adding "AND something that runs imports it" did not fix it: the
 * import test was a bare substring search over the concatenated text of every selected file,
 * so `_helpers.ts` passed (15 of 24 selected suites contain that substring, from
 * `../_helpers/load-fixture`) and so did a `_`-prefixed DIRECTORY (`_x/parse.ts`; `parse`
 * appears in 21 of 24). Both measured green. The exemption is deleted rather than narrowed a
 * third time, which is the move the invocation rule already made: matched text has a spelling
 * to miss, and an absent exemption has nothing to forge.
 *
 * THE COST IS PAID ONCE IN THE REPO, NOT IN THIS FILE: a helper may not live under a derived
 * path. This repo had one, `test/property/_fuzz-config.ts`, now `test/_helpers/fuzz-config.ts`.
 */
const modulesUnder = (tracked: string[], path: string): string[] =>
  tracked.filter((f) => (f === path || f.startsWith(`${path}/`)) && CODE_FILE.test(f));

/**
 * Whether the shared CI caller switches the PHI scanner on. Paired with the presence of a
 * `phi-scan` package script, this is what makes "a suite must exercise the PHI scanner" a
 * derived requirement rather than an opinion held by this file.
 */
function ciEnablesPhiScan(): boolean {
  const p = join(WORKFLOW_DIR, "ci.yml");
  if (!existsSync(p)) refuse(".github/workflows/ci.yml is missing; cannot derive the PHI subject");
  return /^\s*run-phi-scan:\s*true\s*$/m.test(readFileSync(p, "utf8"));
}

/**
 * Tracked modules under `test/` whose text references the PHI scanner. Keyed on CONTENT, not
 * on the filename, so renaming the suite does not remove it from the gate's subject. EVERY
 * ONE OF THEM MUST RUN.
 *
 * THE DIRECTION OF THIS RULE IS THE POINT. It was briefly inverted, to "does at least one
 * module that ACTUALLY RUNS reference the scanner", to avoid reddening on a comment in an
 * unselected helper. That trade was backwards: it swapped a loud, one-commit-fixable false
 * red for a silent hole, since `git mv phi-scan.test.ts phi-scan-suite.ts` plus the words
 * `scripts/phi-scan.ts` in a comment in any running file satisfied it, measured green, with
 * the suite no longer running. Under PHI, a false red is the safe way to be wrong.
 *
 * THE RESIDUAL IS NOT CLOSED. The subject is derived from text, so text can move it: deleting
 * the reference from the renamed suite AND planting one in a running file leaves this green
 * (measured). The honest narrowing is to match an IMPORT SPECIFIER rather than any mention,
 * which prose cannot forge. It does not apply yet, because this repo's PHI suite spawns the
 * scanner as a subprocess and never imports it, so there is no specifier to key on.
 */
const phiScannerSuites = (tracked: string[]): string[] =>
  tracked.filter(
    (f) =>
      f.startsWith("test/") &&
      CODE_FILE.test(f) &&
      /scripts[/\\]phi-scan/.test(readFileSync(join(ROOT, f), "utf8")),
  );

// ---------------------------------------------------------------------------
// THE CHECKS.

interface Violations {
  missing: string[];
  fuzz: string[];
  phi: string[];
}

/**
 * Applies every selection rule to one selection and returns what it found. Taking the
 * selection as a parameter is what lets the self-tests run the REAL rules against a
 * DELIBERATELY NARROWED selection, rather than against a mock of them.
 */
function violationsFor(
  tracked: string[],
  selected: string[],
  derivedPaths: string[],
  phiSuites: string[],
): Violations {
  // Set arithmetic and nothing else. No rule here reads the content of a selected file, so
  // there is no text for a rename or a planted comment to talk its way past.
  const running = new Set(selected);
  const missing = nameShapedTests(tracked).filter((f) => !running.has(f));

  const fuzz: string[] = [];
  for (const p of derivedPaths) {
    const inPath = modulesUnder(tracked, p);
    if (inPath.length === 0) {
      fuzz.push(`${p} is named by a workflow's \`vitest run\` but contains no tracked module`);
      continue;
    }
    const dropped = inPath.filter((f) => !running.has(f));
    if (dropped.length > 0)
      fuzz.push(`${p}: tracked module(s) not selected: ${dropped.join(", ")}`);
  }

  return { missing, fuzz, phi: phiSuites.filter((f) => !running.has(f)) };
}

const tracked = trackedFiles();
const selected = resolvedSelection();
const derivedPaths = workflowDerivedPaths();
const phiSuites = phiScannerSuites(tracked);

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const scripts = pkg.scripts ?? {};

// The PHI subject, derived in two steps so neither half can go quiet on its own.
if (scripts["phi-scan"] !== undefined && !ciEnablesPhiScan()) {
  fail(
    "package.json defines a `phi-scan` script but .github/workflows/ci.yml does not set " +
      "`run-phi-scan: true`, so the PHI scanner ships without running in CI.",
  );
}
if (scripts["phi-scan"] !== undefined && phiSuites.length === 0) {
  fail(
    "no tracked module under test/ exercises scripts/phi-scan.ts. The PHI scanner is the floor " +
      "under every fixture in this repo; it does not get to be the one thing with no suite.",
  );
}

// The invocation rule. A path filter, an alternate config, a project filter or a shard on
// the command line narrows the run just as effectively as a narrowed glob, and leaves
// vitest.config.ts looking untouched.
for (const name of CI_TEST_SCRIPTS) {
  const body = scripts[name];
  if (body === undefined) {
    fail(
      `package.json has no \`${name}\` script, but the shared CI pipeline invokes it. A missing ` +
        `script is not a passing check.`,
    );
    continue;
  }
  if (!bodyIsAllowed(body)) {
    fail(
      `package.json script \`${name}\` is not an exactly-known-good vitest invocation:\n` +
        `      ${body}\n    ` +
        `Anything other than a bare \`vitest run [--coverage]\` can change WHICH FILES run, and ` +
        `resolving\n    the config cannot see it: a path filter, an alternate --config, a ` +
        `--project, a --shard, or a\n    delegation to another script that does any of those. If ` +
        `this body genuinely cannot narrow the\n    run, add it verbatim to ` +
        `ALLOWED_TEST_SCRIPT_BODIES in scripts/check-test-selection.ts, in its own\n    reviewed ` +
        `commit, with the reason.`,
    );
  }
}

const real = violationsFor(tracked, selected, derivedPaths, phiSuites);
if (real.missing.length > 0) {
  fail(
    `${String(real.missing.length)} tracked test file(s) exist but are NOT selected by ` +
      `vitest.config.ts, so CI never runs them:\n    ${real.missing.join("\n    ")}`,
  );
}
for (const f of real.fuzz) fail(`workflow-derived test path: ${f}`);
if (real.phi.length > 0) {
  fail(
    `tracked module(s) under test/ reference scripts/phi-scan.ts but are NOT selected, so ` +
      `nothing that runs exercises the PHI scanner: ${real.phi.join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// SELF-TESTS (design rule 5). Seed the removal; require the catch.

/** Everything the two derived rules are supposed to protect. */
function protectedFiles(): Set<string> {
  const s = new Set<string>(phiSuites);
  for (const p of derivedPaths) for (const f of modulesUnder(tracked, p)) s.add(f);
  return s;
}

/**
 * Self-test A, against the comparison directly: drop each protected file from the selection
 * ONE AT A TIME, leaving every other file selected, and require a rule to name it.
 *
 * ONE AT A TIME IS THE ENTIRE POINT. The version that hid EVERY protected file at once
 * exercised only the direction where nothing is left to collide with, so it passed while two
 * rules were forgeable BY collision (`_helpers.ts`, and a planted PHI mention). A seed that
 * hides everything proves only the collision-free case. Hiding one file while all the rest
 * stay selected IS the colliding case, by construction and for every file in turn, so a
 * future exemption keyed on what else happens to be running cannot pass this.
 *
 * WHAT A IS NOT PROVING TODAY. Every member of `protectedFiles()` is currently name-shaped,
 * so the floor names them all and A passes even with BOTH derived rules gutted (measured).
 * It discriminates only on a non-name-shaped file under a derived path, which is what
 * `_fuzz-config.ts` was until it moved out. Self-test C is the real backstop for the derived
 * rules; do not delete it thinking A covers them.
 */
function selfTestComparison(): void {
  const targets = [...protectedFiles()];
  if (targets.length === 0) refuse("self-test A has nothing to hide, so it would pass vacuously");

  for (const target of targets) {
    const v = violationsFor(
      tracked,
      selected.filter((f) => f !== target),
      derivedPaths,
      phiSuites,
    );
    const named =
      v.missing.includes(target) ||
      v.phi.includes(target) ||
      v.fuzz.some((l) => l.includes(target));
    if (!named) {
      refuse(
        `self-test A FAILED: dropping ${target} from the selection, with every other file left ` +
          "selected, was reported by no rule. The detector cannot detect.",
      );
    }
  }
}

/**
 * Self-test B, against the invocation rule.
 *
 * EVERY POSITIVE HERE IS A ROUTE A REFUTER ACTUALLY FOUND, and the list is append-only for
 * that reason. Note especially the last group: bodies containing no `vitest` token at all.
 * The rule this replaced tokenised arguments after a whole-word `vitest`, so those bodies
 * produced no arguments and were reported as PASSING. Every sample in this table contained
 * a `vitest` token, which is exactly why the self-test did not catch it: the table tested
 * the rule's behaviour and never its ENTRY CONDITION. If a future version of this rule
 * starts interpreting the body again, these are the samples that must still red.
 */
function selfTestInvocationRule(): void {
  const positives = [
    // Positional path filters, both spellings of the run flag.
    "vitest run test/script",
    "vitest --run test/script test/telecom",
    "vitest run --coverage test/script",
    // Flag-form narrowings.
    "vitest run --coverage --config=vitest.ci.config.ts",
    "vitest run --coverage -c vitest.ci.config.ts",
    "vitest run --coverage --project=unit",
    "vitest run --coverage --dir=test/telecom",
    "vitest run --coverage --shard=1/4",
    "vitest run --coverage -t somePattern",
    "vitest run --coverage --changed",
    "vitest run --coverage --flag-this-file-has-never-heard-of",
    // Chained: the narrowing lives in the SECOND invocation.
    "vitest run --coverage && vitest run test/script",
    // The argument value ends in the word `vitest`, which broke one tokenizer here.
    "vitest run --dir=vitest",
    "vitest run --coverage --config=my-vitest",
    // NO `vitest` TOKEN AT ALL. These are the ones that shipped green.
    "pnpm run test:unit",
    "node node_modules/vitest/vitest.mjs run --coverage test/script",
    "sh -c 'vitest run --coverage test/script'",
    'bash -c "vitest run test/script"',
    "echo skipping tests",
    "",
  ];
  const negatives = ["vitest run", "vitest run --coverage", "  vitest   run  --coverage  "];

  for (const p of positives) {
    if (bodyIsAllowed(p)) {
      refuse(
        `self-test B FAILED: \`${p}\` can change which files vitest runs, or hides what does, ` +
          "and the invocation rule accepted it. The detector cannot detect.",
      );
    }
  }
  for (const n of negatives) {
    if (!bodyIsAllowed(n)) {
      refuse(
        `self-test B FAILED: \`${n}\` cannot narrow the file set, but the invocation rule ` +
          "rejected it. A rule that reds on correct work gets disabled.",
      );
    }
  }
}

/**
 * Self-test C, end to end through real vitest: resolve a genuinely narrowed config and
 * require the same rules to red on it. This proves the OBSERVATION CHANNEL works, not just
 * the arithmetic; if `vitest list` ever stops reporting what it runs, or the root resolves
 * somewhere unexpected, self-test A would still pass and this will not.
 *
 * The narrowed config keeps exactly one test file, chosen at run time as a tracked test
 * that is not protected, so there is no hardcoded filename here to go stale. It is written
 * to an OS temp dir, never into the repo: this tree has a suite that enumerates a fixture
 * directory at module scope, and seeding files inside the repo to test tooling is how a
 * previous change nearly hard-reddened a required check. It also carries no imports, so
 * nothing needs resolving from outside the repo.
 */
function selfTestNarrowedConfig(): void {
  const excluded = protectedFiles();
  const keep = nameShapedTests(tracked).find((f) => !excluded.has(f));
  if (keep === undefined) {
    refuse("no tracked test file is outside the protected subjects, so self-test C cannot narrow");
  }

  const dir = mkdtempSync(join(tmpdir(), "ncpdp-selection-selftest-"));
  try {
    const cfg = join(dir, "narrowed.config.ts");
    writeFileSync(cfg, `export default { test: { include: ${JSON.stringify([keep])} } };\n`);
    const narrowed = resolvedSelection(cfg);
    if (narrowed.length !== 1 || narrowed[0] !== keep) {
      refuse(
        `self-test C FAILED: the narrowed config resolved to [${narrowed.join(", ")}] rather than ` +
          `[${keep}], so this gate is not observing what it thinks it is observing.`,
      );
    }
    const v = violationsFor(tracked, narrowed, derivedPaths, phiSuites);
    if (v.fuzz.length === 0) {
      refuse(
        "self-test C FAILED: a real narrowing hid the fuzz layer and the fuzz rule was green.",
      );
    }
    if (phiSuites.length > 0 && v.phi.length === 0) {
      refuse("self-test C FAILED: a real narrowing hid the PHI suite and the PHI rule was green.");
    }
    const missed = [...excluded].filter((f) => !v.missing.includes(f) && !v.phi.includes(f));
    const stillUnreported = missed.filter((f) => !v.fuzz.some((line) => line.includes(f)));
    if (stillUnreported.length > 0) {
      refuse(
        "self-test C FAILED: a real, narrowed vitest config dropped these files and no rule " +
          `reported them:\n    ${stillUnreported.join("\n    ")}`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

selfTestComparison();
selfTestInvocationRule();
selfTestNarrowedConfig();

// ---------------------------------------------------------------------------
// REPORT.

if (failures.length > 0) {
  process.stderr.write(
    `\ncheck-test-selection: FAILED (${String(failures.length)} problem(s))\n\n` +
      failures.map((f) => `  - ${f}`).join("\n\n") +
      "\n\n" +
      "  A required job gates its steps, not what those steps select. The suites above are the " +
      "PHI and\n  never-throw floor under this parser, and the coverage gate measures src/ only, " +
      "so dropping them\n  costs no coverage percent at all.\n\n" +
      "  There are two correct fixes, and narrowing this gate is neither. If the file is a TEST, " +
      "widen\n  the selection so it runs. If it is genuinely a HELPER, move it out from under the " +
      "derived path,\n  to test/_helpers/ or anywhere else no workflow names. There is " +
      "deliberately no exemption to\n  qualify for: every module under a derived path runs, and " +
      "the two exemptions this gate used to\n  offer were both walked through by a rename.\n\n" +
      "  KNOW WHAT THAT SECOND FIX COSTS. Outside a derived path and outside the PHI subject, " +
      "the only\n  rule left is the .test./.spec. filename shape, and test/_helpers/ is reached " +
      "by no rule at all.\n  Moving a real TEST there hides it from this gate completely. The " +
      "move is for helpers; if you\n  are moving it to make this message go away, you are doing " +
      "the thing the gate exists to catch.\n",
  );
  process.exit(1);
}

const named = nameShapedTests(tracked);
const extra = selected.filter((f) => !tracked.includes(f));

/**
 * THE DENOMINATOR. Tracked code modules under `test/` that NO rule here looks at: not
 * name-shaped, not under a derived path, not referencing the PHI scanner. The sibling PHI
 * gate learned this the hard way and it is the same lesson: an `OK` printed without the
 * number it is an `OK` over is how a narrowing goes quiet. A rename out of the `.test.` shape
 * moves a file INTO this count, so a reviewer watching it go 3 -> 4 sees the hole being used
 * even though no rule reds. It is deliberately a number and not a failure: `test/_helpers/`
 * legitimately lives here, and a gate that reds on a helper gets disabled.
 */
const unwatched = tracked.filter(
  (f) =>
    f.startsWith("test/") &&
    CODE_FILE.test(f) &&
    !named.includes(f) &&
    !phiSuites.includes(f) &&
    !derivedPaths.some((p) => modulesUnder(tracked, p).includes(f)),
);

process.stdout.write(
  `check-test-selection: OK (${String(named.length)} name-shaped test file(s), all selected by ` +
    `vitest.config.ts; ${String(derivedPaths.length)} workflow-derived test path(s) ` +
    `[${derivedPaths.join(", ")}] intact with every tracked module under them selected; ` +
    `${String(phiSuites.length)} tracked module(s) referencing scripts/phi-scan.ts, all ` +
    `selected; ` +
    `${String(CI_TEST_SCRIPTS.length)} CI test script(s) have an exactly-known-good body; ` +
    `all three self-tests reddened as required. ` +
    `${String(unwatched.length)} tracked module(s) under test/ are watched by NO rule ` +
    `(not name-shaped, no derived path, no PHI reference): ` +
    `${unwatched.length > 0 ? unwatched.join(", ") : "none"}. A suite renamed out of the ` +
    `.test./.spec. shape lands in that count rather than reddening anything` +
    (extra.length > 0 ? `; note ${String(extra.length)} selected file(s) are untracked` : "") +
    `)\n`,
);

#!/usr/bin/env tsx
/**
 * scripts/changeset-bumps.ts: what a changeset in THIS repository is allowed to declare.
 *
 * The rules live here, as pure functions over text and over a directory, so that
 * `test/scripts/changeset-bumps.test.ts` can seed every violation class in a temp directory and
 * require this to catch it. `scripts/check-changeset-bumps.ts` is the thin command around it and
 * takes NO arguments: a checker whose subject can be redirected from the command line is a checker
 * that can be pointed at an empty directory.
 *
 * WHAT THIS GUARDS. Changesets computes the next version from the bump types in `.changeset/`, and
 * nothing else in this repo reads them. That makes those lines the version number: a `major` in
 * any one file takes this package to `1.0.0`, a bump type Changesets does not recognise fails at
 * release time rather than at review time, and a stray package name writes a release note under a
 * package this repository does not own. All three are one word in a file nobody re-reads after it
 * is written, and all three are invisible until the release runs.
 *
 * THREE RULES, AND THE SECOND IS THE ONE WITH TEETH.
 *
 *   1. THE BUMP TYPE MUST BE `patch`. Below 1.0 every release is a patch, a breaking or narrowing
 *      change included, so `minor` is refused HERE rather than in review: moving off the patch
 *      line is a decision made before a changeset is written, and it is made by widening
 *      ALLOWED_BUMPS in a reviewed commit. `major` is refused for the same reason and one more:
 *      this package is released as part of a coordinated batch of `@cosyte/*` libraries, and a
 *      `major` takes it to `1.0.0` and off that number on its own. `none` is refused too: it is a
 *      real Changesets value, and a changeset that bumps nothing is a changelog entry that never
 *      ships.
 *
 *   2. A FILE THIS CANNOT READ IS A FAILURE, NEVER A SKIP. This is the rule that makes the first
 *      one worth anything. A parser that quietly ignores what it cannot understand reports "all
 *      clean" over the file it did not read, and a malformed file is precisely where a wrong bump
 *      hides: Changesets' own reader is forgiving in places this one is not, so a shape this fails
 *      to parse can still be a live changeset with a live bump type in it. Absent frontmatter, an
 *      unterminated block, an empty block and an unparseable line are each reported BY NAME.
 *
 *   3. A BREAK SAYS WHAT A CALLER MUST DO. Because a break ships in a patch, a caret range does not
 *      protect a consumer, and the summary (which becomes the changelog entry) is the only warning
 *      they get. A summary whose first word is `Breaking` or `Narrowing` must therefore carry a
 *      `What to do:` statement with text after it. This reads only the words the author chose: it
 *      cannot tell that an unmarked summary describes a break, so marking one is still the
 *      author's job, and `test/public-surface.json` moving in the same diff is the reviewer's cue.
 *
 * IT MUST NOT TRIP ON WHAT IS NOT A CHANGESET. `.changeset/` also holds `config.json` and
 * `README.md`, and a gate that reds on those gets deleted within the week. The subject is exactly
 * Changesets' own: every `*.md` in the directory except `README.md`. That rule is COPIED FROM THE
 * TOOL rather than invented here, so the set this checks and the set that decides the version stay
 * the same set.
 *
 * ZERO CHANGESETS IS NOT A REFUSAL, AND THAT IS A DELIBERATE DEPARTURE from the sibling rule next
 * door. The PHI scanner and the attw gate both refuse an empty target set, because for them an
 * empty set means the enumerator broke. Here it does not: zero pending changesets is the normal
 * state of this directory in the hours after a release. A MISSING DIRECTORY still refuses, because
 * that one really does mean the mechanism is gone.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** The one package this repository publishes. A changeset naming another is a copy-paste. */
export const OWN_PACKAGE = "@cosyte/ncpdp";

/**
 * The bump types a changeset here may declare.
 *
 * Only `patch`: `minor`, `major` and `none` are deliberately absent; see rule 1 above. Widening
 * this set is a decision about the release ladder, so it is made HERE, in a reviewed commit whose
 * diff says so, rather than by editing one word in a changeset whose diff looks like prose.
 */
export const ALLOWED_BUMPS: ReadonlySet<string> = new Set(["patch"]);

/**
 * A summary whose first word is one of these is marked as a break; see rule 3 above. Markdown in
 * front of the word (emphasis, a code span, a heading, a quote, a list marker, whitespace) does not
 * hide it, because bold is the usual way to mark a break in a changelog.
 */
export const BREAK_PREFIX = /^[\s*_#>`~+-]*(?:breaking|narrowing)(?![a-z0-9])/i;

/**
 * The statement a marked break must carry: the label, then some text, on its line or the next. The
 * colon may sit inside bold (`**What to do:**`).
 */
export const WHAT_TO_DO = /\bwhat to do(?::|[*_`]+:)[\s*_`]*[^\s*_`]/i;

/** The summary with every fenced code block removed: a statement inside one is an example. */
const withoutFences = (text: string): string =>
  text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[`~]*[ \t]*$|(?![\s\S]))/gm, "");

/** Changesets' own subject rule: every `*.md` in the directory except its README. */
export const isChangesetFile = (name: string): boolean =>
  name.endsWith(".md") && name !== "README.md";

/** Raised when the checker could not do its job at all, as distinct from finding a violation. */
export class ChangesetScanRefusal extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ChangesetScanRefusal";
  }
}

/**
 * Every problem in one changeset's frontmatter, each already prefixed with the file name.
 *
 * DELIBERATELY STRICTER THAN THE TOOL, AND IT REPORTS RATHER THAN GUESSES. Where this cannot
 * decide what a line declares it says so against the file instead of moving on, because "I could
 * not read it" and "it is fine" are the two answers that must never look alike here.
 */
export function checkChangesetText(file: string, text: string): string[] {
  const problems: string[] = [];
  const fail = (message: string): void => {
    problems.push(`.changeset/${file}: ${message}`);
  };

  const lines = text.split("\n");
  if (lines[0]?.trimEnd() !== "---") {
    fail(
      `has no frontmatter: the first line is ${JSON.stringify(lines[0] ?? "")} rather than ` +
        `\`---\`. Changesets reads the bump type out of a frontmatter block, so a file without ` +
        `one declares nothing that can be checked. Reported rather than skipped.`,
    );
    return problems;
  }

  const closing = lines.findIndex((line, i) => i > 0 && line.trimEnd() === "---");
  if (closing === -1) {
    fail(
      `has an unterminated frontmatter block: an opening \`---\` with no closing \`---\`. Its ` +
        `bump declaration cannot be read. Reported rather than skipped.`,
    );
    return problems;
  }

  const body = lines.slice(1, closing).filter((line) => line.trim().length > 0);
  if (body.length === 0) {
    fail(
      `has an EMPTY frontmatter block, so it names no package and declares no bump type. ` +
        `Reported rather than skipped: an absent declaration is not a \`patch\` by default.`,
    );
    return problems;
  }

  for (const line of body) {
    // `"@scope/name": bump`, quotes optional, which is the shape Changesets writes and the shape a
    // hand-edited file takes. Anything else is reported, never assumed.
    const match = /^\s*(?:"([^"]*)"|'([^']*)'|([^:'"\s][^:]*?))\s*:\s*(.+?)\s*$/.exec(line);
    if (match === null) {
      fail(
        `has a frontmatter line that cannot be parsed: ${JSON.stringify(line)}. Expected ` +
          `\`"<package>": <bump>\`. Reported rather than skipped, because an unparseable line ` +
          `can still be a live bump declaration.`,
      );
      continue;
    }
    const pkg = match[1] ?? match[2] ?? match[3] ?? "";
    const bump = match[4] ?? "";

    if (pkg !== OWN_PACKAGE) {
      fail(
        `names package ${JSON.stringify(pkg)}, but this repository publishes ${OWN_PACKAGE} and ` +
          `nothing else. A changeset naming another package writes a release note under a name ` +
          `this repository does not own.`,
      );
    }
    if (!ALLOWED_BUMPS.has(bump)) {
      fail(
        `declares bump type ${JSON.stringify(bump)}. Allowed here: ` +
          `${[...ALLOWED_BUMPS].map((b) => `\`${b}\``).join(", ")}. ` +
          (bump === "major"
            ? `A \`major\` takes this package to 1.0.0 and off the version every other repository ` +
              `in the coordinated release is publishing. A change that earns one is a decision ` +
              `about the batch: raise it as a break candidate, do not bump it here.`
            : `Below 1.0 every release is a patch, a breaking or narrowing change included: ` +
              `declare \`patch\` and say in the summary what changed. See .changeset/README.md.`),
      );
    }
  }

  const summary = lines
    .slice(closing + 1)
    .join("\n")
    .trim();
  if (BREAK_PREFIX.test(summary) && !WHAT_TO_DO.test(withoutFences(summary))) {
    fail(
      `is marked as a break (its summary starts with ` +
        `${JSON.stringify(summary.split(/\s/, 1)[0] ?? "")}) but has no \`What to do:\` statement ` +
        `with text after it. A break ships in a patch here, so a caret range does not protect a ` +
        `consumer and this entry is their only warning: say what a caller must do.`,
    );
  }

  return problems;
}

/** What one scan of a changeset directory found. */
export interface ChangesetScan {
  /** Every entry in the directory, changeset or not. The denominator the report is an OK over. */
  readonly entries: readonly string[];
  /** The subset this checked. */
  readonly checked: readonly string[];
  /** Every problem across every checked file. */
  readonly problems: readonly string[];
}

/**
 * Scan one changeset directory. Throws {@link ChangesetScanRefusal} when it cannot enumerate at
 * all, which is a different outcome from finding nothing wrong and is reported differently.
 */
export function scanChangesetDir(dir: string): ChangesetScan {
  let entries: string[];
  try {
    if (!statSync(dir).isDirectory()) {
      throw new ChangesetScanRefusal(
        `${dir} is not a directory, so there is nothing to enumerate.`,
      );
    }
    entries = readdirSync(dir).sort();
  } catch (err) {
    if (err instanceof ChangesetScanRefusal) throw err;
    throw new ChangesetScanRefusal(
      `cannot enumerate ${dir}: ${err instanceof Error ? err.message : String(err)}\n` +
        `  Changesets computes the version from that directory. If it is genuinely gone, the ` +
        `release mechanism is gone with it; that is not a passing check.`,
    );
  }

  const checked = entries.filter(isChangesetFile);
  const problems: string[] = [];
  for (const file of checked) {
    let text: string;
    try {
      text = readFileSync(join(dir, file), "utf8");
    } catch (err) {
      problems.push(
        `.changeset/${file}: cannot be read ` +
          `(${err instanceof Error ? err.message : String(err)}), so its bump declaration is ` +
          `unknown. An unreadable changeset is a failure, not a skip.`,
      );
      continue;
    }
    problems.push(...checkChangesetText(file, text));
  }

  return { entries, checked, problems };
}

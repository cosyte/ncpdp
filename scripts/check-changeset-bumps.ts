#!/usr/bin/env tsx
/**
 * scripts/check-changeset-bumps.ts: the command around `scripts/changeset-bumps.ts`.
 *
 * The rules, and the reasons for them, are in that file. This one only decides the subject, the
 * exit code and the wording, and it TAKES NO ARGUMENTS ON PURPOSE: a checker whose subject can be
 * redirected from the command line is a checker that can be pointed at an empty directory and
 * asked to report OK. The subject is this repository's own `.changeset/`, and nothing else.
 *
 * Run it with `pnpm check:changeset-bumps`, also reached by `pnpm check`.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ALLOWED_BUMPS, OWN_PACKAGE, scanChangesetDir } from "./changeset-bumps.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let scan;
try {
  scan = scanChangesetDir(join(ROOT, ".changeset"));
} catch (err) {
  // A refusal is not a failure. A failure means a changeset is wrong; a refusal means this script
  // could not do its job, and reporting either an OK or a tidy list of violations from a scan that
  // did not complete is the worst of the three outcomes.
  process.stderr.write(
    `check-changeset-bumps: REFUSING TO REPORT\n  ` +
      `${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
}

if (scan.problems.length > 0) {
  process.stderr.write(
    `\ncheck-changeset-bumps: FAILED (${String(scan.problems.length)} problem(s) across ` +
      `${String(scan.checked.length)} changeset file(s))\n\n` +
      scan.problems.map((p) => `  - ${p}`).join("\n\n") +
      `\n\n  These lines ARE the next version number: Changesets computes it from them and ` +
      `nothing else\n  in this repo reads them. See .changeset/README.md for the rule this ` +
      `repository applies, and\n  scripts/changeset-bumps.ts for why an unreadable file is ` +
      `reported here rather than skipped.\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `check-changeset-bumps: OK (${String(scan.checked.length)} changeset file(s) checked, of ` +
    `${String(scan.entries.length)} entr(y/ies) in .changeset/; every declaration names ` +
    `${OWN_PACKAGE} and bumps ${[...ALLOWED_BUMPS].join(" or ")}` +
    (scan.checked.length === 0
      ? "; note ZERO changesets are pending, which is the normal state just after a release"
      : "") +
    `)\n`,
);

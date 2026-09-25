Relocated out of `CLAUDE.md` so the cursor fits its byte budget. The section below is the text
that used to sit there, unchanged and under its original heading, and `CLAUDE.md` links here at
the point it left. Relocation, not deletion.

A backticked bare anchor below (`#like-this`) points into `documentation/agent-notes.md`, the same
convention `CLAUDE.md` writes. `pnpm check:agent-notes` reads the bare form in the cursor and the
narrative file only, so the pointers below are a reader's convention here rather than a gated one;
the path-qualified form is the one that is checked everywhere.

## Required checks on `main`

Three branch rulesets protect `main`; only `ci-required-checks` (repository-level, id `19841505`) is
editable from here. Its contexts today: `ci / verify (22, ubuntu-latest)`, `ci / verify (24,
ubuntu-latest)`, `ci / actionlint`, `codeql / analyze (javascript-typescript)`, `release-dry-run`,
`no-emdash`, `no-internal-refs`, `test-selection`. Background:
`#required-checks-on-main`.

- **Read the live set back from the API rather than trusting that list**
  (`gh api repos/cosyte/ncpdp/rulesets/19841505`); **the only evidence is the API; a green suite is
  no evidence.** **Add a required context only AFTER the workflow has completed on `main`.** **One
  repository ruleset, extended in place, is the whole convention**, **pin every context to the
  GitHub Actions app (`integration_id: 15368`)**, and **never rename a job without renaming the
  required context in the same change.** **Never narrow `include` in `vitest.config.ts`.** **Never
  require `fuzz`, `scorecard` or `release`.** **Nothing in this repository observes its own
  ruleset**, and that is **a GAP, not a law**. Relocated 2026-09-06: `#the-required-checks-traps`.

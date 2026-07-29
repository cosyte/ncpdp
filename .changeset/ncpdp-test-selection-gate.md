---
"@cosyte/ncpdp": patch
---

No change to the published package. This is a repository test-selection gate, released only so the
history records it against a version.

The CI job that runs this package's test suite gated its own steps, but nothing gated what those
steps selected. A single `include` glob in `vitest.config.ts` was the sole selector for every test in
the repo, and the shared test configuration supplies no `include` of its own, so narrowing that one
line to the unit-test directories would have stopped running the PHI-scanner suite and the entire
property-based fuzz layer with every check still reporting green. Coverage could not backstop it,
because coverage is measured over `src/` only, so dropping those suites costs close to zero coverage
percent.

`pnpm check:test-selection`, and a CI check under it, now compares the test files that exist against
the test files vitest would actually run and fails on any shortfall in its subject. That subject is
not every test file: only the workflow-derived fuzz path and the PHI suite are watched by a
name-independent rule, and everything else is watched by the `.test.`/`.spec.` filename shape alone,
so renaming a suite out of that shape is invisible. The gate prints how many test modules no rule is
watching so the gap has a number rather than being discovered later. It asks vitest for its resolved
selection rather than reading the globs, so an `exclude` and a projects split written into the config
are caught alongside a narrowed `include`. Because that resolution cannot see the command line, it
separately requires the two test scripts CI invokes to equal one of two exact bodies, so a path
filter, an alternate config, a project filter, a shard, a wrapper and a delegation to another script
are all simply not one of those bodies. Its subjects are derived from files that exist for their own
reasons rather than from a list inside the gate, and under a derived path the subject is every module
whatever it is named, with no exemption of any kind: under such a path, renaming a suite out of the
conventional test suffix does not remove it, and a helper may not live there. The repo's one such helper moved to
`test/_helpers/fuzz-config.ts`.

The gate re-proves itself on every run rather than asserting it works: three self-tests seed the
removals it exists to catch, one of them resolving a genuinely narrowed vitest config through real
vitest, and it exits non-zero if its own rules fail to red.

These routes are closed, which is not the claim that the selection is uncollapsible. The gate does
not see which script the shared pipeline chooses to invoke, since that lives in another repository,
nor package scripts other than the two CI runs, nor anything a workflow runs inline, nor a config
body that branches on its own invocation, since the gate resolves under `vitest list` while CI runs
`vitest run`, nor a suite renamed out of the `.test.`/`.spec.` shape anywhere a derived rule does not
reach. Selection is also necessary rather than sufficient: a selected test that asserts
nothing useful is still a review problem and a coverage problem.

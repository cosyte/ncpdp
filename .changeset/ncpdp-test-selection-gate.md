---
"@cosyte/ncpdp": patch
---

No change to the published package. This is a repository safety-gate addition, released only so the
history records it against a version.

The required CI job that runs this package's test suite gated its own steps, but nothing gated what
those steps selected. A single `include` glob in `vitest.config.ts` was the sole selector for every
test in the repo, and the shared test configuration supplies no `include` of its own, so narrowing
that one line to the unit-test directories would have stopped running the PHI-scanner suite and the
entire property-based fuzz layer with every required check still reporting green. The coverage gate
could not backstop it, because coverage is measured over `src/` only, so dropping those suites costs
close to zero coverage percent.

A new gate (`pnpm check:test-selection`, and a required CI check under it) compares the test files
that exist against the test files vitest would actually run, and fails on any shortfall. It asks
vitest for its resolved selection rather than reading the globs, so an `exclude` and a projects
split written into the config are caught alongside a narrowed `include`; and because that resolution
cannot see the command line, it separately requires the two test scripts CI invokes to have one of
two exact bodies, so a path filter, an alternate config, a project filter, a shard, a wrapper and a
delegation to another script are all simply not one of those bodies. Its subjects are derived from
files that exist for their own reasons rather than from a list inside the gate, and under a derived
path the subject is every module whatever it is named, exempting only what a running test actually
imports, so renaming a suite out of the conventional test suffix does not remove it.

Internal detail, for the record and not for the release note: this is the ncpdp instance of
CI-REQUIRED-CHECKS, the vitest include-glob hollow-out, built 2026-07-29 on top of the ruleset work
in #36 and the PHI-scanner fix in #38. The same defect exists in `deid` and `synth`, whose configs
are the same five lines; the shape ports, the derived subjects have to be re-derived per repo.

The design constraint that drove the implementation is that a gate must observe its own subject, so
adding a second glob would have been the same defect with more lines. The gate therefore re-proves
itself on every run: three self-tests seed the removals it exists to catch, one of them resolving a
genuinely narrowed vitest config through real vitest, and it exits non-zero if its own rules fail to
red. The demonstration is executed rather than argued, in CI, every time. Confirmed red by seeding,
one at a time: a narrowed `include`; an added `exclude` for the property layer; deleting the property
directory outright; positional path filters written both as `vitest run <path>` and
`vitest --run <path>`; `--config=`, `--project=`, `--dir=` and `--shard=`; a script body that never
names vitest at all, whether a delegation to another package script, a direct `node` invocation of
the vitest entry point, or a shell wrapper; renaming a fuzz suite to `.spec.ts` and to a helper-shaped
`_xxe.ts`, and the PHI suite to `.checks.ts`; flipping the PHI scanner off in the CI caller; and
deleting the PHI suite while leaving its script in place. Removing every workflow mention of the
fuzz path makes the gate refuse to report at all rather than pass vacuously.

The `conformance-refuter` gate refuted two successive attempts at this slice, and this is the third.
Every blocking finding landed in the same half: the one that checks the
invocation rather than the config. Keying on the literal string `vitest run` let `vitest --run
<path>` past. Looking only for bare tokens made `--config=`, `--project=`, `--dir=` and `--shard=`
invisible. Tokenising the arguments after a whole-word `vitest` then failed closed on arguments but
open on the invocation, so a body containing no `vitest` token at all, such as a delegation to
another package script, produced no arguments and was reported as passing. Analysing a shell string
is an unbounded problem and each round of hardening bought one more spelling, so that rule was
replaced with an exact match against two known-good bodies, which has no spelling to miss. The
refuter also found that defining the subject as `*.test.ts` was an allow-list of filename shapes,
that exempting helpers on a name prefix alone let a suite be renamed into a helper, that the PHI
rule as first written would have reddened on a comment, and that the self-tests covered only the
rules that were already sound. Every one of these is now a permanent self-test sample or a seeded
demonstration.

The claim is that these routes are closed, not that the selection is uncollapsible. What the gate
does not reach is stated in its header: it does not see which script the shared pipeline chooses to
invoke, since that lives in another repository, nor package scripts other than the two CI runs, nor
anything a workflow runs inline; and selection is necessary but not sufficient, so a selected test
that asserts nothing useful remains the refuter's problem and coverage's.

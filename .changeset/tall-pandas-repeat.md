---
"@cosyte/ncpdp": patch
---

Internal CI and repo tooling only. No change to the published package surface: no API, type, warning
code or parse-result change.

The `test-selection` gate is now genuinely a required check on `main`, and the workflow has stopped
claiming it already was. `.github/workflows/test-selection.yml` asserted in prose that repository
ruleset `19841505` required the `test-selection` context. Measured against the API on 2026-08-03 and
again on 2026-08-04 immediately before the change, the required set held seven contexts and that was
not one of them. So the gate went green on every pull request it ran on, and blocked no merge on any
of them. By the workflow's own words, a check that cannot fail is documentation; a green check that
cannot block a merge is the same thing wearing a tick, and it is worse, because the file said
otherwise.

Fixed in the required order. A context is added to a ruleset only after its workflow has completed on
`main`, never before, because requiring a context nothing has emitted leaves every pull request
pending and unmergeable rather than red. This workflow had completed on `main` on the `push` trigger,
repeatedly and successfully, so the context was added to the existing `ci-required-checks` ruleset in
place, pinned to the GitHub Actions app (`integration_id: 15368`), and read back from the API rather
than from the payload. Scoped to `cosyte/ncpdp` alone, confirmed by a negative control: the same
assertion run against `hl7`, `x12`, `ccda` and `mllp` fails on all four.

The price was measured rather than assumed, and it was zero. Requiring a new context blocks any open
pull request whose branch predates the workflow, because that branch carries no such check run.
Exactly one open dependabot pull request here was in that state, and it was already blocked: its head
sha carries four check runs and was already missing three contexts required before this change
(`codeql / analyze (javascript-typescript)`, `no-emdash`, `no-internal-refs`). Nothing was newly
blocked. A rebase clears it either way, and a bypass actor is never the answer.

Nothing in this repository currently observes its own ruleset, and that is a gap rather than a law.
The workflow comment now carries the `gh api` command instead of a claim, and records what the first
draft of this change got wrong: it said nothing inside the repository could observe the ruleset, and
that is false. `cosyte/ncpdp` is public and the rulesets endpoint answers an unauthenticated request,
measured 2026-08-04 returning HTTP 200 with the whole `required_status_checks` array under the
anonymous `x-ratelimit-limit: 60`. A CI step could assert its own context is still required, with no
secret and no extra permission. That step is deliberately not built yet and the reasons are recorded
rather than the possibility denied: the anonymous quota is 60 per hour per IP and GitHub-hosted
runners share egress addresses, so its flakiness needs answering before it may block a merge, and
whether the Actions `GITHUB_TOKEN` is accepted for that endpoint is unverified.

Three further corrections to `scripts/check-test-selection.ts`, all documentation, none of them a
change to what the gate enforces. `trackedFiles()` is recorded as reviewed by a person rather than by
the gate: it is the one enumeration every other rule derives from, no self-test seeds it, and a
filter added inside it would drop those files from the name rule, from `modulesUnder` and from the
PHI rule at once while leaving them selected by vitest and passing all three self-tests, measured
with a `test/telecom/` filter patched in (exit 0, all three self-tests green, with one counter still
moving: the OK line's trailing untracked note appeared and read 8, so it is a blind spot rather than
a silent one). The config-branches-on-its-own-invocation hole is now measured rather than described,
so a port cannot re-assert that asking vitest for its resolved selection catches it: on `47d87d4` an
`include` reading `process.argv` served the gate all 26 resolved files at exit 0 with `OK` printed,
while the branch CI takes resolved to 7, so nineteen suites stop running with the gate and every
required check green. And the stale present-tense totals in the subject description are corrected:
the header read "4 of this repo's 24 test files" and "20 of 24" long after the total reached 26, and
the OK line is now named as the place to read them, but not the four-file figure or its complement.
Two further `of 24` figures survive on purpose, in the
account of the defect that produced them, relabelled as a record of that measurement rather than a
claim about the tree today.

Two known holes stay open and are deliberately deferred rather than half-closed, each because it
needs a decision this change is not the place to make. The `.test.`/`.spec.` rename hole is closed
only by deriving more subjects from workflows, since widening the name pattern and hand-listing
"files that are really tests" are both refused by the gate's own design rules, and today only the
fuzz workflow names a test path. The strip-and-plant residual on the PHI subject is closed only by
keying on an import specifier, which does not apply while that suite spawns the scanner as a
subprocess instead of importing it.

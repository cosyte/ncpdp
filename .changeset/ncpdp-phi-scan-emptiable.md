---
"@cosyte/ncpdp": patch
---

No change to the published package. This is a repository safety-gate fix, released only so the
history records it against a version.

The PHI scanner that guards this repo's fixtures (`pnpm phi-scan`, a development gate, not shipped
code) could be reduced to scanning no files at all while reporting success. `--allow-fixture <path>`
supplied without a positional path seeded the scan target set with that one path and then subtracted
it, leaving an empty scan that printed `OK: no hits` and exited 0. Its scan roots also stopped at
`test/fixtures/`, so every test outside that directory was invisible to it, including the ones that
build NCPDP messages as inline string literals. Separately, its staged-file enumeration did not match
renames or typechanges, so a fixture moved and edited to add PHI in one commit, or a symlink replaced
by a real file carrying PHI, was never opened by the pre-commit check.

`--allow-fixture` is now purely subtractive, an override matching no scanned file is refused, an
emptied target set is refused, staged files are enumerated with renames decomposed, and every report
line carries the number of files scanned. The roots now cover `src/`, `test/` and `scripts/` from a
single list shared by both the full and the staged scan.

Internal detail, for the record and not for the release note: this is PHI-SCAN-EMPTIABLE, found by
the CI-REQUIRED-CHECKS worker on 2026-07-28. The repository's own test asserted the defect was
impossible ("the override, not an empty target set, is what flips the next run to clean") while
exercising a path in an OS temp directory that a full scan never enumerated, so it passed for the
reason it denied. That assertion is deleted; the replacement seeds real violators under a scan root
and asserts that a second, non-overridden violator is still caught. Every new test was confirmed red
against a re-seeded version of the defect it covers; the file went from 34 tests to 44. The only
thing making the collapse unreachable in
practice was that `phi-scan-overrides.md` had no entries, which is one commit from permissive. The
widened scan (85 files to 118) surfaced one hit to triage, a literal non-test email address inside
the scanner's own test file, now assembled from parts the way the digit sentinels in that file
already were.

The `conformance-refuter` gate refuted the first attempt and this is the corrected slice, cleared on
its second pass. It found the `--diff-filter=AM` rename blind spot in `--staged`, a third collapse
route, fixed with `--no-renames` plus the first tests staged mode has ever had; then found the same
shape again in typechange (`T`), which identified the real defect as the filter's polarity, an
allow-list of git status letters where every unnamed letter is dropped silently, now
`--diff-filter=d`. It also found that the in-repo test seeding
raced the module-scope `readdirSync` in `test/script/serialize.test.ts` and could have hard-reddened
a required check, now seeded in directories nothing enumerates; that the "40 files" figure was never
measured (the base roots scanned 85); and that the slice had replaced one false absolute with
another, so "the gate cannot be collapsed" is now stated as "these routes are closed", with the
symlink and one-file-scan enumeration gaps written down in `phi-scan-overrides.md` instead. Verified
while fixing: `cosyte/.github`'s reusable CI runs bare `pnpm phi-scan`, not `--staged`, so CI was
never on the blind-spot path. The same shapes were recorded in `synth`; the fix is written to be
copied there rather than re-derived.

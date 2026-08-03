---
"@cosyte/ncpdp": patch
---

Test-only: the sanity suite now pins the exported `VERSION` to `package.json`, so a release that
skipped `scripts/sync-version.mjs` goes red instead of publishing a constant that lies.

`changeset version` rewrites `package.json` alone. The `version` script runs
`scripts/sync-version.mjs` immediately after it, which is what keeps the exported `VERSION` constant
and the released version in the same commit. That wiring is correct here and was verified against the
registry: `@cosyte/ncpdp@0.0.8` ships `VERSION = "0.0.8"` in both `dist/index.mjs` and
`dist/index.cjs`. What was missing was the guard on the guard. `test/sanity.test.ts` asserted only
that `VERSION` was a non-empty, semver-shaped string, so removing, reordering or silently failing the
sync step would have published a wrong constant with the suite still green.

That is not hypothetical. A sibling `@cosyte` package with the same sync script but without this
assertion shipped `VERSION = "0.0.0"` on three consecutive releases (`0.0.2`, `0.0.3` and `0.0.4`),
each verified by unpacking the published tarball, while an assertion pair identical to this repo's
stayed green throughout.

`expect(VERSION).toBe(manifestVersion(pkg))` compares against the manifest, never a hardcoded
literal, so a version bump still needs no edit here. `manifestVersion` narrows the parsed
`package.json` from `unknown` without an `as` cast, so the sanity test cannot lie about its own
input. The release flow opens a version bump as a pull request and CI runs on pull requests, so this
assertion reds at the moment the drift would be introduced.

Demonstrated red in both directions before landing: with the constant set back to `"0.0.0"` against a
`0.0.8` manifest (`expected '0.0.0' to be '0.0.8'`), and with the manifest bumped to `0.0.9` and the
sync step skipped (`expected '0.0.8' to be '0.0.9'`). In both runs the two pre-existing shape-only
assertions, which were the entire content of the old test, passed. That is the measurement that
justifies the slice.

Also removes a stale comment claiming `VERSION` is `"0.0.0"` "at this stage". It was false at
`0.0.8`, and it is what made the weak assertion read as deliberate.

The assertion answers exactly one question: does the exported constant equal the version being
released? It deliberately does not also assert that the sync script is still named in the `version`
script. That is a second question, and one predicate serving two is how a gate goes half-blind. No
published API, type, warning code or parse-result change.

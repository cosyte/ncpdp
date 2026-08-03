---
"@cosyte/ncpdp": patch
---

ATTW-FALSE-GREEN-PORT: the `attw` publish gate exited 0 on an untyped pack, so a build that produced
no type declarations passed it. `attw --pack .` prints "This package does not contain types." and
exits 0, because `getExitCode.js` in `@arethetypeswrong/cli@0.18.4` opens with
`if (!analysis.types) return 0` and returns before the problem list is read. For a package that
ships types that means the declarations were not in the tarball, which is a broken publish reported
as a pass. A false red costs an hour; a false green merges.

`"attw"` now runs `node scripts/attw.mjs`, a wrapper with two nets: a preflight that every relative
artifact path the manifest promises (`main`, `module`, `types`, `typings`, every string leaf of
`exports`, and every string leaf of `typesVersions`) exists and is non-empty, naming the missing
file; and a post-check that promotes attw's untyped sentence to a failure. Ported from
`terminology#28`. `scripts/verify.sh` was not touched and no lock, lease or build queue was added.

Reproduced with zero concurrency, on this package's own numbers: deleting all 20 declaration files,
and `rm -rf dist`, each exit 0 on the old invocation and 1 on the new one. The trigger is `tsup`
emitting JS before declarations, measured at a 4448 ms window per build (first JS 3407 ms, first
declaration 7855 ms).

`analysis.types` is a fact about the whole tarball rather than about entrypoints: it is
`pkg.containsTypes()`, any file with a TS extension, computed before any entrypoint is resolved. A
clean build here emits 20 declaration files, 10 entry and 10 shared-chunk, all packed. So a partial
loss of declarations is already a true red, and so is a total loss of the entry declarations while
the shared chunks survive. The preflight reds all of these and names the missing file, but claims
nothing about what attw would have done, because from the manifest alone it cannot know.

Repo tooling only: no published API, type, warning code or parse result changes.

---
"@cosyte/ncpdp": patch
---

PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES: a symbolic link under a scan root read clean on BOTH of the
PHI gate's enumerating routes, so a link pointing at a PHI-bearing file passed the gate twice over.
Repo tooling only: no published API, type, warning code or parse result changes.

Two unrelated mechanisms produced the same silence. `walk()` enumerates `Dirent.isFile()`, which is
an lstat answer, so a link is neither a file nor a directory and fell out of the loop with no branch
of its own; `isDirectory()` is false for a linked DIRECTORY too, so a whole subtree disappeared the
same way. And `git show :<path>` is how `--staged` reads content, while git stores a symbolic link
as its target path under mode `120000`, so that route (this repo's pre-commit hook) was handed the
path text and never the target's bytes.

Measured on `6c901e8` with a synthetic name-bearing SCRIPT payload written outside the scan roots
and a link to it under `test/fixtures/script/`: all mode printed `OK: no hits (2 file(s) scanned)`
and exited 0, `--staged` printed `OK: no hits (1 file(s) scanned)` and exited 0 after `git add`, and
naming the link explicitly exited 1 with both name hits. The payload was always detectable; the two
enumerating routes never looked at it.

Neither route is made to follow the link. Following would read bytes the enumeration does not
control (outside the repo, a loop, a device, a FIFO that blocks the gate forever), and git does not
carry those bytes anyway, so a hit on them would be a claim about something no commit contains. The
enumeration is narrowed instead: an in-scope entry that is not a regular file refuses the scan
(exit 2), naming every offender rather than the first. `--staged` now reads
`git diff --cached --raw -z` so the destination mode is visible, refuses anything that is not
`100644`/`100755`, and refuses an unparseable `--raw` record rather than scanning a list that may be
short.

A refusal names the entry's own repo-relative path and a token from a closed engine-owned set. It
never reports the link target, which is working-tree text that can itself carry PHI; a diagnostic
about a PHI leak is itself a PHI surface. "In scope" is each route's existing boundary rather than a
new one: the walk still exempts a gitignored entry, and `--staged` still filters through the same
in-scope predicate the walk uses.

Ported from `terminology#37`, with both of its stated conclusions re-measured rather than copied.
That sibling had to admit status `T` to a `--diff-filter=AM` allow-list to make its mode check
reachable; this repo's filter was already `--diff-filter=d`, and on git 2.39.5 replacing a tracked
regular file with a link emits `:100644 120000 <sha> <sha> T` under `d` and nothing at all under
`AM`, so nothing needed adding here. Its other disclosed residual does not transfer either: `R`/`C`
go unenumerated by its `--staged`, whereas `--no-renames` here decomposes a rename into `D` + `A`
and the destination is scanned.

Deliberately not covered: explicit-paths mode still reads through a link, because `statSync` and
`readFileSync` both follow and a human naming one path is asking for that file; a gitlink is refused
only where the in-scope predicate reaches it; and the walk's own `existsSync` then `readdirSync`
race still exits 1, which is a separate pre-existing defect logged in `phi-scan-overrides.md`.

13 cases pin this, 9 of them measured red on `6c901e8`. The 4 that stay green are the ones that
should: the gitignore exemption, a corpus of ordinary regular files, a staged regular file still
being scanned and caught, and a control on which package's scanner the suite is exercising. The
payload behind every link is name-bearing, and one case names the link explicitly first to prove the
bytes on the other side are exactly what the gate catches, so no case can pass for want of a
detectable fixture.

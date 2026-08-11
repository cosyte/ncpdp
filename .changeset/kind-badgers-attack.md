---
"@cosyte/ncpdp": patch
---

PHI gate: an all-mode sweep now reads the bytes git carries as a union with the working-tree walk, so
a payload the index holds at a path the sweep opened can no longer pass as clean. Internal repo
tooling only: no published API, type, warning code or parse-result change.

Every rule the gate already had reconciles PATH SETS. The previous slice proves that each tracked
in-scope path was OPENED; the walk then reads the WORKING TREE, and the working tree is not the
committed corpus, so a path set cannot see what is at the path. Measured in a clone at `2cade73`,
with the root check, the reconciliation and the observed-nothing floor all in place and passing: a
synthetic name-and-date-of-birth payload placed in the index at a tracked in-scope path, with the
working copy left clean, printed `OK: no hits (125 file(s) scanned)` and exited 0. The healthy
control on the same clone printed the same 125, which is the whole difficulty: unlike the
emptied-root shape this is not even a smaller number. Every tracked path was opened. The sweep opened
the wrong copy.

Deduplication is by CONTENT, not by path, keyed on git's own object name over the bytes the walk
already read. A clean checkout therefore matches every index entry locally and never invokes
`cat-file` at all, and where the two copies differ both are scanned, which is what makes the sweep
correct under a line-ending attribute or any clean/smudge filter. A path-keyed deduplication would
silently drop one of the two with the report unchanged.

The unmerged case is keyed on the ABSENCE of stage 0. `git ls-files -s` reports a conflicted path
three times, at stages 1, 2 and 3, each with an ordinary blob mode, so a route that took the first
record would scan the merge base and label it as what git carries: a confident wrong answer rather
than an error. All three stages are covered, one case per stage. The pre-commit route already refuses
an unmerged path from its own status and mode check, and this change does not re-close that; a test
pins that the two routes go on disagreeing.

Every report line now carries both numbers, so an `OK` is never read without the file denominator and
the count of additional blobs read. A hit in a carried blob exits 1, the same as a working-tree hit,
because a commit does contain those bytes; a git that cannot answer exits 2, fail closed. A positive
control runs the real sweep over this repository's own tracked corpus and proves the route fires on
it, without mutating the index, the object database or the working tree.

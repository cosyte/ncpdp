---
"@cosyte/ncpdp": patch
---

PHI gate: reconcile what an all-mode sweep OPENED against `git ls-files`, closing the emptied-root
half of `PHI-SCAN-OBSERVED-NOTHING-IS-GLOBAL`. Internal repo tooling only: no published API, type,
warning code or parse-result change.

The root check shipped previously certifies that each declared scan root EXISTS and is ENUMERABLE. It
never certified that anything was OBSERVED under one, and no version of it could: an empty directory
enumerates perfectly. Measured in a clone at `16c2fea` with that check in place, emptying `src/` (51
tracked files, the directory left in place) printed `OK: no hits (71 file(s) scanned)` and exited 0;
deleting `src/telecom/` alone printed `OK: no hits (105 file(s) scanned)` exit 0 with 17 unopened;
the healthy control printed 122.

A denominator cannot detect either shape, which is the second time that has had to be recorded here:
71 next to a healthy 122 is not a number anything about the report makes look wrong, because a count
counts the files that WERE found. The sweep now refuses (exit 2) naming every tracked in-scope file
it did not open. The expected set comes from the index, never from the walk, because anything
re-derived from the walk would agree with the walk forever.

Fails closed when git cannot say what is tracked (pre-fix that case printed `OK: no hits` and
exited 0; no denominator is quoted, because with `.git` gone `git check-ignore` cannot answer either
and the count moves with whatever ignored files happen to be on disk). `--staged` and paths mode are deliberately not reconciled, since
neither claims to have covered the tree. Exit codes were derived in this repo rather than ported from
a sibling.

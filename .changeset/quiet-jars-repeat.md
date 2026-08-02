---
"@cosyte/ncpdp": patch
---

The repository PHI commit-gate no longer aborts a whole sweep because a file disappeared while it was
working. No published API, type, warning code or parse result changes.

The gate lists every directory it covers, then reads each file. A file written and deleted inside
that window made the read fail and the scanner refuse the entire scan. It is not hypothetical here:
the gate covers the repository's own scripts directory, and this repository's own test suite writes
throwaway files there and removes them again, so a scan running alongside the suite can list a file
that is gone by the time it is read.

**The refusal was correct; the listing was unsound.** Refusing a scan it could not complete is the
property that makes the gate worth having, and it is untouched. Exactly one case is now tolerated: a
file the scan listed itself, that git does not track, that is missing when it is read. It is reported
on stderr as skipped and subtracted from the printed file count, so an `OK` is never read against a
number that includes a file nothing was read from.

Everything else still refuses:

- a tracked file that cannot be read, because the committed corpus is what the gate promises to have
  observed;
- any failure that is not a missing file, since a permission or wrong-type error is a scan that
  failed rather than a file that went away;
- a tolerated file that is back on disk when the sweep ends;
- a git that cannot report what is tracked, and an empty answer, which would make every file look
  untracked;
- a full sweep that ended up reading nothing at all.

Reachability was measured rather than argued. Against the previous scanner, deleting a listed,
untracked file inside that window reproduces the refusal every time, while deleting a file outside
the scanned directories does not. What was not observed is the unassisted race: none of 459 scans run
against a live test suite hit it, because the window measures tens of milliseconds against a
transient that lives around half a second. So this is a real defect on a real file, caught before it
cost anything here.

Eight tests were added. Two of them fail against the previous scanner; the other six pass there
already and are regression pins rather than evidence, which is stated here because the distinction is
easy to overclaim. They reach the window with no sleep and no build: the scanner runs git between
listing and reading, so a git stand-in first on the path is a deterministic hook into exactly that
gap, and every case runs in a throwaway repository so no decoy file is ever written into this one.

Known gaps are written down rather than claimed closed, and the list is not published as complete.
The re-check is keyed on the path that was listed, not on content, so an untracked file renamed
inside the window goes unread; committing such a file means adding it to git, after which it is
tracked and no longer tolerated. The check that catches a tolerated file reappearing has no test,
because reaching it needs a timed re-create against a deliberately slowed sweep, and a
timing-sensitive test guarding a timing-dependent defect is the mistake that defect teaches; an
earlier draft of this note called that check low-stakes, which review disproved by measurement, so
it is recorded as load-bearing instead. The directory walk one step earlier has the same shape and
still exits with the code reserved for "findings", which is unchanged here and fails closed.

The pre-commit path is unchanged: it reads file contents out of the git index, so it never depended
on any of this.

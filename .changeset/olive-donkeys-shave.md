---
"@cosyte/ncpdp": patch
---

Internal repo tooling only, in the `phi-scan` commit gate. No change to the published package
surface: no API, type, warning code or parse-result change.

A declared scan root that the gate could not enumerate was skipped in silence. `scripts/phi-scan.ts`
names three roots and walked each behind `existsSync`, so if one of them was missing the walk simply
returned, the remaining roots supplied a corpus, and the sweep printed a clean report over a
directory it never opened. Measured on `5e2b42b` with `src/` (51 tracked files) moved aside: the
scan printed `OK: no hits (71 file(s) scanned)` and exited 0, against 122 files on a healthy tree.

The denominator did not save it, and that is the part worth writing down. Every report line has
carried a file count since the argument-driven collapse routes were closed, and one was printed
here: 71 is not a number anything about the report makes look wrong, because a count is a count of
the roots that did exist and can never witness one that did not. Checking the roots is a different
rule and had to be written separately.

The dangling-link case is the sharpest, and it is why the check is now `lstatSync` rather than
`existsSync`. With the same root replaced by a symbolic link to a path that does not exist the
output was byte-identical, `OK: no hits (71 file(s) scanned)` and exit 0, because `existsSync`
follows a link and answers false, so the walk returned before `readdirSync` ever ran and the
existing non-regular-entry refusal never fired. That refusal classifies entries found inside a root,
and a root is not inside itself. The two refusals now read the filesystem through different calls
and keep separate closed-set kind vocabularies, and neither ever prints a link target, since a
diagnostic about a leak is itself a disclosure surface.

A root is a declaration and a subdirectory found inside one is a discovery, which is the whole shape
of the fix. A false declaration refuses with exit 2, naming the root and a closed-set kind token,
while a subdirectory that vanishes between its parent's listing and the recursion into it stays in
the tolerated-transient class it was already in.

The exit codes were derived here rather than copied from a sibling, and that mattered. A root
replaced by a regular file never reached the missing-root branch at all: the directory listing threw
`ENOTDIR` uncaught and the process exited 1, which this scanner's own contract reads as "hits found"
for a run that scanned nothing. Three more uncaught-throw routes measured in the same class exited 1 for
the same reason and are now invocation errors: an unreadable root directory, a present but
unreadable allow-list, and a present but unreadable override log, which sits next door to the
allow-list and was missed by the first survey of the class.

The repository's own test harness turned out to be an instance of the defect. The scratch repo the
suite builds created two of the three roots, so every all-mode sweep run against it was reporting OK
over a tree with a declared root it never opened. It now creates every declared root, and twelve
cases pin the behaviour: a control proving the roots are read, a missing root, a missing root while
the other roots still hold files, two broken roots at once asserted to be named together, a dangling
link and a link to a real directory, each asserted never to echo its target, a regular file, three
unreadable cases, and the residual itself. Nine were verified red against the previous scanner while
the control passed on it, so the refusal is demonstrably conditional. The three unreadable cases skip
under a privileged uid rather than assert an error that uid cannot produce, because a test reporting
a pass over something it never ran is the shape this suite exists to refuse.

Three residuals were re-derived here rather than ported from a sibling's list, and all three are
already closed in this package: the roots have covered the whole test tree and the scripts directory
for some time, so there is no test-directory gap; a census of the 22 tracked non-markdown files
outside the roots yields exactly one hit, the deliberately public company contact address in the
manifest, so widening the root set would buy an allow-list entry and no coverage; and an unmerged
index entry is refused rather than dropped, re-measured against a real conflicted index and now
pinned. Every broken root is also named in one run rather than the first only, matching the principle
the non-regular-entry refusal already states.

This adds no files to the corpus. The healthy count is 122 before and 122 after, so it is a refusal
rather than a wider enumeration, and the standing recogniser gap is untouched: a message embedded in
a string literal is still not structurally scanned, which is a separate change.

The rule certifies that each declared root exists and can be enumerated, and it never certifies that
anything was observed under one. Any tracked file the enumeration does not reach is invisible to it, and an emptied root or a root missing a whole subtree is only the loudest shape of that. Such a root satisfies every
check and the sweep still reports clean over files git tracks: emptying the source root printed
`OK: no hits (71 file(s) scanned)` and exited 0 with 51 tracked files unopened, and deleting one
subdirectory of it printed `OK: no hits (105 file(s) scanned)` with 17 unopened. That is left open
deliberately and recorded as open in both ledgers, with a test that reddens the day it is closed. It
is not the enumerate-then-read race and it needs no content-addressed sweep, since the scanner
already holds the tracked file set and the closing rule is a reconciliation against it. An earlier
draft of this note claimed both of those things and both were measured false before it shipped.

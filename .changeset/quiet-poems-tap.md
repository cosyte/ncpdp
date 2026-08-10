---
"@cosyte/ncpdp": patch
---

Add a repository gate that keeps the project's two-file agent guidance in step, so a rule can no
longer point at reasoning that has quietly stopped existing. It checks that the narrative document
is tracked, that no section has been emptied down to its heading, and that every anchor pointing
into it resolves.

It runs inside the test suite rather than as a separate workflow, so it blocks on the checks that
already gate a merge. Its corpus is the full tracked file list with no exclusion list, it reconciles
the paths it opened against that list, and it refuses with a distinct exit code rather than
reporting clean whenever it cannot observe what it claims to check, including on a file it cannot
read as text. Two pointer spellings are matched, because this project writes most of its links in a
short form that a single-spelling check would have skipped almost entirely.

The gate asserts this project's own promise and nothing about any sibling project, several of which
keep no such document at all. No runtime behaviour, public API, or emitted diagnostic changes.

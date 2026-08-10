---
"@cosyte/ncpdp": patch
---

Add a repository check that keeps this project's two-file contributor guidance in step, so a rule
can no longer point at reasoning that has quietly stopped existing. It verifies that the narrative
document is tracked, that no section has been emptied down to its heading, and that every anchor
pointing into it resolves.

Its corpus is the full tracked file list with no exclusion list, it reconciles the paths it opened
against that list, and it stops with a distinct exit code rather than reporting clean whenever it
cannot observe what it claims to check. Both of the link spellings this project uses are matched,
and each states where it does and does not look.

No runtime behaviour, public API, parsed output, or emitted diagnostic changes.

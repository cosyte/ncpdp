---
"@cosyte/ncpdp": patch
---

Add a repository check that keeps this project's two-file contributor guidance in step, so a rule
can no longer point at reasoning that has quietly stopped existing. It verifies that the narrative
document is tracked, that no section has been emptied down to its heading, and that every anchor
pointing into it resolves.

No runtime behaviour, public API, parsed output, or emitted diagnostic changes.

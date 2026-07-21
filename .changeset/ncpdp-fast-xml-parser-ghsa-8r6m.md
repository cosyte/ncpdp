---
"@cosyte/ncpdp": patch
---

Remediate GHSA-8r6m-32jq-jx6q (HIGH) in the runtime dependency `fast-xml-parser`.

Raised the `fast-xml-parser` floor from `^5.9.3` to `^5.10.1` and regenerated the lockfile so it
resolves to `5.10.1`. The advisory is a DOCTYPE entity-expansion counter that was not reset between
parses, fixed upstream in `5.10.1`. Bumping the floor (not just the lock) prevents a future lockfile
regeneration from falling back to a vulnerable `5.9.x`. In-range patch under the ratified XML-parser
choice (ADR 0001) — no API or behavioral change; `pnpm audit --prod --audit-level high` is clean.

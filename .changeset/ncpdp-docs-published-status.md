---
"@cosyte/ncpdp": patch
---

Correct the published-status drift in the public docs: `@cosyte/ncpdp` is published.

The Docusaurus docs (`docs-content/intro.md`, `docs-content/installation.md`) and
`KNOWN-LIMITATIONS.md` still claimed the package was "not yet published to npm" / sat at `0.0.0` /
was "gated on the coordinated public launch." That is no longer true — `@cosyte/ncpdp` is published
on npm at `0.0.1` and public. The status lines now read as published, public, and still pre-alpha on
the `0.0.x` ladder, the install command is described as live, and the KNOWN-LIMITATIONS "Not yet
published" section becomes a "Published, still pre-alpha" note (the runtime-dependency footprint it
records is unchanged). The capability prose beneath each is unchanged and was already accurate.
Documentation only — no runtime or API change.

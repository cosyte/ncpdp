---
"@cosyte/ncpdp": patch
---

Bring `docs-content/` to the full canonical Diátaxis spine (DOCS-CONTENT-P3).

The two-item sidebar (`intro`, `cookbook`) is expanded to the canonical spine every `@cosyte/*`
package shares — Overview → Installation → Quickstart → Core Concepts → Guides → API Reference
(resolver-injected) → Troubleshooting. The six orphaned `spec-notes-*` pages are wired into **Core
Concepts** (each given `id`/`title`/`sidebar_label` frontmatter), `cookbook.md` into **Guides**, and
three new tutorials/reference pages are authored — **Installation**, **Quickstart**, and
**Troubleshooting & known limitations**. Depth is gated to the shipped surface behind an honest status
banner; no unshipped API is documented. Runnable snippets are gated by the shared doc/code-agreement
harness (`docSnippetSuite`), so a documented example can never drift from the built package; the
`intro.md` scaffold snippet that referenced a non-existent `parseNcpdp` export is corrected to the real
subpath surface. Bumps the `@cosyte/vitest-config` devDependency to `^0.0.2` for its `/snippets`
export. Synthetic-only fixtures throughout. Docs and tests only — no runtime or public-API change.

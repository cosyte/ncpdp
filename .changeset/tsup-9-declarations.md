---
"@cosyte/ncpdp": patch
---

Type declarations are now bundled by tsup 9; the JavaScript and its source maps are unchanged.
Each declaration file lists its type-only exports in a separate `export type` statement, the shared
declaration chunks have new file names, and `@cosyte/ncpdp/script` imports its shared types from the
`common` and root entry points instead of from those chunks. Every subpath exports the same names
and types as before.

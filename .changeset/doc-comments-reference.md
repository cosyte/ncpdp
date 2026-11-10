---
"@cosyte/ncpdp": patch
---

Doc comments only: the `setDefaultProfile` comment now says the default is held once per entry point.

Each entry point is its own bundle, so a default set through `@cosyte/ncpdp/profiles` does not reach `parseScript` imported from `@cosyte/ncpdp/script`; the comment says so and points to the package root, which exports both. The profile comments now state the fixture rule in plain words, and each entry point's module comment names its import path, which the generated API reference uses as the module's title. No behavior changes.

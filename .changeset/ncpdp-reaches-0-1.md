---
"@cosyte/ncpdp": minor
---

`@cosyte/ncpdp` reaches 0.1.0: the SCRIPT and Telecom readers, serializers, builders and trading-partner profiles are settled enough to depend on.

What you can depend on from this release: `parseScript` with the NewRx, response and lifecycle readers; `parseTelecom` with `claim`, `adjudication` and the other request and response views; `serializeScript` and `serializeTelecom`, which only ever write spec-clean output; `buildNewRx`, `buildScriptResponse` and `buildTelecomRequest`, which refuse a message that is invalid by construction; `defineProfile` with the built-in `profiles.surescripts` and `profiles.pbm`; the shape of the models these return; and the stable warning and error codes you branch on. A reject always wins, money and quantities are never floats, and nothing is silently dropped.

What the version number promises: while it is below 1.0.0, a breaking change to any of the above, renaming a warning code included, ships in a new minor version, never a patch, and its entry in this changelog says what broke and what to do instead. A fix that changes nothing else a consumer relies on ships as a patch.

Still moving, and additive: the structured SIG view, which is lossy by design and can lose a component when its element name is re-examined, and the wire-code label tables, which gain a label only when a public source establishes it.

Not covered yet: electronic prescribing of controlled substances, streaming parse or emit, generating a SIG from structure, reading free-text directions into structure, most wire-code labels, and testing by a third party or against a reference implementation. Which version of each standard is decoded is stated once, in the conformance statement.

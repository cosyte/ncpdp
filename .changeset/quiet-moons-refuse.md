---
"@cosyte/ncpdp": minor
---

Serializing a SCRIPT message whose transaction this library does not model now raises a typed error
instead of returning a document with the transaction body deleted. This is a behaviour change on the
emit side, and a consumer relaying an unmodeled transaction has to change what it does.

Previously, a body of kind `unsupported` serialized to a complete, well-formed, re-parseable
`<Message>` whose transaction was an empty element. Every child that transaction carried was gone,
and nothing in the output said so: no warning, no error, no marker. Where the element name was one of
the transaction names in the closed 42 CFR 423.160 vocabulary it was reproduced; where it was not, a
fixed `<UnsupportedTransaction/>` placeholder took its place, so two different unrecognized vendor
extensions emitted as the same bytes. A caller relaying such a message forwarded something that looked
correct and was not.

Emit now refuses. `serializeScript(message)` and `ScriptMessage#toString()` both throw
`NcpdpScriptBuildError` carrying the new code `NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION`, and return
no string. The code is exported from the package root and from `@cosyte/ncpdp/common` beside the three
build codes already published, and resolves to a fixed sentence in `SCRIPT_BUILD_MESSAGES`; like every
other diagnostic here it quotes nothing from the document. The placeholder element is deleted rather
than replaced by another one: a fixed tag is what made two different unrecognized transactions emit
identically, and stabilising that collision was the defect rather than the remedy.

Migrating. Test the discriminant before you emit: `message.body.kind === "unsupported"` is public,
typed and never throws, so a relay can branch on it and forward the **original bytes**, which are the
only faithful representation available for a transaction this library does not model. Two things to
check for in your own code. Because `toString()` is the message object's own string conversion, this
throw can surface from an implicit coercion (a template literal, string concatenation, a log line)
where there is no visible serialize call; and a message with no `<Body>` and no recognized transaction
is an `unsupported` body too, so it is refused on the same path rather than emitting a fabricated
placeholder transaction.

Reading is unchanged. Such a message still parses without throwing, still carries
`NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION` at the body, and still names the transaction only when its
element name is in the closed vocabulary. Every modeled transaction serializes exactly as it did
before, byte for byte, and canonical-form idempotence is unaffected.

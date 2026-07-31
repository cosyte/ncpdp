---
"@cosyte/ncpdp": patch
---

Warning and error messages now come from a frozen registry instead of being written at the call site.

The factories no longer take a message: `scriptWarning(code, position)` and
`telecomWarning(code, position)` build their text from `SCRIPT_WARNING_MESSAGES` and
`TELECOM_WARNING_MESSAGES`, and the four typed error classes do the same from their own registries.
All six registries are exported and frozen. This is breaking for code calling those constructors
directly; `code` and `position` are unchanged.

Five slots previously echoed input a sender controls into a diagnostic: a SCRIPT root element name
and an unmodeled SCRIPT transaction element name each reached a message and a position path, two
SCRIPT fatal paths reached `err.snippet`, and a Telecom Segment Identification value reached a
message, where a dropped field separator can run a product code and a prescription number into it.

Two structural identifiers on the parsed model are now bounded as well, because bounding a message
does not protect a package that reads the model and builds its own diagnostics.
`TelecomSegment.segmentId` is always two characters or empty; an off-shape `AM` field stays in
`segment.fields` verbatim and raises the new `NCPDP_TELECOM_MALFORMED_SEGMENT_ID`, so nothing is
dropped and the transmission still round-trips byte for byte. `buildTelecomRequest` enforces the
same bound on emit with the new `NCPDP_TELECOM_BUILD_INVALID_SEGMENT_ID`, so the guarantee does not
depend on how the transaction was built, and `SEGMENT_ID_LENGTH` is exported.
`UnsupportedBody.transaction` is now optional and is filled only from the new closed
`SCRIPT_TRANSACTION_NAMES` vocabulary, which is the transaction list published in 42 CFR 423.160.

`NcpdpScriptParseError.snippet` is removed: the 64-character cap bounded its length and nothing
about its content, and the sibling error classes had already refused a snippet for that reason.
`NcpdpTelecomBuildError` gains `headerField`, typed `keyof TelecomHeader`, so a header-scoped
rejection names the slot without quoting the value.

A new suite declares 47 sender-controlled slots across both wire formats and asserts that none of
them reaches a message, a position, a thrown value, `err.stack`, or a structural identifier on the
model, with every slot required to prove it reached the diagnostic it names.

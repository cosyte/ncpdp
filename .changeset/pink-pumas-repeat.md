---
"@cosyte/ncpdp": patch
---

A Telecom transmission carrying several group-separated transactions now decodes every one of them,
request and response alike, instead of decoding the first and warning about the rest.

`parseTelecom` surfaces each transaction on the new `transactions` array: one entry per transaction,
in wire order, carrying its own segments, its own byte offset in the raw message and the warnings
raised decoding it. Every view takes an optional transaction index and still defaults to the first,
so `claim(t, 1)`, `adjudication(t, 1)`, `compound(t, 1)`, `cobOtherPayments(t, 1)`, `responseCob`,
`requestDur`, `priorAuthorization`, `responseStatus`, `responsePricing` and `responseDur` all address
a later claim without re-tokenizing the raw bytes. `transaction.segments` still holds the first
transaction's segments and is unchanged for a single-transaction message. The new
`tokenizeTransactions(body, base)` is the tokenizer-level equivalent; `tokenizeBody` keeps its
signature and its first-transaction result.

Each transaction is decoded independently, which is what isolates a bad one: a later transaction
whose segment carries no Segment Identification, or a field token too short to hold an id, surfaces
its own bytes verbatim under its own warnings while the transactions around it decode untouched, and
parsing still does not throw on recoverable input.

The declared Transaction Count (109-A9) is surfaced verbatim on `transactionCount` beside the number
actually decoded on the new `decodedTransactionCount`, as two separate values. When they disagree,
including when the declared value is empty or is not a number, the new warning
`NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH` says so and every decoded transaction is still exposed.
**No maximum transaction count is enforced**, and none was added: no public artifact establishing one
could be read, so the library reports a disagreement and never calls a count illegal. A transmission
declaring nine transactions and carrying nine decodes all nine and warns about nothing.

Emit is deliberately the narrower half. `serializeTelecom` writes one transaction per transmission,
so a model carrying more than one decoded transaction is now **refused** with the typed
`NcpdpTelecomBuildError` `NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT` rather than emitted with the
later transactions silently dropped. Single-transaction output, canonical form and round-trip
idempotence are unchanged.

**Breaking:** the warning code `NCPDP_TELECOM_MULTI_TRANSACTION_TRUNCATED` is **removed** from
`TELECOM_WARNING_CODES`, `TELECOM_WARNING_MESSAGES` and the `TelecomWarningCode` union. Nothing can
raise it any more, because nothing truncates any more. Code matching on that string should match on
`NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH` where it wanted "the header and the body disagree", and
drop the branch where it wanted "there is data here I cannot reach", which is no longer true.
`TelecomTransaction` also gains two required members, `transactions` and `decodedTransactionCount`,
which affects code that constructs that type by hand rather than getting one from `parseTelecom` or
`buildTelecomRequest`.

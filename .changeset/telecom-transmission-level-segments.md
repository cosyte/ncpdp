---
"@cosyte/ncpdp": patch
---

`parseTelecom` no longer reads the segments before the first Group Separator as a transaction.

In a Telecom request the segments ahead of the first Group Separator, such as Patient and Insurance, belong to the transmission and are shared by every transaction in it. They used to be decoded as a transaction of their own, so a request carrying Insurance and Patient and then one claim decoded as two transactions: a false `NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH`, a first claim view with the date of birth but no Rx number, a second with the reverse, and `serializeTelecom` refusing to write the model back. Now:

- they are on the new `transmissionSegments` field, never in `transactions`, and never counted against the declared Transaction Count;
- `segments` is the first transaction's whole view: the transmission-level segments, then the transaction's own;
- `claim` and every other view addressed by a transaction index read that transaction's segments and the shared ones, and a transaction's own segment wins over a shared one with the same Segment Identification;
- `serializeTelecom` writes them back ahead of the Group Separator, taking the bytes from `segments`;
- the new `tokenizeTransmission` returns both parts; `tokenizeTransactions` returns only the transactions, and `tokenizeBody` returns the same list as `segments`;
- transmission-level segments with no transaction behind them warn a count mismatch instead of passing silently.

Responses follow the same rule. A body with no Group Separator at all is still read as one transaction, and serialized output for a model with no transmission-level segments is unchanged. A sender that writes its first transaction without a Group Separator in front of it, and a later one with it, now has that first group read as transmission-level, with the count mismatch warned. This would otherwise call for a minor: it adds `transmissionSegments`, `tokenizeTransmission` and `TelecomDecodedTransmission`, and changes what `transactions`, `segments` and `tokenizeTransactions` return for those messages.

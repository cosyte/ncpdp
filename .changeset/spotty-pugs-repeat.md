---
"@cosyte/ncpdp": patch
---

Telecom code labels now ship only where a public, citable artifact establishes them across a whole
field, and the tables that did not clear that bar have been withdrawn: some because nothing
established them, and one because the only artifact available covered part of the field and would
have left the rest unrecognized. **This changes what a consumer reads back**, so upgrade with the
list below in hand.

Withdrawn, along with the exports that carried them:

- `REJECT_CODE_MEANINGS` (Reject Code, 511-FB) is gone. Eleven labels went with it, including "Prior
  Authorization Required" for `75` and "Refill Too Soon" for `79`.
- `PRODUCT_QUALIFIER_MEANINGS` (Product/Service ID Qualifier, 436-E1) is gone, and `qualifierMeaning`
  no longer appears on a `product` or on a compound ingredient.
- `RESPONSE_STATUS_MEANINGS` still exists and still maps a Transaction Response Status (112-AN) to its
  `disposition`, but its entries no longer carry a `description`, and `statusDescription` is gone from
  the response status view.

What a consumer that rendered one of those strings now receives: the wire code itself, verbatim, and
nothing else. `rejectCodes` is still every code in wire order with none dropped; each entry is now
`{ code, known: false }` with no `description`, and each raises `NCPDP_TELECOM_UNKNOWN_REJECT_CODE`
because there is no longer a table to recognize it against. A response status still yields its
`disposition`, so `"paid"`, `"rejected"` and `"unknown"` are unchanged, as is the rule that a reject
always wins and an unrecognized status never reads as paid. If a pharmacy screen displayed a
description, it will now show a bare code; supply your own mapping for the codes you care about.

DUR Reason For Service codes (439-E4) keep a label table, now sourced. Seven of the ten previous
entries survive, cited to a dated, publicly-available state Medicaid pharmacy manual whose retrieval
date, checksum and single-source caveat are recorded in the source beside the table. `ID`, `LR` and
`MC` are withdrawn and now read back with `reasonKnown: false`. Five surviving labels changed wording
to agree with that document; the substantive one is `ER`, which read "Early Refill" and now reads
"Drug Overuse Alert", because the document that establishes the code describes an overuse alert. A
test fails the build if a label ever ships again without a source beside it, or if
`KNOWN-LIMITATIONS.md` and the exported surface disagree about whether a table exists at all.

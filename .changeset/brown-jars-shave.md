---
"@cosyte/ncpdp": patch
---

The documentation bundle now names every diagnostic code this package can raise, and every page of it
reaches every other page.

Seven codes were named on no page at all. Two of them, `NCPDP_SCRIPT_LIFECYCLE_AMBIGUOUS_OUTCOME` and
`NCPDP_SCRIPT_LIFECYCLE_OUTCOME_UNRECOGNIZED`, carry the rule that a denial is never masked by a
co-present approval and that a lifecycle response with no recognized outcome reads unknown rather than
approved, which is exactly the kind of behaviour a consumer needs to be able to look up. Alongside
them, `NCPDP_SCRIPT_VERSION_ABSENT`, `NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION`,
`NCPDP_SCRIPT_MISSING_REQUIRED_ELEMENT`, `NCPDP_SCRIPT_STRENGTH_CODED_AND_EXPLICIT` and
`NCPDP_TELECOM_MALFORMED_FIELD` are now documented too. Troubleshooting carries the complete warning
set for both standards, one row per code, each saying what the reader did when it raised it rather
than restating the code name.

The bundle is also consistent to read. Every page declares the same metadata, cross-page links are
spelled one way and all resolve, and every page both links to another page and is linked from one, so
three pages that could previously be reached only from the navigation tree are now reachable from the
text as well.

None of this changes the parser. The codes, their messages and their positions are exactly what the
previous release shipped; what changed is that they can now be found.

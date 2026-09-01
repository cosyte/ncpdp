---
"@cosyte/ncpdp": patch
---

The package description now names both shipped wire formats, so the npm listing and the README
answer the question that decides whether to install: SCRIPT ePrescribing, Telecom pharmacy claims,
or both.

NCPDP is two structurally unrelated standards under one brand, and the previous one-line description
named neither of them. A reader landing on the registry page or the repository saw an accurate
sentence about a parser, a serializer and a builder, and still could not tell whether the package
covered ePrescribing or pharmacy claims without opening the documentation. Both are shipped, and the
description now says so.

The archetype promise it carried before is unchanged, and so is everything else: no code, no field
position, no warning code and no decoded version moved. This is manifest and README text only. What
the package decodes, and until when, is still stated once, in the conformance statement, and is
still deliberately not repeated anywhere else.

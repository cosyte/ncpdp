Relocated out of `README.md` so the front page fits its byte budget. The section below is the text
that used to sit there, unchanged and under its original heading, and `README.md` links here at the
point it left. Relocation, not deletion.

## Why this exists

NCPDP is two structurally unrelated standards under one brand: SCRIPT, an XML ePrescribing format,
and the Telecommunication Standard, a control-character-framed pharmacy claim format. The
Implementation Guides for both are purchased products, so the usual route for a Node team is to
hand-roll a reader against a guide somebody had to buy: an element walk over
[`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) for SCRIPT, a
`String.split` on the FS/GS/RS separators plus hard-cut byte offsets for Telecom. That works until
real input arrives, and then a vendor quirk is an exception thrown in the middle of a dispense, an
off-by-one offset is a wrong field, and a currency amount parsed with `parseFloat` is a wrong paid
amount. This package is the other choice: a lenient reader that turns quirks into positioned
warnings instead of failures, a conservative emitter that only ever writes spec-clean output, and
quantities and money handled string-wise so binary floating point can never corrupt a value.

---
"@cosyte/ncpdp": patch
---

The repository PHI commit-gate no longer loses a whole prescription to one stray byte, and its
extension fallback now answers to an upper-case name. No published API, type, warning code or parse
result changes.

Two gaps were measured by the previous change to this scanner, found unchanged on its base, and left
open there. Both are now closed, and both are pinned by tests.

The sharper one: the scanner tested for pharmacy-claim separator bytes instead of, rather than
alongside, the test for an XML document, so a file satisfying both went to the claim tokenizer, which
finds no field ids in XML. Measured on the previous commit, a complete, well-formed prescription
carrying a patient name, date of birth and street address, plus a single separator byte inside an
unrelated note element, scored no hits at any extension including `.xml`, while the identical
document without that byte scored four at every extension. One byte of corruption in an element the
patient block does not touch silenced the whole gate.

It is fixed as a union rather than a precedence: detection now returns every format the content
signals, and a payload signalling both is scanned by both. Choosing a winner would only have moved
the gap, taking the field-id scan off a claim transmission carried inside an XML envelope, which is
now its own test. No file is handed a scanner its own content did not signal, so the extra catch does
not widen the false-positive surface.

The second: the extension fallback matched case-sensitively, so a fragment fixture named `.XML`
scored nothing where `.xml` scored a hit, and the same held for a separator-less claim token named
`.NCPDP`. It now folds case, exactly as the scanner's own markdown exclusion already did. The
fallback arm itself was kept: it is what keeps a fragment fixture and a separator-less claim token
structurally scanned, so removing it would have been a trade rather than a widening.

Verified as a differential over 216 probes across eighteen payload shapes and twelve extensions:
nothing lost, no file going from a hit to clean, no duplicated report line, and 42 probes gaining a
catch. The committed corpus is unchanged at 120 files and no hits.

The list of known gaps is still not closed, and both fixes hold for a payload the content tests
answer for rather than in general. One content signal still suppresses the extension fallback
entirely, so a fragment with leading prose named `.xml`, carrying a patient last name plus one stray
separator byte, still scores nothing, exactly as it did before: the same downgrade one level down, on
the payload class the document test cannot claim. That is now written down and pinned rather than
implied closed. Two narrower gaps are likewise newly executable: the fallback matches a whole suffix,
so a fragment named `.xml.bak` gets the text pass only, and a claim payload with no separator at all
is reachable only through that fallback. The message-embedded-in-a-string-literal gap is unchanged
and still deliberate.

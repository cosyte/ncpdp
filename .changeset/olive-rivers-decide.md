---
"@cosyte/ncpdp": patch
---

A published conformance statement now names, per wire format, the version this package decodes,
the section of public law that adopts it, and the date that adoption ends.

`docs-content/conformance.md` is one document and the only place the decoded version set is
written down. It carries the SCRIPT versions with their adopting paragraphs of 45 CFR 170.205 and
the January 1, 2028 expiry of the older one; the Telecom version with 45 CFR 162.1102 and
45 CFR 162.1202, and the two dates those sections set (August 14, 2027, when the successor version
becomes permissible alongside it, and April 14, 2028, when it becomes the only adopted option);
the `F6` stamp as recognized-but-not-decoded, with what a message carrying it does instead; and
Batch framing as not decoded at all. It is reachable in one hop from the README and from the
documentation sidebar.

It also states plainly that no third party has tested this package, on either wire format, and why
the two things that carry the word "certification" are not a record about this software: the NCPDP
Certification Program certifies individuals rather than systems, and the ONC/NIST electronic
prescribing testing tool targets a legacy SCRIPT version this package refuses with a typed fatal.
What stands in is named instead: a synthetic corpus, the `@cosyte/test-utils` property invariants,
a nightly amplified fuzz job and per-directory coverage gates. There is still no differential
corpus against a third-party implementation, and no byte-for-byte agreement with any vendor or
switch to assume.

The statement cannot drift from the code. A new test derives the decoded set from the shipped
constants rather than from a copy of them and fails in either direction: a version the package
decodes that the statement omits, and a version the statement names that the package does not
decode, are both errors that name the version. The same test closes the citation set to the cited
sections, two public URLs and files in this repository, since the standards themselves are
purchased products, and rejects a statement that would imply certification. `README.md`,
`KNOWN-LIMITATIONS.md` and the documentation pages that used to carry a partial version list now
point at the statement instead of repeating it.

No parse, emit, warning or refusal behaviour changes.

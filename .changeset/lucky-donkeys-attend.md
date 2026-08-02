---
"@cosyte/ncpdp": patch
---

The repository PHI commit-gate now decides which NCPDP scanner a file gets from its bytes rather
than its name. No published API, type, warning code or parse result changes.

`scripts/phi-scan.ts` classified a file with a path predicate first: only a path under `test/`, or
one ending `.ncpdp` or `.xml`, was eligible for a structural scan, and everything else was dropped
to the conservative dashed-SSN and email pass. So the file name, not the content, decided whether a
real-looking prescription was read at all. Measured on the previous commit, one byte-identical
SCRIPT document scored two hits as `.xml` and exited clean as `.ts`, `.txt`, `.dat` and `.json`. It
also exited clean as `.ncpdp`, where the extension short-circuit routed an XML document into the
Telecom tokenizer, which finds no field ids in it.

Detection is now content-first at every path: NCPDP control-char separators mean Telecom, an XML
document means SCRIPT, and the extension is consulted only as a fallback for a payload that says
nothing about itself, which is what keeps an XML fragment fixture scanned. The change is a strict
widening, verified as a differential over 77 probes across seven payload shapes and eleven
extensions: 22 hits became 188 with nothing lost, and the committed corpus is unchanged at 120 files
and no hits.

One gap is left open on purpose and is now pinned by a test rather than only written down: a message
embedded in a string literal, such as a fragment inside a test or a documentation example, is still
not scanned structurally, because the payload as a whole is not a document. Recognizing messages
inside arbitrary TypeScript carries its own false-positive surface, and a gate that cries wolf gets
bypassed, which is worse than a known gap.

Two further gaps came with the old routing, were measured unchanged, and are written down rather
than quietly fixed here: a single stray separator byte in an otherwise well-formed prescription
sends the whole document to the pharmacy-claim tokenizer, which finds nothing in it; and the
extension fallback matches case-sensitively. Neither list of gaps is closed.

A test named for the content-first behavior had asserted its negation, which is why the gap read as
covered. It now asserts what its name says.

# ADR 0002: Our own XML reader for NCPDP SCRIPT

- **Status:** Accepted. Supersedes the decision in ADR 0001.
- **Date:** 2026-11-10

## Context

ADR 0001 took `fast-xml-parser` as the package's one runtime dependency, for SCRIPT XML, on the
strength of its XXE safety. A performance audit of the package on a GitHub-hosted runner then found
the SCRIPT side to be most of the package's cost:

- a NewRx carrying one 4 MiB base64 note peaked at 33 times its size on the heap, and kept 31% of
  the throughput the same message has at 64 KiB: the parser builds every text value one character
  at a time, and 96.8% of the allocation was its own;
- one 3 KiB NewRx peaked at 124.7 times its size, most of it the parser's intermediate tree and
  the path string it builds for every tag;
- importing the package took 31.56 ms, almost all of it loading the parser, so every consumer paid
  for it, the Telecom-only ones included.

The SCRIPT loader used a small, fixed part of what the parser does: order-preserving elements,
attributes and text, with no entity resolution, no value conversion and no validation. Its security
boundary was ours already: the DOCTYPE/ENTITY pre-scan.

## Decision

SCRIPT XML is read by our own reader, in `src/script/xml-load.ts`, and the package has no runtime
dependency.

- It is one forward pass over the text with no intermediate tree. A text value is sliced out of the
  document, never built a character at a time, so a large value costs its own bytes.
- It reads every document the way the replaced setup did, leniency and refusals included: the same
  elements, the same attributes (quoted values only, the last of a repeated name kept), the same
  text (CDATA content in, comments and processing instructions out, line endings normalized), the
  same handling of a stray or mismatched closing tag, and a refusal wherever the old loader refused.
- The security boundary is kept and tightened. The DOCTYPE/ENTITY pre-scan still refuses a
  declaration before the reader sees it; the reader resolves no entity, ever; nesting is bounded
  at the depth the old parser allowed; an element named after an object's prototype machinery is
  refused or prefixed exactly as before. The one deliberate difference: every `<!D` declaration is
  refused, where the old parser read a `<!DOCTYPE` run straight into a name (such as
  `<!DOCTYPEx>`, which the pre-scan's word boundary let through) as a document type declaration.

## Proof

- `test/property/xml-reader-differential.property.test.ts` keeps the old loader, unchanged, in
  `test/_helpers/reference-xml-load.ts` on `fast-xml-parser` as a dev dependency, and holds the
  reader to the same tree or the same refusal on drawn markup, character soup and nesting around
  the depth bound.
- `test/output-equivalence.test.ts` holds every parse, warning, typed read and built byte of a
  synthetic corpus, the loaded trees included, to digests captured before the change.
- `test/script/xml-reader.test.ts` pins each rule on a fixed input.

## Consequences

- The package ships no runtime dependency, and its root, `script` and every other entry load in a
  few milliseconds.
- The reader is ours to keep. A change to it is held to the reference loader for as long as that
  stays a dev dependency, and to the equivalence digests after.
- A future need for a part of XML the reader does not read (a DTD, entity expansion, validation)
  is a new decision, not a configuration change.

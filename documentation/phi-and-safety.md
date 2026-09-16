Relocated out of `README.md` so the front page fits its byte budget. The section below is the text
that used to sit there, unchanged and under its original heading, and `README.md` links here at the
point it left. Relocation, not deletion.

## PHI and safety

A pharmacy transaction carries PHI, and this library is built on the assumption that yours does.

**Logging.** The library logs nothing. There is no `console` call in library code, and its own
diagnostics are safe to log whole: a warning or error message comes from a frozen registry keyed by
code, and the factories that build one take a position and nothing else, so there is no
interpolation site a document can reach. A warning's `message` is byte-identical to the registry
entry for its `code`, and a test asserts exactly that. Position is an XPath for SCRIPT and a byte
offset plus a two-character field id for Telecom, and its parts come only from names this library
recognizes, never from a name a sender chose.

**Retention.** Nothing is retained. A parse is a pure function of the bytes handed to it. There is
no cache, no module-level state and no history; the frozen model returned is the only thing that
outlives the call.

**Writing to disk.** Nothing is written, and nothing is fetched. The library opens no file and no
socket at any point, and the code lists it ships are bundled snapshots compiled into the package
rather than a runtime download.

**The parsed model is not safe to log.** Field values, drug codes, descriptions and identifiers are
exactly as sensitive as the claim or prescription they came from: that is what you asked the parser
for. What is guaranteed is that the library's own structural identifiers stay bounded, so a
downstream package building diagnostics out of them cannot be handed unbounded wire bytes:
`segment.segmentId` is always two characters or empty however the transaction was made, `field.id`
is at most two, and an unmodeled SCRIPT transaction is named only from a closed vocabulary.

**What the consuming application still owns.** Everything outside the call: transport and
encryption, authentication, access control and audit, retention and disposal, de-identification
before analytics, and its own logging. If you log the parsed model, you have logged PHI. The SCRIPT
loader refuses any input carrying a `<!DOCTYPE>` or `<!ENTITY>` declaration and resolves no
entities, so there is no external-entity or billion-laughs vector, but no parser can make an
untrusted document safe to store.

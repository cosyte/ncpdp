---
"@cosyte/ncpdp": patch
---

Read SCRIPT XML with our own reader and drop the package's only runtime dependency, `fast-xml-parser`; read Telecom transmissions and claim views with far fewer allocations; write a SCRIPT message with a large value without copying it once per element.

Every parsed message, warning, typed read and serialized byte is the same as before, held to digests of a synthetic corpus captured before the change and, for SCRIPT, to the replaced parser by a differential test. A NewRx carrying a large base64 note now costs about its own size to parse instead of more than thirty times it, and importing any entry of the package no longer loads an XML parser.

One deliberate difference: a `<!DOCTYPE` run straight into a name (such as `<!DOCTYPEx>`), which the declaration pre-scan let through and the old parser read as a document type declaration, is now refused with `NCPDP_SCRIPT_NOT_XML` like every other `<!D` declaration. A caller that sent one gets the same refusal any DOCTYPE already got; nothing else needs to change.

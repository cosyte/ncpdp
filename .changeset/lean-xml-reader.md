---
"@cosyte/ncpdp": patch
---

Read SCRIPT XML with our own reader and drop the package's only runtime dependency, `fast-xml-parser`; read Telecom transmissions and claim views with far fewer allocations; write a SCRIPT message with a large value without copying it once per element.

Every parsed message, warning, typed read and serialized byte is the same as before, held to digests of a synthetic corpus captured before the change and, for SCRIPT, to the replaced parser by a differential test. A NewRx carrying a 4 MiB base64 note now parses in tens of KiB of heap instead of more than thirty times its size, and importing the package no longer loads an XML parser.

One deliberate difference: a `<!DOCTYPE` run straight into a name (such as `<!DOCTYPEx>`), which the declaration pre-scan let through and the old parser read as a document type declaration, is now refused with `NCPDP_SCRIPT_NOT_XML` like every other `<!D` declaration. A caller that sent one gets the same refusal any DOCTYPE already got; nothing else needs to change.

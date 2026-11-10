---
"@cosyte/ncpdp": patch
---

`parseScript` now skips XML processing instructions instead of reading them as elements.
A SCRIPT document with a processing instruction before `<Message>` (for example `<?xml-stylesheet ...?>`)
used to be refused with `NCPDP_SCRIPT_NO_MESSAGE_ROOT`, and one placed just before an unmodeled
transaction inside `<Body>` hid that transaction's name. Both now parse as they would without the
instruction.

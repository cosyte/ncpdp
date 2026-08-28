---
"@cosyte/ncpdp": patch
---

The Telecom segment inventory now publishes the code ranges it declares and a record for every code
inside one that it does not name, so an unnamed segment can be told apart from an unexplained hole.

`SEGMENT_NAMES` mapped 19 Segment Identification (111-AM) codes to paraphrased names and said, in a
source comment a consumer never sees, that it covered a request range and a response range wider
than the codes it filled. Meeting `06` on a wire left three readings open and no way to choose
between them: no such segment exists, this library did not model it, or nobody has read an artifact
that would settle it. Two new exports answer that. `SEGMENT_CODE_RANGES` publishes both declared
ranges, and `SEGMENT_ABSENCES` publishes one record per unnamed code inside them (`06`, `09`, `14`,
`15`, `16` and `27`), each carrying the reason `"unsourced"`: no publicly readable artifact
establishes what the standard defines at that code, so this package neither names it nor claims
that nothing exists there.

Both ranges ship with `boundsVerified` set to `false`, because nothing this package can cite fixes
either bound. They are its own claim of coverage rather than a statement about the standard, and
they say so in the data rather than in a comment.

No name was added, removed or changed: the same 19 codes carry the same names, and a test now pins
them. Decoding is untouched. A segment whose code has no name, inside a declared range or outside
every one of them, is still exposed with its code and every field verbatim in wire order under
`NCPDP_TELECOM_UNKNOWN_SEGMENT`, and a segment id that is absent or not two characters still warns
exactly as before and consults no record at all.

---
"@cosyte/ncpdp": patch
---

Strengthen this repository's PHI commit-gate so a full sweep reads the bytes git carries as well as
the files on disk. No runtime behaviour, public API, parsed output, or emitted diagnostic changes.

The sweep previously proved that every tracked, in-scope path had been opened, and then read each one
from the working tree. A working tree is not the committed corpus, so a payload held in the index at
a path the sweep had opened was reported clean, with a file count that was entirely correct. The
sweep now reads both, as a union.

Duplicate reads are skipped on the pair of a path and git's own object name for its content, so an
unmodified checkout matches every index entry without fetching anything, and where a path's two
copies differ both are scanned. A conflicted path is read at every stage it holds, each reported with
its stage, so the merge base is never mistaken for what git carries.

Every report line now carries both the number of files scanned and the number of additional blobs
read, so neither number can be read without the other. Content found in a carried blob exits 1, the
same as content found on disk; a git command that cannot answer exits 2 rather than reporting a pass.

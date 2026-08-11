---
"@cosyte/ncpdp": patch
---

The PHI scanner refuses a target it enumerated and never read, in every mode, naming the paths.
A whole-corpus sweep that ends up reading nothing at all still refuses under its own existing rule,
and that message now names the withdrawn paths too.

A scan that did not open a file has no clean verdict to give about it. `--allow-fixture` used to
withdraw a file at enumeration time, which left "read and found clean" and "never opened"
indistinguishable by the time anything counted: a run that named a violator and a decoy and withdrew
the decoy reported only the hits code, and the same invocation with the flag on the violator reported
`OK: no hits` and exited 0 over a corpus carrying live PHI. The check is a set difference over the
paths, never a count, because a count counts the files that were read.

The flag, the override log and the rejection gate all stay, so a bypass attempt is recorded and then
refused rather than silently honoured; `scripts/phi-allow-list.txt` is now the only mechanism that
reaches a clean run, and the hit footer no longer suggests otherwise. Hits are reported before the
refusal, so a run that is both incomplete and carrying hits prints both. The one exception is the
existing tolerated-vanish class, which stays bounded exactly as it was.

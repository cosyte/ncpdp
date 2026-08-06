---
"@cosyte/ncpdp": patch
---

`CHANGELOG.md` is now written by the release rather than by hand, so the copy inside every published tarball stops describing already-shipped code as something still to come.

The file is listed in `package.json#files`, so it ships with the package. For the whole of this package's published history `.changeset/config.json` set `"changelog": false`, which meant no release ever wrote a version heading into it and nothing ever rolled its single hand-maintained `[Unreleased]` heading over. Its preamble went on describing the first pre-alpha release in the future tense, as a thing still to come, inside tarballs that had already carried the API surface it named for several versions.

The mechanism changed rather than the sentence: `changelog` now names the default Changesets generator, so each release writes its own version heading and the changeset summary becomes the entry a reader sees. Correcting the preamble by hand would have left in place the mechanism that wrote it, to write it again on the next release.

The hand-written history is preserved verbatim, moved under a new `Released before this file was generated` heading with generated sections above it. No entry was reworded, re-ordered, re-wrapped or re-sorted: the archived text is byte identical to what the repository already held. What was dropped was scaffolding for the workflow that no longer runs, together with the preamble it belonged to: the `[Unreleased]` heading, its link definition at the foot of the file, three empty section stubs, and the future-tense paragraph itself.

The release's Prettier pass is left on, which is derived from this package having no `.prettierignore` and a format check that covers root markdown: with it off, generated output would fail that check on a file nobody edited.

No runtime code, public API, type, warning code or parse result changed.

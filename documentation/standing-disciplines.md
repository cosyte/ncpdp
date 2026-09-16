Relocated out of `CLAUDE.md` so the cursor fits its byte budget. The section below is the text
that used to sit there, unchanged and under its original heading, and `CLAUDE.md` links here at
the point it left. Relocation, not deletion.

A backticked bare anchor below (`#like-this`) points into `documentation/agent-notes.md`, the same
convention `CLAUDE.md` writes. `pnpm check:agent-notes` reads the bare form in the cursor and the
narrative file only, so the pointers below are a reader's convention here rather than a gated one;
the path-qualified form is the one that is checked everywhere.

## Standing disciplines (every change)

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md`. They bind here too:

1. **Documentation follows code**. A change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/ncpdp.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog**: a Changeset (`patch` on the `0.0.x` ladder) per meaningful change. **The
   changeset summary IS the entry; `CHANGELOG.md` is generated output. Never hand-edit it or restore
   an `[Unreleased]` heading; the Prettier pass stays ON, derived here, never ported.** Why:
   `#the-changelog-generator`. Renaming a stable warning code is a **breaking change**.
3. **Crew + knowledgebase loop**: if this parser's public API or warning codes change, flag/update
   the matching `crew` healthcare skill (`ncpdp-script-handler`) + the KB product doc.
4. **No internal project bookkeeping on a public surface** (founder directive, 2026-07-27). Item
   identifiers (`NCPDP-7`), phase and wave language, ADR numbers, meta-repo paths and "how this got
   built" commentary belong in the commit, the PR and the roadmap, NOT in a changeset's first
   sentence - never in what a consumer reads. **An UNREGISTERED prefix in that sentence REFUSES the
   release BODY; a LATER paragraph is ungated and ships in the tarball's `CHANGELOG.md`.** It is a
   **translation** at the boundary, not a deletion: when you
   strip an identifier off the front of a line, **repair the head**. Gated by
   `pnpm check:no-internal-refs`, which keys on known project prefixes, so **a new programme prefix
   has to be added by hand**, and it catches identifiers rather than English sentences about our
   process, so the reviewer still owns half the rule. Why:
   `#no-internal-project-bookkeeping-on-a-public-surface`.
   - **This is the repo where the WORD-N trap bites hardest**, because the stripped token is the
     name of the standard we parse. **Three source surfaces, three different answers**: doc comments
     and string literals are GATED, `//` and plain `/* */` comments are NOT. Relocated 2026-09-06:
     `#the-public-surface-traps`.

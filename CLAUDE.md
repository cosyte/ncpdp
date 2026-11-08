# @cosyte/ncpdp

Our public, MIT-licensed TypeScript parser, serializer, and builder for NCPDP Telecom pharmacy
claims (`@cosyte/ncpdp/telecom`) and SCRIPT XML ePrescribing (`@cosyte/ncpdp/script`), with shared
vocabulary in `/common`. Lenient on parse, with stable warning codes; spec-clean on emit.

@AGENTS.md

## Gate

Required checks: `ci / verify` on Node 22 and 24, `ci / actionlint`, `codeql / analyze
(javascript-typescript)`, `release-dry-run`, `test-selection`, `no-emdash / tracked-files` and
`no-internal-refs / public-surface`. Run from the repo root with pnpm 10 (the `packageManager` pin)
first on PATH: pnpm 12 refuses the frozen install, and tests spawn a bare `pnpm`.

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm format:check && pnpm phi-scan
pnpm test && pnpm test:coverage && pnpm build && pnpm attw
pnpm check && pnpm check:documents && pnpm check:no-emdash && pnpm check:no-internal-refs
pnpm publish --dry-run --no-git-checks --ignore-scripts && npm pack --dry-run --ignore-scripts
```

CI also runs Node 26, a dual ESM/CJS load of `dist/`, the pre-publish checks, `pnpm examples` and
the `documents` job. Locally the publish dry run refuses once the version is on npm; CI's passes.

## Hazard

Telecom claims and SCRIPT prescriptions carry patient data, so a warning, a fixture or a log line
can leak it. A field read at the wrong offset, or a reject or DUR alert lost on the way, becomes the
wrong drug, dose or payment at a pharmacy counter.

## Rules

- Diagnostic factories take no value parameter, and nothing a sender chose reaches a message, a
  `position` or an unbounded model field: five slots leaked wire values, an NDC and an Rx number
  among them. documentation/agent-notes.md#phi-warning-message-leak
- Surface every transaction, compound ingredient, COB row, reject and DUR alert; a count mismatch
  warns, and an emit that cannot carry everything refuses with a typed build error: the serializer
  once dropped every Telecom transaction after the first (`CHANGELOG.md`, 0.1.0).
- A wire-code label or name list ships with its public source beside it, or not at all, and never
  from memory or the purchased NCPDP guides: 32 code meanings shipped unsourced and most were
  withdrawn. documentation/agent-notes.md#wire-code-labels-source-it-or-delete-it
- State the decoded version set only in `docs-content/conformance.md`: a sweep went green over three
  pages that restated it. documentation/agent-notes.md#the-shape-hid-behind-two-asterisks
- Prove a `scripts/phi-scan.ts` change red on a violator under `src/`, `test/` or `scripts/`, and
  keep a target enumerated but never read a refusal (exit 2); synthetic tokens go in
  `scripts/phi-allow-list.txt`. documentation/agent-notes.md#the-argument-driven-collapse-routes
- The gates are `@cosyte/script-utils` bins: `pnpm attw` is `cosyte-attw`, never the bare `attw`
  CLI (it exits 0 on a tarball with no types), and `src/` string literals keep a local pass the
  shared gate lacks. documentation/agent-notes.md#the-shared-gates-from-2026-11-08
- `release.yml` keeps all four grants (`actions: read`, `contents: write`, `id-token: write`,
  `pull-requests: write`) and no `environment:` key: one grant short, GitHub refused every
  Release at startup for months. documentation/agent-notes.md#the-release-callers-grant-gate
- Every changeset is a `patch` until the operator says otherwise (2026-11-07); a release that would
  publish a `minor` waits for their okay. Never hand-edit `CHANGELOG.md`: the summary is the entry.
  documentation/agent-notes.md#the-changelog-generator
- No internal identifier (`NCPDP-7`, defect names, phase words) in a changeset: it ships in the
  tarball, and one in the first sentence refuses the release after the version PR merges.
  documentation/agent-notes.md#release-notesmjs-and-an-unregistered-item-id-prefix

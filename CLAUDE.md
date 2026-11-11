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
  among them (#43).
- Surface every transaction, compound ingredient, COB row, reject and DUR alert; a count mismatch
  warns, and an emit that cannot carry everything refuses with a typed build error: the serializer
  once dropped every Telecom transaction after the first (#77).
- A wire-code label or name list ships with its public source beside it, or not at all, and never
  from memory or the purchased NCPDP guides: 32 code meanings shipped unsourced and most were
  withdrawn (#74, #75).
- State the decoded version set only in `docs-content/conformance.md`: a sweep went green over three
  pages that restated it (#78).
- Prove a `scripts/phi-scan.ts` change red on a violator under `src/`, `test/` or `scripts/`, and
  keep a target enumerated but never read a refusal (exit 2): the scan once printed OK over files it
  never opened (#38, #72). Synthetic tokens go in `scripts/phi-allow-list.txt`.
- The gates are `@cosyte/script-utils` bins: `pnpm attw` runs `cosyte-attw` (`scripts/attw.ts`),
  never the bare `attw` CLI (it exits 0 on a tarball with no types, #52); `cosyte-internal-refs`
  reads `src/` string literals, which once carried "this phase" into consumers' logs (#124).
- `release.yml` keeps all four grants (`actions: read`, `contents: write`, `id-token: write`,
  `pull-requests: write`) and no `environment:` key: one grant short, GitHub refused every
  Release at startup for months (#80, #81).
- Never rename a required job or move a step out of one: the ruleset requires each by name, and a
  step outside a required job gates nothing (#37, #58).
- Every changeset is a `patch` until the operator okays a minor (2026-11-07). Never hand-edit
  `CHANGELOG.md`: the changeset summary is the entry (#64).
- No internal identifier (`NCPDP-7`, defect names, phase words) in a changeset: it ships in the
  tarball, and one in the first sentence refuses the release after the version PR merges (#65).

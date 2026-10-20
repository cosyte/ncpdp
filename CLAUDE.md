# @cosyte/ncpdp

`@cosyte/ncpdp` is our public, MIT-licensed TypeScript parser for the two NCPDP standards: Telecom
pharmacy claims and their responses (`@cosyte/ncpdp/telecom`) and SCRIPT XML ePrescribing
(`@cosyte/ncpdp/script`), with shared vocabulary in `@cosyte/ncpdp/common`. It parses leniently,
reporting quirks as warnings with stable codes, and writes only spec-clean output. Its API mirrors
the other `@cosyte/*` parsers, with `@cosyte/hl7` as the reference.

## Gate

From the repo root, in this order. `pnpm` means pnpm 10, the `packageManager` pin. If
`pnpm --version` says otherwise (pnpm 12 fails `install --frozen-lockfile` on `overrides`), run
`corepack enable --install-directory <dir> pnpm` and put `<dir>` first on PATH: tests spawn `pnpm`.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm phi-scan
pnpm test
pnpm test:coverage
pnpm build
pnpm attw
pnpm check:test-selection
pnpm check:no-emdash
pnpm check:no-internal-refs
pnpm publish --dry-run --no-git-checks --ignore-scripts
npm pack --dry-run --ignore-scripts
```

CI runs these from `.github/workflows/ci.yml` (the shared `cosyte/.github` pipeline on Node 22 and
24, and the `release-dry-run` job), `test-selection.yml`, `no-emdash.yml` and `no-internal-refs.yml`.
CI alone also runs a dual ESM/CJS load of `dist/`, actionlint, CodeQL, the shared pipeline's
pre-publish checks and `pnpm examples`; the CI installs those tools. Locally, the publish dry-run
refuses once the current version is on npm ("cannot publish over"), while CI's run still passes.

## Hazard

Telecom claims and SCRIPT prescriptions carry patient data, so a warning, a fixture or a log line
can leak it. A field read at the wrong offset, or a reject or DUR alert lost on the way, becomes the
wrong drug, dose or payment at a pharmacy counter.

## Rules

Each rule follows a failure. A backticked name starting with # is a section of
`documentation/agent-notes.md`.

- Diagnostic factories (`scriptWarning`, `telecomWarning`, the typed errors) take no value parameter, and nothing a sender chose reaches a message, a `position` path or an unbounded model field: five slots leaked wire values, an NDC and an Rx number among them. `#phi-warning-message-leak`, `#bounding-a-message-does-not-close-a-downstream-leak`
- Surface every transaction, compound ingredient, COB row, reject and DUR alert; a count mismatch is a warning, and an emit that cannot carry everything refuses with a typed build error. The serializer once dropped every Telecom transaction after the first (`CHANGELOG.md`, 0.1.0, `NCPDP_TELECOM_MULTI_TRANSACTION_TRUNCATED` removed).
- A wire-code label or a name list ships with its public source recorded beside it, or not at all: never from memory, and never text from the purchased NCPDP guides, which we do not redistribute. 32 code meanings shipped with no source and most were withdrawn, and a list written from recall invented transaction names. `#wire-code-labels-source-it-or-delete-it`, `#script_transaction_names-and-42-cfr-423160`
- State the decoded version set only on `docs-content/conformance.md`: the first sweep went green over three pages that still restated it. `#the-shape-hid-behind-two-asterisks`
- `pnpm attw` runs the wrapper `scripts/attw.mjs`; never call the bare `attw` CLI, which exits 0 on a tarball with no type declarations. `#attw-false-green-port`
- Prove a change to `scripts/phi-scan.ts` red on a violator seeded under `src/`, `test/` or `scripts/` (a temp-dir violator is never enumerated), and keep a target it enumerated but never read a refusal (exit 2). Synthetic tokens go in `scripts/phi-allow-list.txt`. `#the-argument-driven-collapse-routes`, `#the-completeness-rule-enumerated-and-never-read`
- `.github/workflows/release.yml` keeps delegating to the shared release pipeline with all four grants (`contents: write`, `id-token: write`, `pull-requests: write`, `actions: read`) and no `environment:` key: one grant short, GitHub refused the workflow at startup from June to late August 2026. `#the-release-callers-grant-gate`
- Never hand-edit `CHANGELOG.md`; the changeset summary is the entry, and the hand-kept file drifted. `#the-changelog-generator`
- Keep internal identifiers (`NCPDP-7`, uppercase defect names, phase words) out of every changeset: the whole summary ships in the tarball's `CHANGELOG.md`, and an unregistered one in the first sentence refuses the release after the version PR has merged. `#release-notesmjs-and-an-unregistered-item-id-prefix`

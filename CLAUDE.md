# @cosyte/ncpdp — Project Guide for Claude

This repo is managed with the **GSD (Get Shit Done)** workflow. Planning artifacts live in `.planning/` and are committed with the code. Sibling project: `@cosyte/hl7` at `../hl7-parser` — same tooling, same engineering bar.

## Project

**`@cosyte/ncpdp`** — a developer-focused NCPDP parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT).

**North star:** A developer can parse a real-world NCPDP Telecom claim response OR a SCRIPT NewRx XML and pull useful fields out in one line — without having read either (paywalled) standard.

NCPDP is two structurally unrelated standards under one brand. We ship both via subpath exports:

- `@cosyte/ncpdp/telecom` — Telecommunication Standard (vD.0 + vF6) — pharmacy claim protocol; field-id-keyed segments; FS/GS/RS framing
- `@cosyte/ncpdp/script` — SCRIPT Standard (v2017071 + v2022011) — XML ePrescribing via Surescripts
- `@cosyte/ncpdp/common` — shared vocabulary: NDC, NPI, DEA, SIG, dispense units, code lists

See `.planning/PROJECT.md` for full context, requirements, constraints, and key decisions.

## Status

- **Phase 0 — Initialized.** Next: `/gsd-discuss-phase 1`
- Roadmap: 8 phases, 155 v1 requirements mapped → see `.planning/ROADMAP.md`

## GSD Workflow

**Config** (`.planning/config.json`):

- Mode: `yolo` (auto-approve plans/execution)
- Granularity: `standard` (5–8 phases, 3–5 plans each)
- Parallelization: enabled
- Plan Check + Verifier + Nyquist Validation: enabled
- Commit docs: yes

**Typical phase loop:**

1. `/gsd-discuss-phase N` — gather context and clarify approach (especially Phase 1 — three load-bearing decisions flagged)
2. `/gsd-plan-phase N` — decompose phase into plans (with plan-check agent)
3. `/gsd-execute-phase N` — execute plans in parallel where possible, atomic commits
4. `/gsd-verify-work N` — verifier confirms deliverables match phase goal
5. `/gsd-validate-phase N` — Nyquist validation audits test coverage
6. `/gsd-transition` — update PROJECT.md, advance state

**Commands most likely needed:**

- `/gsd-progress` — status + routing
- `/gsd-next` — auto-advance to next logical step
- `/gsd-discuss-phase N --auto` — clarify context before planning
- `/gsd-plan-phase N` — plan a specific phase
- `/gsd-execute-phase N` — execute a planned phase

## Tech Stack (locked)

- **Language:** TypeScript (strict, `noUncheckedIndexedAccess`)
- **Target:** ES2022, dual ESM + CJS via `tsup`
- **Node:** 18+
- **Package manager:** pnpm
- **Testing:** Vitest
- **Linting:** ESLint + Prettier
- **Runtime deps:** **Zero on the Telecom side.** SCRIPT side is allowed an XML parser (TBD via Phase 1 ADR-002). Target ≤ 3 total runtime deps for the whole package; each justified in an ADR.
- **License:** MIT

## Architecture (load-bearing — pending Phase 1 lock-in)

Current lean: ONE package, subpath exports (`@cosyte/ncpdp/telecom`, `/script`, `/common`). Alternative: TWO packages (`@cosyte/ncpdp-telecom` + `@cosyte/ncpdp-script`) + shared internal `@cosyte/ncpdp-common`. Decision flagged for Phase 1 discuss-phase.

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export — feeds IntelliSense.
- Immutable transactions/messages by default. Mutation only via explicit methods.
- No `console.*` in library code. Throw typed errors or return results.
- Short, testable functions over big parsing blobs.
- Postel's Law: parsers are liberal (lenient default + warnings with stable codes and positional context — byte offset for Telecom, XPath for SCRIPT); serializers are conservative (always emit canonical NCPDP output).
- Fatal errors only for unrecoverable structural corruption. Telecom: `NCPDP_TELECOM_NO_HEADER`, `NCPDP_TELECOM_INVALID_FRAMING`, `NCPDP_TELECOM_UNSUPPORTED_VERSION`, `EMPTY_INPUT`. SCRIPT: `NCPDP_SCRIPT_NOT_XML`, `NCPDP_SCRIPT_NO_MESSAGE_ROOT`, `NCPDP_SCRIPT_UNSUPPORTED_VERSION`, `EMPTY_INPUT`. Everything else is a warning.
- SIG parsing is best-effort and clearly labeled lossy (JSDoc).
- Code lists are bundled versioned snapshots; snapshot date is part of the package version. No runtime fetch.
- Coverage target: ≥ 90% on `src/telecom/`, `src/script/`, `src/common/`, `src/helpers/`.

## Standards Licensing — Important

NCPDP charges for the standards documents and is more litigious about copyright than HL7. **We do NOT redistribute NCPDP-copyrighted text.**

- The wire format is fair game to parse.
- The code is ours; ship code, not their prose.
- Do not copy paragraphs out of NCPDP spec PDFs into JSDoc, README, or comments.
- Field-name labels and code descriptions in our code lists must be paraphrased / widely-known industry terminology, not lifted verbatim from NCPDP source.

If a contribution introduces material that looks copy-pasted from a paywalled NCPDP standard, treat it as a blocker until rephrased.

## EPCS — Out of Scope for v1

Electronic Prescribing of Controlled Substances (EPCS) requires DEA-regulated digital signature verification, HSM integration, and a different audit/certification posture. EPCS belongs in a separate `@cosyte/ncpdp-epcs` package. Do not add EPCS work to v1.

## Key Files

- `.planning/PROJECT.md` — vision, requirements, constraints, decisions
- `.planning/REQUIREMENTS.md` — 155 v1 REQ-IDs with phase traceability
- `.planning/ROADMAP.md` — 8-phase breakdown with success criteria
- `.planning/STATE.md` — current state (what's next)
- `.planning/config.json` — GSD workflow settings
- `.planning/adrs/` — architectural decision records (created during Phase 1)

When in doubt, read `.planning/ROADMAP.md` first to understand the phase structure and which phase a change belongs to.

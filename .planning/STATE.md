---
gsd_state_version: 1.0
milestone: v1
milestone_name: milestone
status: "Project initialized 2026-04-22 via /gsd-new-project. PROJECT.md / REQUIREMENTS.md / ROADMAP.md / config.json committed. 155 v1 REQ-IDs mapped across 8 phases (Foundation / Common / Telecom Core / Telecom Helpers+vF6 / SCRIPT Core / SCRIPT Helpers+SIG+Envelope / Profiles+Built-ins / Examples+Docs+Release). Three load-bearing decisions flagged for Phase 1 discuss-phase: one-package-vs-two, SCRIPT XML parser choice, PBM reject-code taxonomy depth. Next: /gsd-discuss-phase 1."
last_updated: "2026-04-22T00:00:00Z"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 36
  completed_plans: 0
  percent: 0
---

# @cosyte/ncpdp — STATE

Project memory for session-to-session continuity. Updated at phase/plan boundaries.

---

## Project Reference

- **Name:** `@cosyte/ncpdp`
- **Core value:** A developer can parse a real-world NCPDP Telecom claim response OR a SCRIPT NewRx XML and pull useful fields out in one line — without having read either (paywalled) standard.
- **Current focus:** Phase 0 — initialized. Next: `/gsd-discuss-phase 1` to resolve three load-bearing decisions (one-package-vs-two, SCRIPT XML parser choice, PBM reject-code taxonomy depth) before planning Phase 1.
- **Workflow config:** standard granularity, yolo mode, parallelization enabled, plan-check + verifier + Nyquist validation on, auto-advance on. Mirrors `@cosyte/hl7`.

## Current Position

Phase: 0 (initialization complete; Phase 1 not yet started).
Next Step: Run `/gsd-discuss-phase 1` to clarify the three flagged decisions before `/gsd-plan-phase 1`.

- **Milestone:** v1
- **Phase:** 0 (initialized)
- **Plans (milestone total):** 0 / 36 anticipated
- **Status:** Project initialized; planning artifacts committed.

```
[░░░░░░░░░░░░░░░░░░░░] 0%   (0 / 8 phases)
```

## Performance Metrics

- **Phases completed:** 0 / 8
- **Plans completed:** 0 / 36 anticipated
- **REQ-IDs validated:** 0 / 155
- **Known coverage:** N/A (no source yet)

## Phase Pipeline (anticipated)

| Phase | Name | Plans | Key REQ Categories |
|-------|------|-------|-------------------|
| 1 | Foundation & Architecture Lock-In | 4 | SETUP-* |
| 2 | Shared Vocabulary Layer | 4 | COMMON-* |
| 3 | Telecom Parser Core (vD.0) | 5 | TC-PARSE-*, TC-MODEL-*, TC-TOL-* |
| 4 | Telecom Helpers, Serialization & vF6 | 4 | TC-HELP-*, TC-SER-*, TC-F6-* |
| 5 | SCRIPT Parser Core | 5 | SC-PARSE-*, SC-MODEL-*, SC-TOL-* |
| 6 | SCRIPT Helpers, Structured SIG & Serialization | 4 | SC-HELP-*, SC-SIG-*, SC-SER-* |
| 7 | Profile System & Built-ins | 5 | PROF-*, BIP-* |
| 8 | Examples, Starter Kit, Docs & Release | 5 | KIT-*, EX-*, DOC-*, TEST-* |

## Decisions Flagged for Phase 1 Discuss-Phase

1. **One package vs two** — current lean is one package with subpath exports (`@cosyte/ncpdp/telecom`, `/script`, `/common`); alternative is two packages + shared internal `@cosyte/ncpdp-common`. Lock in ADR-001 before Phase 2 starts.
2. **SCRIPT XML parser choice** — evaluate `fast-xml-parser`, `xmldoc`, `@xmldom/xmldom`, `libxmljs2` against namespace handling, round-trip fidelity, bundle size, maintenance, license. Reuse `@cosyte/ccda` decision if that project exists. Lock in ADR-002.
3. **PBM reject code taxonomy depth** — minimal (critical codes only) vs comprehensive (every published code) per built-in PBM profile. Decide here so Phase 7 plans are sized correctly. Lock in ADR-003.

---

*Last updated: 2026-04-22 — project initialized.*

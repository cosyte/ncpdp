---
"@cosyte/ncpdp": patch
---

Wire the em-dash gate into CI (`EMDASH-CONFORMANCE`).

Adds `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) and a dedicated
`.github/workflows/no-emdash.yml` job enforcing the brand ban on `U+2014` over both
halves the rule covers: the tracked files, and the PR title, body, and commit messages.
The workflow carries the non-default `edited` pull-request trigger, so retitling a PR
re-checks it, which matters because this repo squash-merges.

No content changed. ncpdp was measured clean before the port (0 of 25 markdown files,
0 of 160 tracked files). The script is the text-only variant taken from `knowledgebase`,
matching `hl7`, `fhir`, and `pathways`; it omits `grep -I`, which is safe here because no
tracked file holds a NUL byte and every one decodes as UTF-8. Tooling only: no runtime,
public-API, or parse-behavior change.

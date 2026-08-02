# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

## [Unreleased]

The first pre-alpha release (`0.0.1`) will ship the initial public API surface. The package begins
its public history at `0.0.x`, per the cosyte version ladder (`0.0.x` until first alpha).

### Fixed

- **NCPDP-PHI-SCAN-CONTENT-RESIDUALS: one stray separator byte silenced the PHI commit-gate over a
  whole prescription, and the extension fallback would not answer to `.XML`.** Both were measured by
  `NCPDP-PHI-SCAN-DISPATCH` below, found identical on its base, and left open there. Repo tooling
  only: no published API, type, warning code or parse result changes.

  **The sharper one, measured red on `e1d9a34` before any fix.** `detectFormat` tested the Telecom
  separators _instead of_ the XML-document test rather than alongside it, so a file satisfying both
  went to the Telecom tokenizer, which finds no field ids in XML. A complete, well-formed SCRIPT
  document carrying `<LastName>`, `<FirstName>`, `<DateOfBirth>` and `<AddressLine1>`, plus a single
  `0x1C` inside an unrelated `<Note>`, scored **0 hits at every extension, `.xml` included**, and the
  gate printed `OK`; the identical document without that byte scored 4 at every extension. One byte
  of corruption, in an element the patient block does not touch, silenced the whole gate, and
  content-first dispatch did not help because the content test itself was what mis-fired.

  **Fixed as a union, not as a precedence.** `detectFormats` now returns every format the content
  signals, and a payload signalling both is scanned by both (telecom, then script). Choosing a winner
  would only have moved the hole: ranking the XML signal first takes the field-id scan off a Telecom
  transmission carried inside an XML envelope, which is now its own pinning test. No target is handed
  a scanner its own content did not signal, so the catch is bought without widening the
  false-positive surface, which is the constraint that deleted the path predicate in the first place.
  The cross-cutting shape pass moved up into `scanTarget` so it still runs exactly once per target,
  rather than once per structural scanner.

  **The second: the extension fallback now folds case**, as `isScannable`'s own `.md` test already
  did. Measured on `e1d9a34`: a `.xml` fragment scored 1 hit where `.XML` and `.Xml` scored 0, and a
  separator-less `.ncpdp` field token scored 1 where `.NCPDP` scored 0. **The fallback arm itself was
  not removed to get there.** It is what keeps a `.xml` fragment fixture and a separator-less
  `.ncpdp` token structurally scanned; deleting it would have made this a trade instead of a
  superset, and it is pinned against exactly that.

  Proven as a differential rather than asserted: 216 probes across 18 payload shapes and 12
  extensions, base vs head, **zero hit locations lost, no exit code going 1 to 0, no duplicated hit
  line, and 42 probes strictly gained**, with the committed corpus unchanged at 120 files / 0 hits.
  **Trust the invariants, not the integers**, for the same reason the entry below says so: that probe
  harness is ad hoc and not in the tree, so the counts record one run while _zero lost_ and _no exit
  going 1 to 0_ are the properties.

  **Both residuals now have pinning tests, which was as much the deliverable as the fix**, and the
  inventory is still not a closed list. What it holds now, both narrower and both newly executable:
  the fallback matches a whole suffix, so a fragment named `.xml.bak` or `.ncpdp.orig` gets the text
  pass; and a separator-less Telecom payload is reachable only through that fallback, so one named
  neither `.ncpdp` nor `.xml` is invisible to the field-id scan. The embedded-in-a-string-literal gap
  below is unchanged and still deliberate. This is a missed catch in a commit gate over
  synthetic-only fixtures: no shipped parse behavior was involved in either defect.

- **NCPDP-PHI-SCAN-DISPATCH: the PHI commit-gate picked its scanner from the file NAME, so a real
  prescription in a file with the wrong extension was never read.** `detectFormat` in
  `scripts/phi-scan.ts` opened with a path predicate (`test/` prefix, or a `.ncpdp` / `.xml`
  extension) and returned "not an NCPDP message" for everything else, dropping the file to the
  conservative dashed-SSN + email pass. Repo tooling only: no published API, type, warning code or
  parse result changes.

  **Measured on `1cfe029` before any fix: one byte-identical SCRIPT document scored 2 hits as
  `.xml` and exit 0 as `.ts`, `.txt`, `.dat` and `.json`.** It also scored **exit 0 as `.ncpdp`**,
  where the extension short-circuit routed an XML document into the Telecom tokenizer, which finds
  no field ids in it. Both directions are one defect: an extension outranking the bytes in front
  of it.

  Detection is now content-first at every path, in this order: NCPDP control-char separators mean
  Telecom; an XML document (leading `<` after BOM and whitespace, plus an element tag) means
  SCRIPT; and **only then** the extension, as a fallback for a payload that says nothing about
  itself. That last arm is deliberate, not leftover: it is what keeps a `.xml` fragment fixture
  (leading prose, so not a document) structurally scanned, and it is what makes this a strict
  superset rather than a trade. Proven as a differential rather than asserted: 77 probes across 7
  payload shapes and 11 extensions, base vs head, **22 hits to 188 with zero lost and no exit code
  going 1 to 0**, with the committed corpus unchanged at 120 files / 0 hits. **Trust the invariants,
  not the integers.** That probe harness is ad hoc and is not in the tree, so the two counts are not
  reproducible from anything committed and are a record of one run; _zero lost_ and _no exit going 1
  to 0_ are the properties, and they reproduced on two independently-built corpora during review
  (1,014 probes and 99 probes), which the counts did not and cannot.

  **The path predicate was deleted rather than widened, and the residuals it leaves are
  deliberate.** The headline one: a message _embedded_ in a string literal (a SCRIPT fragment inside
  a `.ts` test, or a JSDoc `@example` under `src/`) is still not structurally scanned anywhere,
  because the payload as a whole is not a document; it is checked for dashed SSNs and non-test
  emails, not for names or DOBs. Sniffing NCPDP messages out of arbitrary TypeScript is a separate
  job with its own false-positive surface, and a PHI gate that cries wolf gets bypassed, which is
  worse than a known gap. That gap is now **executable**: `test/scripts/phi-scan.test.ts` pins it,
  so a later change that moves it reds a test.

  **It is not the only one, and the inventory is not a closed list.** Two more, both measured
  identical on `1cfe029` and so untouched here rather than introduced: a single stray `0x1C` /
  `0x1D` / `0x1E` byte anywhere in an otherwise well-formed SCRIPT document routes the WHOLE
  document to the Telecom tokenizer, which finds no field ids in it, so a complete prescription
  scores **0 hits at every extension including `.xml`**; and the extension fallback matches
  case-sensitively, so a fragment fixture named `.XML` gets the text-only pass where `.xml` gets the
  structural one. Both are written up in `phi-scan-overrides.md`. Neither is fixed here: precedence
  between two content signals, and extension normalization, are their own decisions and this slice
  had already spent its widening.

  **A test asserted the opposite of its own title, which is why this read as covered.** "scans a
  mis-extensioned XML fixture by content (still catches PHI)" asserted exit 0, with a comment
  explaining why nothing was caught: a faithful description of the code and a false description of
  the gate. The assertion was corrected to match the title, not the reverse.

  **What was demonstrated, and how, stated precisely rather than as a round number.** Three of the
  new or corrected tests were run RED against the previous scanner itself: the corrected
  mis-extensioned test, and the same-bytes-every-extension differentials for SCRIPT and for Telecom
  (which assert _sameness_, so within their extension lists they red on a name-keyed gate whatever
  shape it takes, for any self-identifying payload; those lists are finite, and a gate keyed on a
  name outside them is invisible to both). The remaining two could not be, and saying they
  were would be the same species of defect this entry is about. The `.xml`-fragment test
  characterizes coverage the previous scanner ALREADY had, so it is green on both trees by
  construction; it was instead demonstrated red against a seeded head scanner with the two extension
  fallback arms deleted, which is the regression it exists to catch. The embedded-literal residual
  test pins behaviour this slice deliberately did not change, so it is green on both trees on
  purpose; its companion assertion (a dashed SSN in the same embedded literal IS caught) is what
  keeps it from being vacuous.

### Changed

- **NCPDP-SCRIPT-VERSIONS: `KNOWN_SCRIPT_VERSIONS` is now `2017071` + `2023011`** (it was
  `2017071` + `2022011`). US federal regulation names exactly two SCRIPT Implementation Guide
  versions for electronic prescribing: **45 CFR 170.205(b)** adopts `2017071` at (b)(1) and
  `2023011` at (b)(2), and **42 CFR 423.160** requires compliance with a standard in that paragraph
  at (b)(1) and incorporates both guides by reference at (c)(2) and (c)(3). `2022011` is named in
  neither, so the package modeled a version the rule does not adopt while treating an adopted one as
  unrecognized.

  **Consumer-observable, in both directions.** A `2023011` message now classifies as `known` and no
  longer raises `NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED`; a `2022011` message now raises it
  where it did not before. Neither is refused: a present-but-unrecognized stamp has always been read
  best-effort and still is, so no parse result changes shape. `KnownScriptVersion` is derived from
  the list, so a TypeScript consumer annotating a value with it can no longer assign `"2022011"` and
  can now assign `"2023011"`.

  This degrades on a date, not on a defect: 45 CFR 170.205(b)(1) states the Secretary's adoption of
  `2017071` **expires on January 1, 2028**, after which `2023011` is the only version that paragraph
  adopts.

  **The list was re-derived, not copied from the report that flagged it.** Both sections were
  re-fetched on 2026-08-01 from two separately-retrieved publications of the CFR text (the eCFR
  versioner API, title 45 issue date 2026-07-24 and title 42 issue date 2026-07-20; and the Cornell
  LII mirror). Those are two independent retrievals rather than two independent derivations, since
  Cornell republishes the same underlying OFR/GPO data, so their agreement rules out a fetch or
  transcription error and nothing more. The absence of
  `2022011` was measured by extracting every 7-digit version token from the fetched section text with
  a passing negative control, because asserting a version is absent needs the same evidence as
  asserting it is present. The provenance is recorded in a source comment above the list. The
  neighbouring `SCRIPT_TRANSACTION_NAMES` list was re-checked against the same fetched text and is
  unchanged: all 36 names still match 42 CFR 423.160(b)(1)(i)(A) through (Z) exactly and in order.

  Note for anyone citing this later: the operative adoption is **45 CFR 170.205(b)**, not
  42 CFR 423.160(c). The latter incorporates the guides by reference; the former is what adopts them
  and what carries the 2028 expiry.

- **The `surescripts` built-in profile loses its `version-stamp-variance` quirk.** The quirk claimed
  trading partners stamp SCRIPT versions beyond the explicitly-modeled set, and the only fixture
  grounding it was stamped `2023011`. Once that version is modeled the fixture demonstrates nothing,
  and re-stamping it would have meant inventing a version identifier no public source backs, which
  the locked no-invented-quirks rule forbids, so the quirk was deleted rather than re-grounded.
  `profiles.surescripts.describe()` now reports one quirk instead of two and drops
  `NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED` from its `expectedWarnings` union, so
  `partitionWarnings` sorts that code into `unexpected` for that profile; the profile `description`
  changed to match. The underlying tolerance is unchanged and still covered by `classifyVersion`.
  The fixture is kept and renamed `surescripts-version-2023011.xml`, now serving as the end-to-end
  guard that a `2023011` message parses with no version warning. Three unrelated SCRIPT fixtures
  that happened to carry the `2022011` stamp (`error-response.xml`, `newrx-coded-and-strength.xml`,
  `newrx-sig-disagreement.xml`) were re-stamped `2023011` so they keep measuring what they were
  written to measure rather than silently acquiring a version warning.

- **PHI-WARNING-MESSAGE-LEAK: warning and error messages now come from a frozen registry, and
  the factories that build them take no value argument at all.** `scriptWarning(code, position)`
  and `telecomWarning(code, position)` lost their `message` parameter; `NcpdpScriptParseError`,
  `NcpdpTelecomParseError`, `NcpdpScriptBuildError` and `NcpdpTelecomBuildError` lost theirs
  too. Text comes from `SCRIPT_WARNING_MESSAGES`, `TELECOM_WARNING_MESSAGES`,
  `SCRIPT_FATAL_MESSAGES`, `TELECOM_FATAL_MESSAGES`, `SCRIPT_BUILD_MESSAGES` and
  `TELECOM_BUILD_MESSAGES`, all exported and all frozen. **Breaking for anyone calling those
  constructors directly**; `code` and `position` are unchanged, so consumers reading warnings are
  not affected beyond the wording.

  The defect this closes was reproduced against the published `0.0.4`, not inferred. Five slots
  echoed consumer-controlled input into a diagnostic: a SCRIPT root element name and an unmodeled
  SCRIPT transaction element name each reached a `message` **and** a `position.path`; two SCRIPT
  fatal paths reached `err.snippet`; and a Telecom Segment Identification value reached a
  `message`, which is where an NDC and a prescription number were reproduced, because a dropped
  field separator runs the rest of the segment into that field. Six more messages interpolated a
  count or a caller-supplied field id.

- **Two structural identifiers on the model are now bounded, which is the half a message fix does
  not reach.** A diagnostic-surface fix protects your diagnostics; it does not protect a package
  that reads your model and builds its own. `TelecomSegment.segmentId` is now always exactly two
  characters or empty: an `AM` field whose value is not a Segment Identification code is left in
  `segment.fields`, verbatim and byte-for-byte round-trippable, and raises the new
  `NCPDP_TELECOM_MALFORMED_SEGMENT_ID`. `UnsupportedBody.transaction` is now optional and is
  populated only from the new closed `SCRIPT_TRANSACTION_NAMES` vocabulary, so a sender-chosen
  element name is never copied onto the model; the serializer emits a fixed
  `<UnsupportedTransaction/>` for an unnamed one and stays idempotent. That vocabulary is the
  transaction list published in **42 CFR 423.160**, verbatim, which is public law rather than the
  paywalled standard. The first draft of it was written from memory: it invented three transfer
  names and both recertification names and omitted the entire prior-authorization and REMS
  families, which would have silently stripped the identity off every ePA message.
- **`NcpdpScriptParseError.snippet` is removed.** It was capped at 64 characters and documented as
  a redaction boundary, but the cap bounded length and said nothing about content, and it was only
  ever raised on paths where the input is too broken to say where those characters came from.
  `NcpdpScriptBuildError` and both Telecom errors had already refused a snippet for exactly that
  reason; this makes the four agree. Nothing in the package carries a raw-input snippet now.
- **Telecom fatal and builder messages no longer quote an input length or a caller-supplied field
  id.** `NcpdpTelecomBuildError` gains `headerField`, typed `keyof TelecomHeader`, so a
  header-scoped rejection still says which of the nine slots it was without quoting the value.
- **`buildTelecomRequest` now enforces the same 2-character Segment Identification bound the parser
  does**, with the new `NCPDP_TELECOM_BUILD_INVALID_SEGMENT_ID`. Without it the `segmentId` bound
  held on the parse path only while the model documented it unconditionally, and a downstream
  package cannot tell a parsed transaction from a built one. `SEGMENT_ID_LENGTH` is exported.
- **PUBLIC-SURFACE-HYGIENE: internal project bookkeeping removed from every surface a
  consumer reads, and a gate added under it.** The gate raises the floor rather than
  sealing the category: it catches identifiers, ADR references, phase-plus-token forms,
  meta-repo paths and traceability markers, but `phase` ending a clause ("decoded this
  phase.") is a stated residual it does not cover, and prose about our process stays a
  reviewer's catch. Founder directive, 2026-07-27: a
  README, a docs page, an npm description, a JSDoc block or a warning message says what the
  software does and what changed, never which internal item or phase produced it. Swept,
  re-measured on `34315b5` with the final rule set: **38** violating lines across the public
  markdown surface (`docs-content/spec-notes-*.md` titles and headings carrying
  `NCPDP-4`..`NCPDP-9`, "Phase N" framing, "what this slice does" headings, the
  "accuracy-gate spec-traceability requirement" / "Field-ID gate" process commentary, and
  three ADR citations written as file paths; plus `KNOWN-LIMITATIONS.md` and `README.md`),
  **19** `src/` doc-comment lines that compile into `dist/*.d.ts` and render in a consumer's
  editor (the built `dist/index.d.ts` went from 33 such lines to 0), and **6** runtime
  warning messages that reached a consumer's log saying a code was "not modeled this phase".
  Two stale public claims were corrected in passing: `spec-notes-telecom.md` still listed
  response decode as something the library does not do, and **four** status lines pinned a
  published version (`0.0.1`) that the registry had moved past. An earlier draft of this
  entry said 35 and three; both were counted before the ADR rule was widened, and they are
  corrected here rather than left standing.
- **Two doc comments corrected while being de-jargoned.** `@cosyte/ncpdp/script`'s module
  documentation described only a NewRx structural read, omitting the response and
  prescription-lifecycle transactions, the structured SIG view, the serializer and the
  builders it has exported for some time.

### Added

- **A diagnostic-surface PHI gate covering every position a sender controls in both wire formats,
  built on `assertNoDiagnosticPhiLeak` from `@cosyte/test-utils` (bumped to `^0.0.2`; a caret on a
  `0.0.x` version resolves exactly, so the pin bump is what selects the runner).**
  `test/phi/diagnostic-surface.test.ts` declares 47 slots, 17 SCRIPT and 30 Telecom: element,
  transaction and outcome names; attribute values; `<Code>` values; the fixed Transaction Header
  fields; segment ids and field ids; NDC, prescription-number, cardholder, group, prescriber,
  prior-authorization, processor-control-number and reject/DUR/status slots; and the fatal paths.
  Each slot names the diagnostic code it must reach, and the runner fails a slot whose code never
  appeared, so a probe that quietly misses its branch is a red rather than a pass. It was run
  against the unfixed parser first and caught five leaks; the table, not the fix, is the artifact.
  Alongside it, a slot-independent assertion that every warning message is byte-identical to its
  registry entry, over a corpus that reaches **every** code on both standards.
- **`SCRIPT_TRANSACTION_NAMES`**, the closed vocabulary of SCRIPT transaction element names this
  parser will repeat. Being incomplete is safe by design: an unlisted transaction is surfaced as
  unmodeled and unnamed.
- **The Cosyte lockup at the top of `README.md`, in a light cut and a dark cut.** The
  package README had no image at all; it now opens with a `<picture>` block serving
  `cosyte-lockup-tile-on-dark-1200x300.png` to viewers reporting
  `prefers-color-scheme: dark` and `cosyte-lockup-tile-on-light-1200x300.png` to everyone
  else, both from `https://cosyte.com/tile/`. The markup and both URLs were copied
  programmatically out of `@cosyte/hl7`'s README and diffed byte for byte against it rather
  than retyped, because a single wrong character in either URL is a broken image on a public
  package page; both were confirmed `200 image/png` before this landed. The `# @cosyte/ncpdp`
  heading and the summary line under it are untouched: the artwork reads "Cosyte" and the
  heading names the package, so the two say different things and nothing is duplicated. On
  npmjs.com the `<img>` is hoisted out of the `<picture>` by the site's own anchor wrapper, so
  the light cut renders there, which is the correct one because npmjs.com has no dark mode.
  No documentation text, no API surface and no behaviour changed.
- **`pnpm check:test-selection` (`scripts/check-test-selection.ts`) plus its own required
  CI check (`test-selection`).** No published-package change; this is a development gate
  and is not in the tarball. A required _job_ gates its _steps_, not what those steps
  _select_, and the entire test suite of this repo hung off one repo-local `include` glob
  in `vitest.config.ts`: the shared `@cosyte/vitest-config` supplies no `include` of its
  own and spreads this repo's `test` block last. Narrowing that line to `test/script` and
  `test/telecom` would have stopped running `test/scripts/phi-scan.test.ts` and the whole
  `test/property` fuzz layer while every required check stayed green, and **coverage could
  not backstop it**, because coverage is measured over `src/**/*.ts` only, so dropping
  either costs approximately zero coverage percent. That is what made it silent rather than
  merely risky. The gate compares the test files that **exist** (`git ls-files`) against
  the test files vitest would actually **run** (`vitest list --filesOnly`) and reds on any
  shortfall **in its subject**, which is three sets unioned and is not every test file. Only
  `test/property` and the PHI suite are watched by a name-independent rule; the other 20 of
  24 test files are watched by the `.test.`/`.spec.` filename shape alone, so
  `git mv test/sanity.test.ts test/sanity.checks.ts` stops that suite running and the gate
  still prints OK. That is the largest known hole, it is stated in the header's limits, and
  the OK line now prints how many tracked `test/**` modules no rule is watching (today 3, all
  of them real helpers under `test/_helpers/`) so a rename that stays under `test/` is visible
  to a reviewer even though nothing reds. That tripwire is bounded, not universal: a rename
  that also leaves `test/` drops out of the subject and out of the count together. Closing it means deriving more subjects from workflows,
  never widening the name pattern. Four shape decisions are load-bearing. It observes the **resolved** selection
  rather than parsing the globs, so an `exclude` and a `projects` split written into the
  config are caught alongside a narrowed `include`. A config body that **branches on its
  own invocation** is _not_ caught, and an earlier draft of this entry wrongly claimed it
  was: the gate resolves the config under `vitest list` while CI runs it under
  `vitest run`, so an `include` keyed on `process.argv` can answer the two differently. It
  separately checks **the invocation**, because `vitest list` resolves the config and
  cannot see the command line. That rule **does not parse**: the `test` and `test:coverage`
  bodies must equal one of two exact strings (`vitest run`, `vitest run --coverage`), so a
  path filter, an alternate `--config`, a `--project`, a `--shard`, a wrapper and a
  delegation to another script are all simply not one of those two strings. Three
  successive parsing versions each shipped an evasion a refuter found, because analysing a
  shell string is unbounded; the exact-match rule has no spelling to miss. Its two headline
  subjects are **derived from committed files that exist for their own reasons**, the fuzz
  workflow that names `test/property` in order to run it and `run-phi-scan: true` in the CI
  caller, so a subject can only leave the gate's scope by a visible edit to a reviewed
  workflow. Under a derived path the subject is **every module regardless of filename, with
  no exemption at all**; a helper may not live under one, and this repo's single helper moved
  to `test/_helpers/fuzz-config.ts` to satisfy that. The PHI rule likewise requires **every**
  tracked `test/**` module referencing the scanner to be selected. Both rules previously
  matched text and both were forgeable by collision, all measured green: the helper exemption
  (named `_*` **and** imported by something that runs) was a bare substring search over the
  concatenated text of every selected file, so the XXE suite renamed to `_helpers.ts` passed
  (15 of 24 selected suites contain that substring) as did a `_`-prefixed directory
  (`_x/parse.ts`; `parse` appears in 21 of 24); and the PHI rule, inverted to avoid reddening
  on a comment, was satisfied by a rename to `phi-scan-suite.ts` plus a planted comment while
  the suite no longer ran. Deleting the exemption rather than narrowing it a third time is the
  move the invocation rule already made. One **residual is stated rather than closed**: the PHI
  subject is still text-derived, so stripping the reference from a renamed suite _and_ planting
  one in a running file still passes; matching an import specifier would close it, and does not
  apply yet because this PHI suite spawns the scanner instead of importing it. It also
  **demonstrates its own redness on every run**: three self-tests seed the removals it exists
  to catch, one resolving a genuinely narrowed vitest config through real vitest, and it exits
  non-zero if its own rules fail to red. Self-test A drops each protected file **one at a
  time**, leaving the others selected; hiding them all at once, as it used to, exercises only
  the collision-free case, which is why the two substring rules passed their own self-test
  while blind. Confirmed red by seeding each route separately: a narrowed `include`; an added
  `exclude`; deleting `test/property`; positional filters written as `vitest run <p>` and
  `vitest --run <p>`; `--config=`, `--project=`, `--dir=`, `--shard=`; a body that never names
  vitest at all (`pnpm run test:unit`, `node node_modules/vitest/vitest.mjs run <p>`,
  `sh -c '...'`); renaming a fuzz suite to `.spec.ts`, `_xxe.ts`, `_helpers.ts` and
  `_x/parse.ts`, and the PHI suite to `.checks.ts` and to `phi-scan-suite.ts` with a planted
  comment elsewhere; flipping `run-phi-scan` to `false`; and deleting the PHI suite. Removing
  every workflow mention of the fuzz path makes it **refuse to report** rather than pass
  vacuously. **These routes are closed, which is not the same as the selection being
  uncollapsible**: the gate does not see which script the shared pipeline elects to invoke, nor
  package scripts other than those two, nor anything a workflow runs inline, nor a config that
  branches on its own invocation, and selection is necessary but never sufficient.
- **`pnpm check:no-internal-refs` (`scripts/check-no-internal-refs.sh`) plus its own CI
  workflow**, ported from the `hl7` reference gate and re-derived for NCPDP. Six rules
  (item identifier, phase/wave language, ADR reference, internal jargon, meta-repo path,
  traceability marker) over four passes: the public markdown surface line by line and
  paragraph-joined (so a violation that straddles a hard wrap cannot hide), the `src/` doc
  comments that reach `dist/`, and -- new here, not in the `hl7` copy -- the `src/` string
  literals that reach a consumer as warning-message text. The identifier rule keys on known
  project prefixes and **never on the `WORD-N` shape**, which matters more in this package
  than anywhere else: `NCPDP-7` is ours but `NCPDP-SCRIPT`, `NCPDP-D.0`, `439-E4`, `511-FB`
  and the `SYNTH-MSG-0001` example ids are the reference material the docs exist to
  provide. Every one of those is asserted in a negative self-test that refuses to let the
  rules be widened into the trap.

### Security

- **PHI-SCAN-EMPTIABLE: the PHI commit-gate could be collapsed to scanning
  nothing while printing `OK`, and the repo's own test asserted that was
  impossible.** No published-package change; `scripts/phi-scan.ts` is a
  development gate and is not in the tarball. `pnpm phi-scan --allow-fixture X`
  with **no positional path** seeded `scanPaths` from `allowFixtures`, which
  flipped `mode` to `"paths"`, so the target set became `[X]` and was then
  subtracted, leaving an **empty scan that reported `OK: no hits` and exited
  0**. Reproduced before the fix: a seeded violator fixture went from exit 1 on
  a direct scan to exit 0 under the bare flag. The only thing making it
  unreachable in practice was that `phi-scan-overrides.md` read `(none yet)`
  under `## Entries`, so `--allow-fixture` exited 2 for a different reason
  entirely: one markdown commit removes that, so the safety was incidental,
  not designed.
  **Three invariants now close the argument-driven routes to that**, all exiting
  2: `--allow-fixture` is purely subtractive
  and never seeds the target set; an `--allow-fixture` path that matches no
  scanned file is refused (an inert override reads as a live bypass while doing
  nothing, which is how a stale log drifts); and a target set emptied by
  overrides or by roots resolving to nothing is refused, with `--staged` and
  nothing staged the one legitimate empty scan. Every report line now carries
  the **denominator** (`N file(s) scanned`), so an `OK` cannot be read without
  the number it is an `OK` over.
  **The false assertion is deleted, which was the more dangerous half.**
  `test/scripts/phi-scan.test.ts` claimed "the override, not an empty target
  set, is what flips the next run to clean" while exercising a violator written
  to an **OS temp directory** that an all-mode scan never enumerates, so the
  test passed for exactly the reason it denied. The replacement seeds real
  violators under a scan root, overrides one, and asserts the **other is still
  caught**, plus the denominator. Every new test was confirmed **red** against a
  re-seeded version of the defect it covers, so the suite now observes the bugs
  it used to certify away. The file went from 34 tests to **44**.
  **The second narrowing is closed too:** the scan roots were hardcoded to
  `test/fixtures/` and `src/`, leaving all of `test/` outside `fixtures/`
  unscanned. They are now a single `SCAN_ROOTS` list (`src/`, `test/`,
  `scripts/`) shared by both the full walk and the `--staged` filter, so a
  narrowing has exactly one visible place to happen. The corpus went from **85**
  to **118** files scanned, 33 more, and surfaced **one** hit to triage: a
  literal non-test email address inside the scanner's own test file, used as a
  deliberate violator. It is now assembled from parts at runtime, the way that
  file's digit sentinels already were, rather than allow-listed, which would
  have defeated the test that uses it.
  **A third collapse route, found by the refuter on this slice, is fixed with
  it.** `--staged` enumerated with `git diff --cached --diff-filter=AM`, which
  does not match an `R` entry, and git detects renames by default. So a fixture
  that was `git mv`'d **and** edited to add real PHI in the same commit was
  staged and never opened, and the pre-commit hook printed `OK` over the count
  of the _other_ staged files: a plausible denominator over an unobserved file.
  Now enumerated with `--no-renames`, which decomposes the rename into `D` + `A`
  so the destination path is listed. A second review pass found the same shape
  again in `T` (typechange: a tracked symlink replaced by a regular file
  carrying PHI), and that repetition is the actual finding: `--diff-filter=AM`
  was an **allow-list of git status letters**, the wrong polarity for a safety
  gate, because every letter it did not name was dropped silently. It is now
  `--diff-filter=d`, "everything except deletions", so an unfamiliar or future
  status costs a wasted scan instead of a missed file. `--staged` also had no
  test coverage at all, the mode the pre-commit hook uses; it now has five, run
  against a throwaway git repo rather than this repo's index, and the rename and
  typechange tests each assert git actually produced that status before
  asserting the scanner caught the PHI.
  **Claims corrected rather than defended.** An earlier draft of this entry said
  the gate "cannot report success over an unobserved corpus" and that the corpus
  went from 40 files; the first is false in the direction the rename bug proves
  (the invariants constrain the target set, not what the enumerator lists) and
  the second was never measured (the base roots scanned 85). Residuals are now
  written down in `phi-scan-overrides.md` rather than implied away: symlinked
  fixtures are still skipped (`walk` tests `isFile()`), a one-file scan is a
  truthful near-empty scan, and a `.ts` under `test/` gets the conservative text
  pass, so a message embedded in a string literal is checked for dashed SSNs and
  emails but not for names or DOBs. That list is explicitly **not** closed: a
  first draft published a complete inventory of what was left, the typechange
  finding proved it incomplete, and the documents now say so instead of
  reasserting it. `pnpm phi-scan` remains a **floor, not the gate**.
- **`fast-xml-parser` advisory remediation (runtime dependency; affects
  published consumers).** Raised the sole runtime dependency
  `fast-xml-parser` from `^5.9.3` to `^5.10.1` and regenerated the lockfile so
  it resolves to `5.10.1`, remediating **GHSA-8r6m-32jq-jx6q** (HIGH: a
  DOCTYPE entity-expansion counter that was not reset between parses, fixed in
  `5.10.1`). The floor is bumped, not just the lock, so a future lockfile
  regeneration cannot fall back to a vulnerable `5.9.x`. This is an in-range
  patch under the ratified XML-parser choice (ADR 0001) with no API or
  behavioral change. The full test suite is unchanged and green, and the
  package's own XXE hardening (entity resolution disabled) already mitigated
  the vector; this closes it at the dependency. `pnpm audit --prod
--audit-level high` is clean again.
- **PHI commit-gate armed (both wire formats).** A zero-dep, NCPDP-shape-aware
  scanner (`scripts/phi-scan.ts`, `pnpm phi-scan`) refuses fixtures / `src/`
  carrying real-PHI-shaped tokens, so a developer cannot commit a real-looking
  NCPDP message by accident. **SCRIPT (XML)** is scanned by an element-stack walk
  (case- + namespace-insensitive) covering patient AND prescriber
  `<LastName>`/`<FirstName>`/`<MiddleName>`, `<DateOfBirth>`, `<SocialSecurity>` /
  `<CardholderID>` / member-id elements, address lines, and phones, tag-scoped, so
  `<BusinessName>` / `<DrugDescription>` never trip a name detector. **Telecom
  Standard** is tokenized on the NCPDP separators (FS/GS/RS) and keyed off the
  self-identifying 2-char field ids (Patient name CA/CB, DOB C4, Street Address CM,
  Phone CQ, Patient ID CY, Cardholder ID C2, Cardholder name CC/CD), so a corrupt
  Segment Identification cannot bypass a per-field detector; a DOB field fails
  **closed** (a date the normalizer cannot read is still flagged). Dashed SSN and
  non-test email are caught anywhere. The scanner is deliberately independent of the
  package's own `fast-xml-parser`. A safety gate must not share a parser bug with
  the code it guards. Synthetic tokens are positively declared in
  `scripts/phi-allow-list.txt` (same allow-list model as `@cosyte/hl7` /
  `@cosyte/x12` / `@cosyte/dicom`); a whole-file bypass needs `--allow-fixture`
  **and** an audit entry in `phi-scan-overrides.md`. Runs at pre-commit
  (`simple-git-hooks --staged`) and in CI (`run-phi-scan: true`); the `verify.sh`
  summary now shows `phi-scan`. Tooling + tests only: no runtime or public-API
  change, and no NCPDP-copyrighted spec prose (wire field ids + paraphrased labels
  only).
- **Dev-dependency advisory remediation (no runtime impact: both overridden
  packages are dev/build-time only and never enter the published artifact; the
  sole runtime dep, `fast-xml-parser`, is untouched).** Added scoped
  `pnpm.overrides` pinning two transitive packages to their patched releases:
  `esbuild` (`>=0.27.3 <0.28.1` → `0.28.1`; GHSA dev-server path-traversal,
  not reachable here: the library builds via `tsup`/`vitest` and never runs
  `esbuild serve`) and the `@changesets/parse` copy of `js-yaml`
  (`>=4.0.0 <4.2.0` → `4.2.0`; GHSA-h67p-54hq-rp68 merge-key DoS). The
  `js-yaml@3.14.2` pulled by `read-yaml-file@1.1.0` (via
  `@manypkg/get-packages` → `@changesets/cli`) is **intentionally left**: it
  calls `yaml.safeLoad`, removed/throwing in js-yaml 4, so it cannot be
  force-upgraded without breaking the release tooling, and it only parses
  trusted local repo YAML at release time. This is the shared canonical
  override block, enforced suite-wide by the `@cosyte/config` drift check.

### Added

- **Em-dash gate wired into CI (`EMDASH-CONFORMANCE`).** The brand rule (founder
  directive 2026-07-24; `knowledgebase/06-brand/voice-and-tone.md`, "No em dashes.
  Ever.") bans `U+2014` outright across every cosyte surface and names commit
  messages explicitly, and the meta-repo's `documentation/conventions.md` has stated
  the rule is CI-gated. It now actually is, here: `scripts/check-no-emdash.sh`
  (`pnpm check:no-emdash`) plus a dedicated `.github/workflows/no-emdash.yml` job
  that scans **both** halves the rule covers, the tracked files **and** the PR title,
  body, and commit messages. The workflow carries the non-default `edited` pull-request
  trigger, which is load-bearing: this repo squash-merges, so the PR title and body are
  the message that lands on `main`, and without `edited` a description changed after the
  last push would never be re-checked. It is a separate workflow rather than a job in
  `ci.yml` because that trigger would otherwise re-run the whole Node 22 + 24 matrix and
  the publish dry-run on every typo fix, and because the shared `cosyte/.github` pipeline
  runs no arbitrary repo script.
  **No content changed.** ncpdp was measured clean before the port (byte-level,
  2026-07-27): 0 of 25 markdown files and 0 of 160 tracked files carried an em dash in
  any matched form. The gate exists purely to stop a regression, which is the only
  reason to add one to a clean repo. The script is the **text-only** variant, taken from
  `knowledgebase` (PR #12, `f4b42f5`) and matching `hl7`, `fhir`, and `pathways`: it
  deliberately omits `grep -I`, which is safe only because no tracked file here holds a
  NUL byte and every one decodes as UTF-8 (both measured, not assumed). Omitting `-I`
  makes a future binary a loud false positive rather than a silent skip: fail closed, not
  open. The 31 `.xml` and 3 `.ncpdp` fixtures are confirmed **read** by the scan, not
  classified out of it, proved by seeding a real fixture of each extension with an em
  dash and watching the gate go red.
  A gate that prints OK when it did not read its input is worse than no gate, so eight
  routes by which a dead scan could still report green are each checked red: a corrupt
  git index, an unreadable tracked file, a tracked file named `-q`, a C-quoted non-ASCII
  path, a mis-encoded text file, an empty tracked-file list, a tracked file named `-`,
  and a tracked symlink to a directory.
  The last two are **fixes to the shared script shape**, found by the refuter pass on
  this slice and not present in the four copies this was ported from, so they should be
  carried back. A bare `-` operand is read by `grep` as standard input, which `xargs`
  points at `/dev/null`, so `--` alone stopped it being parsed as an option but left the
  file unread: the gate printed OK and exited 0 over a live em dash. Every path is now
  prefixed `./`, which closes it. `-d skip` was likewise the one fail-open flag in the
  pipeline (a tracked symlink to a directory was skipped with no stderr, so the run went
  green); it is dropped, and `-H` is added so a hit in a single-file `xargs` batch still
  names its file.
  Known limits are documented in the script header and inherited knowingly from the
  shared shape rather than patched in this copy alone: encoded-form matching is literal
  (so `&#x2014` without the semicolon, and lowercase `%e2%80%94`, pass), stderr capture
  binds to the scanning `grep` rather than the filters ahead of it, an em dash encoded in
  a non-UTF-8 charset is not matched, and the scan reads file **contents** only, so a
  tracked path that itself carries an em dash passes. Tooling only: no runtime,
  public-API, or parse-behavior change, and no NCPDP-copyrighted spec prose.
- **Full canonical Diátaxis docs spine (DOCS-CONTENT-P3).** `docs-content/` grows from the two-item
  sidebar (`intro`, `cookbook`) to the canonical spine every `@cosyte/*` package shares: Overview →
  **Installation** → **Quickstart** → **Core Concepts** → **Guides** → API Reference (resolver-injected)
  → **Troubleshooting**. The six previously orphaned `spec-notes-*` pages are wired into **Core
  Concepts** (each given `id` / `title` / `sidebar_label` frontmatter), `cookbook.md` into **Guides**,
  and three new pages are authored: **Installation** (prerequisites, the single XXE-safe XML dep,
  subpaths), **Quickstart** (a SCRIPT NewRx and a Telecom B1 claim end to end), and **Troubleshooting &
  known limitations** (the fatal-code tables, the fail-safe rules, and the honest v1 non-goals: no
  streaming, decode-only SIG, descriptive-only profiles, EPCS out of scope). Depth is gated to the
  shipped surface with an honest status banner; no unshipped API is documented. Runnable snippets are
  gated by the shared doc/code-agreement harness (`docSnippetSuite`, `@cosyte/vitest-config/snippets`,
  new `test/docs-content.test.ts`), so a documented example can never drift from the built package; the
  `intro.md` scaffold snippet that referenced a non-existent `parseNcpdp` export is corrected to the real
  subpath surface. Bumps the `@cosyte/vitest-config` devDependency to `^0.0.2` for its `/snippets`
  export. Synthetic-only fixtures throughout. Docs and tests only: no runtime or public-API change.

- **Trademark notice (`TRADEMARKS.md`).** This package names third-party systems to describe what it
  interoperates with; the notice records that cosyte is not affiliated with, endorsed by, or
  sponsored by any of them, that every reference is descriptive, and that the built-in profiles are
  authored from public sources only. Added to `files` so it ships inside the published tarball, not
  just on GitHub. Documentation only: no runtime or API change.

- **NCPDP-10: release hardening.** The v1 close-out; no new parser surface, just the gates, tooling,
  and docs that make the package trustworthy to publish. A `release-dry-run` CI job (`pnpm publish
--dry-run` across the five subpath exports + `npm pack --dry-run`) proves a real release assembles
  auth-free without burning a version; a nightly `fuzz.yml` amplifies the never-throw fuzz targets
  (including a **new SCRIPT XML XXE / entity-expansion target** that hammers the `xml-load.ts`
  `<!DOCTYPE>`/`<!ENTITY>` refusal boundary) via a `fuzzRuns()` env multiplier (per-commit run
  unchanged; fast-check auto-rotates + prints its seed for replay), with a sticky-issue open/auto-close
  on failure. Docs: a task-oriented `docs-content/cookbook.md` and a `KNOWN-LIMITATIONS.md` honesty
  statement (EPCS non-support, lossy structured SIG, the NCPDP-licensing / no-redistributed-prose
  posture, and the deliberate absence of an external-oracle differential corpus); JSDoc `@example`
  completeness closed on the 12 public value-exports that lacked one. No new warning codes.
- **Trading-partner profile system** (NCPDP-9): a new `@cosyte/ncpdp/profiles` subpath. `defineProfile(spec)`
  builds a frozen profile with a structured `describe()` (the `relaxes` / `adds` / `requires` buckets, the
  standards it touches, and the de-duplicated union of `expectedWarnings`); `setDefaultProfile` /
  `getDefaultProfile` manage a process-scoped default; `partitionWarnings(warnings, profile)` splits a
  parse's warnings into expected vs. unexpected. NCPDP spans two unrelated standards, so one built-in ships
  per standard, reached via the `profiles` namespace: `profiles.surescripts` (SCRIPT: routing identifiers,
  version-stamp variance) and `profiles.pbm` (Telecom: Person Code, deeper reject-code taxonomy, response
  DUR/PPS). **Locked hard rule, no invented quirks:** every quirk MUST cite a Tier-2 `fixture` that
  demonstrates its convention, enforced by a required field, `defineProfile()` validation, and a per-quirk
  demonstrator in the suite. **Descriptive only (v1):** attach a profile via `parseScript(xml, { profile })`
  / `parseTelecom(raw, { profile })` and it surfaces as `msg.profile` / `tx.profile` and feeds
  `partitionWarnings`, but NEVER alters the parse. Profile-on output is byte-identical to profile-off.
  Provenance per quirk in `docs-content/spec-notes-profiles.md`; synthetic-only fixtures; no new warning codes.
- **Spec-clean serializers + builders + round-trip, both standards** (NCPDP-8): closes the parse↔emit
  loop. `@cosyte/ncpdp/script` adds `serializeScript(message)` (and `ScriptMessage#toString()`) →
  canonical SCRIPT XML, plus `buildNewRx(input)` and `buildScriptResponse(input)` to construct a NewRx or
  a `<Status>`/`<Error>`/`<Verify>` response. `@cosyte/ncpdp/telecom` adds `serializeTelecom(transaction)`
  → canonical vD.0 wire form (56-byte fixed header + FS/GS/RS-framed body, or response header + GS +
  segments) and `buildTelecomRequest(input)`. **Conservative on emit (Postel's Law):** the serializer
  never warns on a valid model; the builders refuse a message invalid by construction with a typed error,
  `NcpdpScriptBuildError` (`MISSING_MEDICATION`, `MISSING_RESPONSE_CODE`, `INVALID_CHARACTER`) and
  `NcpdpTelecomBuildError` (`MISSING_TRANSACTION_CODE`, `MISSING_SEGMENT_ID`, `INVALID_FIELD_ID`,
  `EMBEDDED_CONTROL_CHARACTER`, `FIELD_TOO_LONG`), rather than emitting malformed output. The read is
  lossy, so the contract is **canonical-form idempotence**: `serialize(parse(serialize(x)))` is
  byte-identical to `serialize(x)` and `parse(serialize(x))` is structurally equal to `x`; verified by a
  golden round-trip over every parseable fixture (both standards) and a `roundTripProperty` property test,
  with builder output re-parsing with zero warnings. SCRIPT emit escapes `& < >` (and `"` in attributes);
  because the XXE-safe loader resolves no entities, a raw `& < >` round-trips only when entity-free (the
  corpus is), and the builder refuses XML-1.0 control characters up front. No new warning codes. The
  parser warning surface is unchanged; build errors carry a stable code and never echo the (PHI-dense)
  value. Spec traceability in `docs-content/spec-notes-serialize-build.md`. Known limitations:
  whole-message only (no streaming emit), the SCRIPT builder emits the SIG it is given (no SIG generation
  from structure), and lossy fields the parser does not model are not reproduced.
- **Telecom request-side depth: compound + COB + DUR/PPS request + prior-auth** (`@cosyte/ncpdp/telecom`):
  five new reads over a parsed transaction: `compound(t)` (multi-ingredient compound detail, segment 10),
  `cobOtherPayments(t)` (request Coordination of Benefits / Other Payments, segment 05), `responseCob(t)`
  (response COB / Other Payers next-payer routing, segment 28), `requestDur(t)` (submitted DUR/PPS
  interactions, segment 08), and `priorAuthorization(t)` (segment 12); `responseDur` also gains
  professional-service / result-of-service / level-of-effort depth. Two safety invariants govern the
  collections: **every compound ingredient is surfaced, none dropped or merged**: a new ingredient begins
  at each Compound Product ID Qualifier (488-RE) **or** Compound Product ID (489-TE), and a declared
  component count (447-EC) that disagrees never drops/pads data (`NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH`);
  **every COB money row is preserved with its amount**: each other-payer block repeats on Other Payer
  Coverage Type (338-5C), the segment-level count (337-4C / 355-NT) is metadata and never seeds a spurious
  block, amount rows pair a qualifier with the next amount in wire order, and a declared count that
  disagrees surfaces `NCPDP_TELECOM_COB_COUNT_MISMATCH`. Money stays decimal-safe (compound drug cost
  449-EE and the COB amounts via `telecomMoney`; ingredient quantity 448-ED via the implied 3-place
  decimal). An unknown DUR Reason For Service (439-E4) is kept verbatim with `reasonKnown: false`
  (`NCPDP_TELECOM_UNKNOWN_DUR_REASON`). Prior authorization is **presence, not adjudication**. Adds the
  three stable warning codes above; warnings carry a stable code + byte offset + field id, never a value
  (PHI-safe). Spec traceability in `docs-content/spec-notes-telecom-compound-cob.md`. Still parse-only; no
  serializer yet.
- **Telecom responses + B2/B3/E1** (`@cosyte/ncpdp/telecom`): `parseTelecom` now detects a **response**
  transmission (it leads with the Version/Release at offset 0, not the routing BIN) and decodes it against
  the fixed Response Transaction Header. `adjudication(t)` lifts the outcome (status + disposition,
  pricing, and DUR alerts) over the same reader for B1/B2 reversal/B3 rebill/E1 eligibility responses;
  `responseStatus`, `responsePricing`, `responseDur`, `telecomMoney`, and `decodeResponseHeader` are
  exported too. Three safety invariants govern it: **a reject always wins**: `disposition` is a total
  function over Transaction Response Status (112-AN) **and** reject codes (511-FB), so any reject present
  forces `"rejected"` even when the status claims paid (`NCPDP_TELECOM_STATUS_CONFLICT`), and an
  unrecognized status reads `"unknown"`, never paid (`NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS`); **money is
  never a float**: `telecomMoney` decodes the implied 2-place decimal and the zoned-decimal overpunch
  sign (`{`,A–I = +0–9; `}`,J–R = −0–9) string-wise with the verbatim source authoritative, keeping
  unrecognized input as `isValid: false`; **no DUR alert is dropped**: the repeating Response DUR/PPS
  fields split at each counter (567-J6) and each new Reason For Service (439-E4), and unknown
  reject/reason codes are kept verbatim with `known: false` (`NCPDP_TELECOM_UNKNOWN_REJECT_CODE`). Adds
  the three stable warning codes above; warnings carry a stable code + byte offset + field id, never a
  value (PHI-safe). Spec traceability in `docs-content/spec-notes-telecom-response.md`. Still parse-only;
  no serializer yet.
- **Telecom foundation + B1 billing-claim read** (`@cosyte/ncpdp/telecom`): opens the second,
  **zero-dep** standard. `parseTelecom(raw: string | Buffer, opts?)` validates the FS/GS/RS
  (`0x1C`/`0x1D`/`0x1E`) control-character framing, decodes the fixed 56-byte vD.0 Transaction Header
  (BIN, Version/Release, Transaction Code, PCN, Transaction Count, Service Provider ID + Qualifier, Date
  of Service, Software/Cert ID: leading zeros preserved, pad trimmed), and tokenizes the
  Segment-Identification (`AM`)-keyed, field-id-keyed variable segments. `claim(t)` lifts a B1/B2/B3
  **request** view: Patient (DOB, gender), Insurance (group, cardholder, person code), Claim (Rx
  reference + qualifier, fill, product, quantity, days supply, DAW) and Prescriber (id + qualifier).
  **Quantity Dispensed is never a float**: the implied 3-place decimal (`9(7)v999`) is applied
  string-wise (`"30000"` → `"30.000"`) alongside the verbatim source. Fail-safe: missing header →
  `NCPDP_TELECOM_NO_HEADER`, unframeable body → `NCPDP_TELECOM_INVALID_FRAMING` (a separator is never
  guessed), untrusted version → `NCPDP_TELECOM_UNSUPPORTED_VERSION`, empty → `EMPTY_INPUT`; the **F6**
  stamp is recognized-but-not-decoded (`NCPDP_TELECOM_VF6_NOT_DECODED`, its header layout differs from
  D.0); unknown segments/fields, a missing `AM`, malformed tokens, and extra (truncated) transactions
  all warn and preserve verbatim. Warnings carry a stable code + byte offset + field id, never a value
  (PHI-safe). Spec traceability in `docs-content/spec-notes-telecom.md`. Responses, B2/B3, E1, compound,
  and COB land in later phases; no serializer yet.
- **SCRIPT structured SIG decode** (`@cosyte/ncpdp/script`): `medication.sig` exposes a `StructuredSig`:
  a best-effort, **lossy** decode of the SCRIPT `<Sig>` into typed dosing components
  (`doseDeliveryMethod`, `dose`, `doseUnitOfMeasure`, `route`, `siteOfAdministration`,
  `administrationTiming`, `duration`, `vehicle`, `indication`, `maximumDoseRestriction`). The free-text
  `SigText` is preserved **verbatim** and remains the source of truth; the structured view is additive
  and never reconciled against it. When they disagree, both are surfaced. Every component is a
  `SigField` tagged `coded`/`derived`/`absent`; a `coded` field keeps its qualifier verbatim and resolves
  the system (SNOMED CT / NCI / NDC / RxNorm / ICD-10, else `UNKNOWN`), giving route/site/method/unit
  provenance. An ambiguous dose (a dose structure with no readable quantity) is surfaced as `absent`
  rather than guessed, raising the new `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE`; any structured decode raises the
  new `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY` to flag the lossy view. Decode-only (no SIG generation, no
  natural-language parsing); element-name tolerance for the membership-gated IG nesting is documented in
  `docs-content/spec-notes-structured-sig.md`. Covers SCRIPT `v2017071` + `v2022011`.
- **SCRIPT prescription-lifecycle transactions** (`@cosyte/ncpdp/script`): reads the six renewal /
  change / cancel transactions (`RxRenewalRequest`/`RxRenewalResponse`,
  `RxChangeRequest`/`RxChangeResponse`, `CancelRx`/`CancelRxResponse`) via
  `rxRenewalRequest()`/`rxRenewalResponse()`/`rxChangeRequest()`/`rxChangeResponse()`/`cancelRx()`/
  `cancelRxResponse()` accessors (and `ScriptMessage#asLifecycleRequest`/`asLifecycleResponse`).
  Requests project patient, pharmacy, prescriber, and the prescribed medication with the same
  semantics as NewRx. Responses expose a **fail-safe** `outcome`
  (`approved`/`approvedWithChanges`/`denied`/`deniedNewToFollow`/`replace`/`validated`/`unknown`):
  a `<Denied>` is **never** read as an approval, an unrecognized or absent outcome reads as
  `unknown` (never assumed approved, raising `LIFECYCLE_OUTCOME_UNRECOGNIZED`), and a malformed
  response carrying multiple outcome choices resolves denial-first and raises
  `LIFECYCLE_AMBIGUOUS_OUTCOME`. `approvalOf(outcome)` gives a coarse, one-directional
  `affirmative`/`negative`/`indeterminate` read. For `approvedWithChanges` the **changed**
  `medicationPrescribed` is surfaced (whether a sibling of `<Response>` or nested inside the outcome
  element) so a consumer dispenses the change, not the original. Reason fields
  (`code`/`referenceNumber`/`denialReason`/`note`) are verbatim. Covers SCRIPT `v2017071` +
  `v2022011`.
- **SCRIPT response spine** (`@cosyte/ncpdp/script`): reads the three acknowledgment transactions,
  `Status` (positive), `Error` (negative), `Verify`, exposed via `status()`/`error()`/`verify()`
  accessors (and `ScriptMessage#asStatus`/`asError`/`asVerify`). `Code`, `DescriptionCode`, and
  `Description` are surfaced **verbatim** (no bundled NCPDP code→meaning table). A `disposition`
  accessor (`"success"`/`"error"`/`"verify"`/`undefined`) is derived only from the body kind, so an
  `Error` can **never** be read as a success; a malformed message carrying multiple response bodies
  reports the most conservative disposition (`Error` first) and raises the new
  `RESPONSE_AMBIGUOUS_DISPOSITION` warning. `correlatesTo` exposes `<RelatesToMessageID>` so a
  response can be tied back to its request. Covers SCRIPT `v2017071` + `v2022011`.
- Project scaffold from the shared `@cosyte/*` parser template: the canonical toolchain (TypeScript
  ES2023 + strict rigor via `@cosyte/tsconfig`, ESLint 10 + type-checked `typescript-eslint` via
  `@cosyte/eslint-config`, Prettier via `@cosyte/prettier-config`, Vitest 4 + v8 coverage via
  `@cosyte/vitest-config`, dual ESM + CJS build via `tsup` + `@cosyte/tsup-config`, `attw` publish
  gate), thin callers of the reusable `cosyte/.github` CI/release workflows, Changesets on the
  `0.0.x` ladder, and the property-based conformance harness from `@cosyte/test-utils`.
- **SCRIPT NewRx structural read** (`@cosyte/ncpdp/script`): `parseScript(xml)` returns an immutable
  `ScriptMessage` and `newRx(msg)` projects the NewRx body: header (version/messageId/to/from/
  sentTime), patient, pharmacy, prescriber, and medication (coded drug + explicit strength surfaced
  side-by-side, never reconciled), with XPath-positioned tolerance warnings. Lenient by default:
  vendor quirks become `SCRIPT_WARNING_CODES`; only unrecoverable structural corruption throws a
  typed `NcpdpScriptParseError` (`SCRIPT_FATAL_CODES`). XXE-safe by construction (DOCTYPE/ENTITY
  payloads are refused). Supports SCRIPT `v2017071` + `v2022011`.
- **Shared `@cosyte/ncpdp/common` vocabulary**: `decimalValue` (float-free decimal validity),
  `ndcValue` (NDC segmentation classification), `recognizeCodeSystem`/`codedValue` (NDC/RXNORM/
  SNOMED/NCI/ICD10 qualifier mapping), and XPath position helpers.
- Runtime dependency on [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser)
  for safe, namespace-aware XML parsing on the SCRIPT side, ratified in
  [`docs/adr/0001-xml-parser.md`](./docs/adr/0001-xml-parser.md). The Telecom side remains zero-dep.

### Changed

- Replaced the `VERSION`-only archetype stub surface with the real SCRIPT + common public API.

### Deprecated

### Removed

### Fixed

- **Published-status drift corrected across the public docs.** The Docusaurus docs
  (`docs-content/intro.md`, `docs-content/installation.md`) and `KNOWN-LIMITATIONS.md` still claimed
  `@cosyte/ncpdp` was "not yet published to npm" / sat at `0.0.0` / was "gated on the coordinated
  public launch." It is published on npm at `0.0.1` and public; the status lines now read as
  published, public, and still pre-alpha on the `0.0.x` ladder, the install command is described as
  live, and the "Not yet published" limitation becomes a "Published, still pre-alpha" note. The
  capability prose beneath each was already accurate and is unchanged. Documentation only: no runtime
  or API change.
- **README status line corrected: the package is published.** The README status blockquote still
  claimed `@cosyte/ncpdp` was "not yet published to npm." It is published on npm at `0.0.1` and
  public; the line now reads as published, public, and still pre-alpha on the `0.0.x` ladder. The
  capability prose beneath it was already accurate and is unchanged. Documentation only: no runtime
  or API change.
- **The release can actually bump the version.** `package.json` had no `version` script, so the
  shared pipeline's `pnpm run version` failed with `Command "version" not found` and the release
  aborted before opening a "Version Packages" PR. Adds `scripts/sync-version.mjs` (the `hl7`
  reference, retargeted at `src/index.ts`) and the `version` script that runs it after
  `changeset version`, so the bump and the `VERSION` constant land in the same commit.
- **`VERSION` is no longer typed as a string literal.** It was declared `export const VERSION =
"0.0.0"`, giving it the literal type `"0.0.0"`, so the exported type would change on every
  release, making each version bump a breaking type change. Now annotated `: string`, matching the
  `hl7` reference. Type-only; the runtime value is unchanged. Done now because the package is
  unpublished. After the first publish this would itself be a breaking change.

- **The Release workflow can actually start.** `.github/workflows/release.yml` calls the shared
  `cosyte/.github` pipeline, which requests `contents`/`id-token`/`pull-requests: write`, but declared
  no `permissions:` of its own, so it inherited the repo default of `contents: read`. A called
  workflow may only downgrade the caller's `GITHUB_TOKEN`, never escalate it, so GitHub rejected the
  workflow at startup (~1s, no jobs, no logs). Every Release run from June 2026 until now failed this
  way, unnoticed, because a `startup_failure` produces no logs to read. The caller job now declares
  the three scopes explicitly. CI-only: no runtime or API change.

### Security

[Unreleased]: https://github.com/cosyte/ncpdp/commits/main

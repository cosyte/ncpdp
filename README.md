<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="The Cosyte logo on its own white ground: the icon beside the word Cosyte." src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# @cosyte/ncpdp

> Read a vendor-quirky Telecom pharmacy claim or SCRIPT ePrescription in one line, without buying
> the standard.

[![npm version](https://img.shields.io/npm/v/@cosyte/ncpdp.svg)](https://www.npmjs.com/package/@cosyte/ncpdp)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/ncpdp/ci.yml?branch=main&label=CI)](https://github.com/cosyte/ncpdp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/cosyte/ncpdp/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

NCPDP parser, serializer, and builder for Node.js and TypeScript: SCRIPT ePrescribing and Telecom
pharmacy claims, lenient on parse, spec-clean on emit.

- [Why this exists](#why-this-exists)
- [Status](#status)
- [Install](#install)
- [Usage](#usage)
- [PHI and safety](#phi-and-safety)
- [API](#api)
- [Compatibility](#compatibility)
- [Contributing](#contributing)
- [License](#license)

## Why this exists

NCPDP is two structurally unrelated standards under one brand: SCRIPT, an XML ePrescribing format,
and the Telecommunication Standard, a control-character-framed pharmacy claim format. The
Implementation Guides for both are purchased products, so the usual route for a Node team is to
hand-roll a reader against a guide somebody had to buy: an element walk over
[`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) for SCRIPT, a
`String.split` on the FS/GS/RS separators plus hard-cut byte offsets for Telecom. That works until
real input arrives, and then a vendor quirk is an exception thrown in the middle of a dispense, an
off-by-one offset is a wrong field, and a currency amount parsed with `parseFloat` is a wrong paid
amount. This package is the other choice: a lenient reader that turns quirks into positioned
warnings instead of failures, a conservative emitter that only ever writes spec-clean output, and
quantities and money handled string-wise so binary floating point can never corrupt a value.

## Status

**0.1.0.** The public API is settled and stable enough to depend on. The exported functions, the
shape of their arguments, the model fields they return, and the stable warning codes consumers
branch on are all covered by semantic versioning from this release onward; renaming a warning code
is a breaking change and is treated as one.

Two public surfaces are still moving, and both are additive views rather than the parse itself:

- **The structured SIG view** (`medication.sig`). Explicitly lossy and explicitly labeled: the
  free-text `sigText` is always authoritative and is never overwritten, and a structured component
  decodes only where a published field label grounds its element name. That grounded-name list can
  lose a name when its grounding is re-examined, which moves a component from `coded` to `absent`.
- **The wire-code label tables** (`known` on a reject, DUR or reason code). A label ships only where
  a public artifact establishes it, so most codes come back as the bare wire code with
  `known: false`. Labels are added when an artifact is found, and never guessed.

Everything else on both wire formats is settled. What the package does and does not decode is
stated once, in the [conformance statement](./docs-content/conformance.md).

## Install

```bash
pnpm add @cosyte/ncpdp
```

Node 22 or newer is required (`engines.node` is `>=22.0.0`). The package is ESM
(`"type": "module"`) and ships a CommonJS build beside it, so `import` and `require` both resolve
through the same `exports` map. TypeScript types resolve under `node16` and under legacy `node10`.

### Dependencies

The Telecom side is zero-dependency, Node standard library only. The SCRIPT side takes a single
vetted runtime dependency,
[`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser), for namespace-aware
XML parsing, configured XXE-safe with entity resolution disabled. No further runtime dependency is
added without the same review.

## Usage

Both examples below are complete programs. Each was run against this package, and the block beneath
it is the output it printed, verbatim. Every patient, prescriber, member and product value in them
is synthetic.

### Emit and read a Telecom billing claim

```js
import { buildTelecomRequest, serializeTelecom, parseTelecom, claim } from "@cosyte/ncpdp/telecom";

// Emit a spec-clean Telecom B1 billing claim. Every value below is synthetic.
const wire = serializeTelecom(
  buildTelecomRequest({
    header: { transactionCode: "B1", binNumber: "999999", dateOfService: "20260115" },
    segments: [
      { segmentId: "04", fields: [{ id: "C2", value: "SYNTHCARD09" }] },
      {
        segmentId: "07",
        fields: [
          { id: "D2", value: "RX0000001" },
          { id: "E1", value: "03" },
          { id: "D7", value: "99999999999" },
          { id: "E7", value: "30000" },
          { id: "D5", value: "30" },
        ],
      },
    ],
  }),
);

// Read it back. A vendor quirk becomes a positioned warning here, never a throw.
const t = parseTelecom(wire);
const c = claim(t);

console.log(t.kind, t.header.transactionCode, t.warnings.length);
console.log(c?.cardholderId, c?.prescriptionReferenceNumber);
console.log(c?.product?.id, c?.product?.qualifier);
console.log(c?.quantityDispensed?.source, c?.quantityDispensed?.impliedDecimal);
```

```text
request B1 0
SYNTHCARD09 RX0000001
99999999999 03
30000 30.000
```

Note the last line. Quantity Dispensed carries an implied three-place decimal, and the verbatim
source is kept beside the scaled value, which is produced string-wise rather than through a float.

### Read a SCRIPT NewRx

```js
import { parseScript, newRx } from "@cosyte/ncpdp/script";

// A minimal SCRIPT NewRx. Every value below is synthetic.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Message xmlns="http://www.ncpdp.org/schema/SCRIPT" version="2017071">
  <Header><MessageID>SYNTH-MSG-0001</MessageID></Header>
  <Body><NewRx>
    <Patient><HumanPatient>
      <Name><LastName>Testpatient</LastName><FirstName>Avery</FirstName></Name>
      <DateOfBirth><Date>1990-04-12</Date></DateOfBirth>
    </HumanPatient></Patient>
    <MedicationPrescribed>
      <DrugDescription>Amoxicillin 500 MG Oral Capsule</DrugDescription>
      <DrugCoded><ProductCode Qualifier="ND">99999999999</ProductCode></DrugCoded>
      <Sig><SigText>Take 1 capsule by mouth three times daily for 10 days.</SigText></Sig>
    </MedicationPrescribed>
  </NewRx></Body>
</Message>`;

const msg = parseScript(xml);
const rx = newRx(msg); // the NewRx body, or undefined for another transaction

console.log(msg.header.messageId, msg.warnings.length);
console.log(rx?.patient?.name?.lastName, rx?.patient?.dateOfBirth);
console.log(rx?.medication?.description, rx?.medication?.coded?.productCode?.system);
console.log(rx?.medication?.sig?.sigText);
```

```text
SYNTH-MSG-0001 0
Testpatient 1990-04-12
Amoxicillin 500 MG Oral Capsule NDC
Take 1 capsule by mouth three times daily for 10 days.
```

More recipes, each with its own worked example, are in the
[cookbook](./docs-content/cookbook.md).

## PHI and safety

A pharmacy transaction carries PHI, and this library is built on the assumption that yours does.

**Logging.** The library logs nothing. There is no `console` call in library code, and its own
diagnostics are safe to log whole: a warning or error message comes from a frozen registry keyed by
code, and the factories that build one take a position and nothing else, so there is no
interpolation site a document can reach. A warning's `message` is byte-identical to the registry
entry for its `code`, and a test asserts exactly that. Position is an XPath for SCRIPT and a byte
offset plus a two-character field id for Telecom, and its parts come only from names this library
recognizes, never from a name a sender chose.

**Retention.** Nothing is retained. A parse is a pure function of the bytes handed to it. There is
no cache, no module-level state and no history; the frozen model returned is the only thing that
outlives the call.

**Writing to disk.** Nothing is written, and nothing is fetched. The library opens no file and no
socket at any point, and the code lists it ships are bundled snapshots compiled into the package
rather than a runtime download.

**The parsed model is not safe to log.** Field values, drug codes, descriptions and identifiers are
exactly as sensitive as the claim or prescription they came from: that is what you asked the parser
for. What is guaranteed is that the library's own structural identifiers stay bounded, so a
downstream package building diagnostics out of them cannot be handed unbounded wire bytes:
`segment.segmentId` is always two characters or empty however the transaction was made, `field.id`
is at most two, and an unmodeled SCRIPT transaction is named only from a closed vocabulary.

**What the consuming application still owns.** Everything outside the call: transport and
encryption, authentication, access control and audit, retention and disposal, de-identification
before analytics, and its own logging. If you log the parsed model, you have logged PHI. The SCRIPT
loader refuses any input carrying a `<!DOCTYPE>` or `<!ENTITY>` declaration and resolves no
entities, so there is no external-entity or billion-laughs vector, but no parser can make an
untrusted document safe to store.

## API

Five code entry points, plus `@cosyte/ncpdp/package.json` for tooling that reads the manifest:

| import                   | what it carries                                                                                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cosyte/ncpdp`          | `VERSION` and a re-export of the whole surface below, for code that would rather import from one place                                                                                                                                          |
| `@cosyte/ncpdp/script`   | SCRIPT: `parseScript`, `newRx`, the response spine (`status` / `error` / `verify`), the lifecycle readers (`rxRenewalResponse` / `rxChangeResponse` / `cancelRxResponse`, `approvalOf`), `serializeScript`, `buildNewRx`, `buildScriptResponse` |
| `@cosyte/ncpdp/telecom`  | Telecom: `parseTelecom`, `claim`, `adjudication`, `compound`, `cobOtherPayments`, `responseCob`, `requestDur`, `priorAuthorization`, `serializeTelecom`, `buildTelecomRequest`                                                                  |
| `@cosyte/ncpdp/common`   | shared vocabulary: `ndcValue`, `decimalValue`, position helpers, and the warning and fatal code constants both formats share                                                                                                                    |
| `@cosyte/ncpdp/profiles` | `defineProfile`, `partitionWarnings`, and the built-in `profiles.surescripts` and `profiles.pbm`                                                                                                                                                |

Signatures, return types and per-field notes are on every public export as JSDoc, so an editor
shows them inline. The caveats that bite, and that no signature can show you, are these:

- **A reject always wins.** A response disposition is a total function over the Transaction
  Response Status and the reject codes together. If any reject is present the disposition is
  `"rejected"` even when the status field claims paid, and the contradiction is surfaced rather
  than resolved. A consumer is never told a rejected claim was paid. An unrecognized status reads
  `"unknown"`, never paid.
- **A denial is never an approval.** A lifecycle outcome is read only from the response's own
  choice element. An unrecognized or absent outcome reads `"unknown"`, and a malformed response
  carrying more than one outcome resolves denial-first. On an `approvedWithChanges`, read
  `medicationPrescribed`: that is the changed medication, and it is the one to dispense.
- **An `Error` is never a success.** A SCRIPT `disposition` is derived only from the response body
  kind, and where a malformed message carries more than one response body the most conservative
  one wins. Codes and descriptions are surfaced verbatim; no code-to-meaning table ships.
- **Money and quantity are never floats.** Every amount carries an implied two-place decimal and an
  optional zoned-decimal overpunch sign, and quantity an implied three-place decimal. Both are
  applied string-wise with the verbatim source kept beside the result. Anything unexpected is
  preserved with `isValid: false` and no interpreted value rather than guessed at.
- **Nothing is silently dropped.** Unknown segments, unknown fields and malformed tokens are
  preserved verbatim and warned. Every group-separated transaction decodes, each at its own index
  with its own segments, byte offset and warnings, and a malformed later transaction costs only
  itself. Every compound ingredient, every coordination-of-benefits money row and every returned
  DUR alert is surfaced, never merged or truncated; a declared count that disagrees with the
  decoded count raises a warning and drops nothing. A declared transaction count is reported, never
  enforced.
- **Prior authorization is presence, not adjudication.** It reports that the segment was submitted
  and echoes the type and number. It never decides whether an authorization is valid or honored.
- **The structured SIG is additive and lossy.** `sigText` stays the source of truth and is never
  reconciled against the structured view; where the two disagree, both are surfaced as-is. Every
  component is tagged `coded`, `derived` or `absent`, an absent one is never inferred from the free
  text, and an ambiguous dose reads `absent` rather than being guessed.
- **Emit is canonical form, not byte identity.** The read is lossy, so emit reproduces the modeled
  content: `serialize(parse(serialize(x)))` is byte-identical to `serialize(x)` and
  `parse(serialize(x))` is structurally equal to `x`. The builders refuse a message that is invalid
  by construction with a typed error rather than emitting something malformed, and the offending
  value is never echoed in the error. Serializing a SCRIPT transaction the package does not model
  throws rather than writing a document with the body deleted: test `body.kind` first and relay the
  original bytes.
- **Only structural corruption throws.** Empty input, non-XML, a missing message root, a pre-XML
  legacy version, absent framing bytes and an unsupported version stamp are typed fatal errors.
  Everything else is a warning with a stable code and a position.

Further reading, all in this repository:
[cookbook](./docs-content/cookbook.md) ·
[conformance statement](./docs-content/conformance.md) ·
[known limitations](./KNOWN-LIMITATIONS.md) ·
[quickstart](./docs-content/quickstart.md) ·
[troubleshooting](./docs-content/troubleshooting.md) · and the per-surface spec notes under
[`docs-content/`](./docs-content/).

## Compatibility

**Standard versions.** Which version of each standard is decoded, which stamp is recognized without
being decoded, the public section that adopts each one, and the date that adoption ends, are stated
once and only once, in the [conformance statement](./docs-content/conformance.md). They are
deliberately not restated here, because a second copy is a copy that goes stale.

**Vendor quirks.** Trading-partner and companion-guide differences are handled through the profile
system: `defineProfile()` plus the built-in `profiles.surescripts` for SCRIPT and `profiles.pbm` for
Telecom, both authored through that same public API and grounded in real tolerance fixtures rather
than in a guess. Attach one with
`parseScript(xml, { profile })` or `parseTelecom(raw, { profile })`. Profiles are **descriptive**:
they attach attribution and power warning partitioning, and output with a profile attached is
byte-identical to output without one. A profile never alters the parse.

**Named gaps, rather than silence.** Electronic Prescribing of Controlled Substances is out of
scope and belongs in a separate package: it needs DEA-regulated signature verification and a
different certification posture. Parsing and emitting are whole-message only, with no streaming
mode. The SCRIPT builder emits the SIG it is given and generates none from structure, and the
structured SIG decode does not read arbitrary natural-language directions. Most wire-code labels do
not ship, because no public artifact establishes them. No third party has tested this package, and
there is no differential corpus against a reference implementation; the
[conformance statement](./docs-content/conformance.md) says what stands in for both, and
[KNOWN-LIMITATIONS.md](./KNOWN-LIMITATIONS.md) is the full do-not-over-trust list.

## Contributing

**Where to ask.** Open an issue at
[github.com/cosyte/ncpdp/issues](https://github.com/cosyte/ncpdp/issues). That is the only support
channel: there is no chat, mailing list or private support address.

**External pull requests.** The repository is public and MIT-licensed, and it takes pull requests
on the same terms as any other change. There is no CONTRIBUTING.md and no code of conduct in the
repository yet, so this section is the whole contributor guide.

**What a contribution must clear before merge.** A pull request has to go green on the required
status checks on `main`. Locally that is:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm run check && pnpm run build
```

Lint runs at `--max-warnings=0` and coverage is gated per directory at 90 percent. Two gates check
the text as well as the code: no em dash in any tracked file or in the pull request title, body or
commit messages, and no internal project identifier on a published surface. A change that alters
behaviour also needs a changeset, and a changeset that renames a stable warning code is describing
a breaking change.

## License

MIT. Copyright (c) 2026 Cosyte. Full text: [LICENSE](./LICENSE).

### Trademarks

`@cosyte/ncpdp` is an independent open-source project. cosyte is not affiliated with, endorsed by,
or sponsored by any company named in this repository or its documentation. Surescripts appears as
the name of a built-in profile, because a profile cannot record whose trading-partner conventions
it accommodates without naming them. See [TRADEMARKS.md](./TRADEMARKS.md).

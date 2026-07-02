---
id: cookbook
title: Cookbook
sidebar_position: 2
---

# Cookbook

Task-oriented recipes for the common reads. Each one is a few lines over a parsed message, using the
real subpath exports — `@cosyte/ncpdp/script` for ePrescribing XML, `@cosyte/ncpdp/telecom` for the
PBM claim wire, `@cosyte/ncpdp/common` for the shared value wrappers.

The rules underneath every recipe are the same: the parser is **lenient** (vendor quirks become
stable-coded `warnings`, not failures), the model is **immutable**, and safety-critical dispositions
are **fail-safe** — a failure is never quietly read as a success, and money is never a float.

> All XML and wire samples below are **synthetic**. Fixtures must never carry real PHI — no real
> patient names, member IDs, prescriber NPIs, or NDCs.

## Parse a SCRIPT NewRx

Read a NewRx ePrescribing message: header, patient, prescribed medication, and the coded product.
`parseScript` never throws on a vendor quirk — it collects `warnings` and reads best-effort. `newRx`
projects the NewRx body, or returns `undefined` for any other transaction.

```ts
import { parseScript, newRx } from "@cosyte/ncpdp/script";

const xml = `<Message version="2017071">
  <Header><MessageID>SYNTH-MSG-0001</MessageID></Header>
  <Body><NewRx>
    <Patient><HumanPatient>
      <Name><LastName>DOE</LastName><FirstName>JANE</FirstName></Name>
    </HumanPatient></Patient>
    <MedicationPrescribed>
      <DrugDescription>Amoxicillin 500 MG Oral Capsule</DrugDescription>
      <DrugCoded><ProductCode Qualifier="ND">00000000001</ProductCode></DrugCoded>
      <Quantity><Value>30</Value></Quantity>
      <Sig><SigText>Take 1 capsule by mouth three times daily for 10 days.</SigText></Sig>
    </MedicationPrescribed>
  </NewRx></Body>
</Message>`;

const msg = parseScript(xml);

msg.header.messageId; // "SYNTH-MSG-0001" — routing / correlation header
msg.warnings; // stable, XPath-positioned tolerance warnings — never throws on quirks

const rx = newRx(msg); // the NewRx body, or undefined for another transaction
rx?.patient?.name?.lastName; // "DOE"
rx?.medication?.description; // "Amoxicillin 500 MG Oral Capsule"
rx?.medication?.coded?.productCode?.value; // the raw product code, verbatim
rx?.medication?.coded?.productCode?.system; // "NDC" | "RXNORM" | "SNOMED" | …
rx?.medication?.quantity?.value?.source; // "30" — the wire value, string-preserved
```

- **Lenient by default.** Vendor quirks (own-text dates, alternate element shapes, an absent version)
  become `warnings` with an XPath position, not failures. Only unrecoverable structural corruption —
  empty input, non-XML, a non-`<Message>` root, a `<!DOCTYPE>`/`<!ENTITY>` payload (the XXE boundary),
  or a pre-XML legacy version — throws a typed `NcpdpScriptParseError`.
- **Coded product carries its own system.** `coded.productCode.system` is recognized from the wire
  qualifier (`"NDC"`, `"RXNORM"`, `"SNOMED"`, …); the raw `value` is always kept verbatim.
- **Warnings never carry field values.** Each warning is a stable `code` plus an XPath `position` —
  never patient or drug data.

## Read a SCRIPT response (Status / Error / Verify)

Every SCRIPT transaction is answered. The response spine reads the three acknowledgment transactions
and exposes the disposition **without ever reading an `Error` as a success**.

```ts
import { parseScript, status, error, verify } from "@cosyte/ncpdp/script";

const responseXml = `<Message version="2017071">
  <Header><RelatesToMessageID>SYNTH-MSG-0002</RelatesToMessageID></Header>
  <Body><Error><Code>900</Code><Description>Prescriber identifier could not be validated.</Description></Error></Body>
</Message>`;

const msg = parseScript(responseXml);

msg.disposition; // "success" (Status) | "error" (Error) | "verify" (Verify) | undefined
msg.correlatesTo; // "SYNTH-MSG-0002" — the answered request's MessageID (<RelatesToMessageID>)

error(msg)?.code; // "900" — the Error code, verbatim; never reformatted or looked up
status(msg)?.description; // the positive-ack description, verbatim (undefined on an Error)
verify(msg)?.code;
```

- **An `Error` never reads as success.** `disposition` is derived only from the response body kind, so
  a failure cannot be coerced to `"success"` — `status(msg)` is `undefined` on an Error. If a malformed
  message carries more than one response body, the most conservative disposition (Error first) wins and
  `NCPDP_SCRIPT_RESPONSE_AMBIGUOUS_DISPOSITION` is raised.
- **`correlatesTo` ties the answer to its request.** It reads `<RelatesToMessageID>` verbatim so you
  can match the acknowledgment back to the NewRx you sent.
- **Codes and descriptions are surfaced verbatim.** `<Code>`, `<DescriptionCode>`, and `<Description>`
  are read as-is; the library bundles no NCPDP code→meaning table.

## Read a Telecom PBM response (paid / rejected)

The PBM answers a claim with a **response** transmission. `parseTelecom` detects the response shape
automatically (it leads with the Version/Release, not the routing BIN); `adjudication` lifts the
outcome. The same reader serves B1 billing, B2 reversal, B3 rebill, and E1 eligibility responses.

```ts
import { parseTelecom, adjudication } from "@cosyte/ncpdp/telecom";

const t = parseTelecom(rawResponse); // kind: "response" — detected, not configured
const a = adjudication(t); // undefined for a request transmission

a?.status?.disposition; // "paid" | "rejected" | "captured" | "approved" | "duplicate" | "unknown"
a?.status?.rejectCodes; // every Reject Code (511-FB), verbatim, in wire order — none dropped
a?.status?.statusConflict; // true when the status field claimed paid but a reject was present
a?.pricing?.patientPayAmount?.amount; // "10.00" — implied 2-place decimal, string-wise (never a float)
a?.pricing?.totalAmountPaid?.amount; // "45.00"
a?.dur; // every returned DUR/PPS alert — one per occurrence, never collapsed
```

- **A reject always wins.** `disposition` is a total function over the Transaction Response Status
  (112-AN) **and** the reject codes together. If any reject is present the disposition is `"rejected"`
  even when the status field claims paid — a consumer is never told a rejected claim was paid. The
  self-contradiction surfaces via `NCPDP_TELECOM_STATUS_CONFLICT` and `status.statusConflict`. An
  unrecognized status reads `"unknown"`, never paid.
- **Reject codes are verbatim.** Each is kept in wire order; an unrecognized code is preserved with
  `known: false` (`NCPDP_TELECOM_UNKNOWN_REJECT_CODE`) rather than dropped.
- **Money is never a float.** Every dollar amount carries an implied 2-place decimal (and an optional
  zoned-decimal overpunch sign); both are interpreted **string-wise** with the verbatim `source` kept,
  so binary floating point can never corrupt a paid amount. Anything unexpected is preserved with
  `isValid: false` and no interpreted amount — money is never guessed.

## Decode the structured SIG (lossy, labeled)

A medication's directions can arrive as free text **and** as a structured `<Sig>`. The structured
decode is **best-effort and explicitly lossy** — the free-text `sigText` stays the source of truth and
is always preserved verbatim; the structured view is additive and every field is provenance-tagged.

```ts
import { parseScript, newRx } from "@cosyte/ncpdp/script";

const sig = newRx(parseScript(xml))?.medication?.sig;

sig?.sigText; // the free-text directions, verbatim — ALWAYS authoritative
sig?.hasStructuredData; // false when the <Sig> carried only free text

sig?.route.provenance; // "coded" | "derived" | "absent"
sig?.route.code?.system; // "SNOMED" | "NCI" | … when coded
sig?.route.text; // verbatim text when present
sig?.dose.text; // the dose quantity, string-preserved (never a float, never guessed)
```

- **The free text is authoritative and never overwritten.** When the structured dose and the free text
  disagree, **both** are surfaced as-is — the library never collapses the disagreement into one answer.
- **Per-field provenance.** Every component (`doseDeliveryMethod`, `dose`, `doseUnitOfMeasure`, `route`,
  `siteOfAdministration`, `administrationTiming`, `duration`, `vehicle`, `indication`,
  `maximumDoseRestriction`) is tagged `coded` / `derived` / `absent`. An **absent** field is never
  inferred from the free text.
- **Ambiguous doses are never guessed.** If a dose structure is present but no unambiguous quantity can
  be read, `dose` is surfaced as `absent` and `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE` is raised. Whenever any
  structured component decodes, `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY` flags the additive, lossy view.
- **Decode-only.** v1 does not _generate_ a SIG from structure, and does not parse arbitrary
  natural-language directions. See [Structured SIG spec notes](./spec-notes-structured-sig.md).

## Read a Telecom B1 claim

The Telecommunication standard is the pharmacy-to-PBM claim protocol: a fixed positional Transaction
Header followed by FS/GS/RS control-character-framed, field-id-keyed segments. `parseTelecom` decodes
the header and segments; `claim` lifts the safety-relevant B1/B2/B3 request fields.

```ts
import { parseTelecom, claim } from "@cosyte/ncpdp/telecom";

const t = parseTelecom(raw); // raw: string | Buffer (latin1 by default)

t.header.transactionCode; // "B1"
t.warnings; // stable, byte-offset-positioned tolerance warnings — never throws on quirks

const c = claim(t); // the B1/B2/B3 request view, or undefined when no segments decoded

c?.product?.id; // Product/Service ID (e.g. the NDC), verbatim
c?.product?.qualifierMeaning; // "NDC" when the qualifier is recognized
c?.quantityDispensed?.source; // Quantity Dispensed, verbatim
c?.quantityDispensed?.impliedDecimal; // "30.000" — implied 3-place decimal, applied string-wise
c?.daysSupply?.source; // decimal-safe, never a float
c?.prescriptionReferenceNumber; // the Rx reference, verbatim
c?.cardholderId; // PHI — synthetic only in fixtures
```

- **Quantity is never a float.** Quantity Dispensed carries an implied 3-place decimal; it is scaled
  **string-wise** so binary floating point can never corrupt the value, and the verbatim `source` is
  kept.
- **Versions are not guessed.** Only **vD.0** is decoded against the fixed offsets. An **F6** stamp is
  recognized but not decoded (`NCPDP_TELECOM_VF6_NOT_DECODED`); any other stamp is
  `NCPDP_TELECOM_UNSUPPORTED_VERSION`. A non-empty body with no framing bytes is
  `NCPDP_TELECOM_INVALID_FRAMING` — a separator is never guessed.
- **Nothing is dropped.** Unknown segments/fields, a missing `AM`, and malformed tokens are preserved
  verbatim and warned. Only the first transaction is decoded. See
  [Telecom spec notes](./spec-notes-telecom.md).

## Next

- Read the **API reference** for every export, generated from source.
- The [README](https://github.com/cosyte/ncpdp#readme) covers the lifecycle transactions (renewal /
  change / cancel), compound / COB / DUR / prior-authorization reads, and the spec-clean serializers
  and builders.

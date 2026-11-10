---
id: read-the-structured-sig
title: Read the structured SIG
sidebar_label: Read the structured SIG
description: "Read a prescription's structured dosing directions component by component, with each one's provenance, while the free text stays authoritative."
---

# Read the structured SIG

A prescription's directions can arrive as free text (`<SigText>`) and as a structured `<Sig>`. The
library decodes the structured part into `medication.sig`, one field per dosing component, and keeps
the free text verbatim on `sig.sigText`. The free text is the source of truth; the structured view is
additive and lossy.

```ts runnable
import { newRx, parseScript } from "@cosyte/ncpdp/script";

const xml = `<Message version="2017071"><Body><NewRx><MedicationPrescribed>
  <DrugDescription>Amoxicillin 500 MG Oral Capsule</DrugDescription>
  <Sig>
    <SigText>Take 1 capsule by mouth three times daily.</SigText>
    <DoseDeliveryMethod><Text>Take</Text><Code>419652001</Code><Qualifier>SNOMED</Qualifier></DoseDeliveryMethod>
    <DoseQuantity>1</DoseQuantity>
    <Route><Text>by mouth</Text><Code>26643006</Code><Qualifier>SNOMED</Qualifier></Route>
    <AdministrationTiming><Text>three times daily</Text></AdministrationTiming>
    <Duration><Text>10 days</Text></Duration>
  </Sig>
</MedicationPrescribed></NewRx></Body></Message>`;

const msg = parseScript(xml);
const sig = newRx(msg)?.medication?.sig;

sig?.sigText; // => "Take 1 capsule by mouth three times daily."
sig?.hasStructuredData; // => true

sig?.doseDeliveryMethod.provenance; // => "coded"
sig?.doseDeliveryMethod.code?.system; // => "SNOMED"
sig?.dose.provenance; // => "derived"
sig?.dose.text; // => "1"
sig?.route.code?.value; // => "26643006"
sig?.administrationTiming.text; // => "three times daily"

// Duration has no grounded element name, so it reads absent whatever the message carried.
sig?.duration.provenance; // => "absent"

msg.warnings.map((w) => w.code); // => ["NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY"]
```

Each of the ten components (`doseDeliveryMethod`, `dose`, `doseUnitOfMeasure`, `route`,
`siteOfAdministration`, `administrationTiming`, `duration`, `vehicle`, `indication`, and
`maximumDoseRestriction`) is always present and carries a `provenance`:

- `coded`: the element carried a `<Code>`; `code` holds the value, its qualifier verbatim, and the
  recognized system.
- `derived`: a value was read from uncoded structure (a `<Text>` child or the element's own text).
- `absent`: nothing was read. An absent component is never filled in from the free text.

Five components have no element name a published source grounds, so they always read `absent`:
`doseUnitOfMeasure`, `duration`, `vehicle`, `indication`, and `maximumDoseRestriction`.
[Structured SIG decode](./spec-notes-structured-sig.md) lists the recognized names and the evidence
for each.

## When the dose is ambiguous

If a dose element is present but no quantity can be read from it, the dose reads `absent` and the
message carries `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE`. The library never guesses a number.

```ts runnable
import { newRx, parseScript } from "@cosyte/ncpdp/script";

const msg = parseScript(`<Message version="2017071"><Body><NewRx><MedicationPrescribed>
  <DrugDescription>Hydrocortisone 1 % Topical Cream</DrugDescription>
  <Sig>
    <SigText>Apply to the affected area as directed.</SigText>
    <DoseQuantity></DoseQuantity>
  </Sig>
</MedicationPrescribed></NewRx></Body></Message>`);

newRx(msg)?.medication?.sig?.dose.provenance; // => "absent"
msg.warnings.map((w) => w.code); // => ["NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE"]
```

When the structured dose and the free text disagree, both are returned as they arrived. Show the
free text to a person; use the structured view only for what it decoded.

Reference: [`StructuredSig`](./api/@cosyte/ncpdp.md#structuredsig),
[`SigField`](./api/@cosyte/ncpdp.md#sigfield), and
[`extractStructuredSig`](./api/@cosyte/ncpdp.md#extractstructuredsig).

## Next

- [Structured SIG decode](./spec-notes-structured-sig.md): which element names are recognized, the
  source behind each, and the names that were removed.
- [Read a NewRx prescription](./read-a-newrx.md): the rest of the medication.
- [Diagnostic codes](./diagnostic-codes.md#script-warnings): the two SIG warnings.

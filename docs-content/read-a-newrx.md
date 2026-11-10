---
id: read-a-newrx
title: Read a NewRx prescription
sidebar_label: Read a NewRx
description: "Pull the patient, the prescriber, the pharmacy, and the prescribed medication out of a SCRIPT NewRx, with each coded product's system."
---

# Read a NewRx prescription

Use `parseScript` to read the message and `newRx` to project its NewRx body. `newRx` returns
`undefined` for any other transaction, so check it before reading.

```ts runnable
import { newRx, parseScript } from "@cosyte/ncpdp/script";

const xml = `<Message version="2017071">
  <Header>
    <MessageID>SYNTH-MSG-0101</MessageID>
    <SentTime>2026-01-15T09:30:00Z</SentTime>
  </Header>
  <Body><NewRx>
    <Patient><HumanPatient>
      <Name><LastName>TESTPATIENT</LastName><FirstName>AVERY</FirstName></Name>
      <Gender>F</Gender>
      <DateOfBirth><Date>1990-04-12</Date></DateOfBirth>
    </HumanPatient></Patient>
    <Pharmacy>
      <Identification><NPI>1999999999</NPI></Identification>
      <BusinessName>Synthetic Community Pharmacy</BusinessName>
    </Pharmacy>
    <Prescriber><NonVeterinarian>
      <Identification><NPI>1888888888</NPI></Identification>
      <Name><LastName>TESTPRESCRIBER</LastName><FirstName>JORDAN</FirstName></Name>
    </NonVeterinarian></Prescriber>
    <MedicationPrescribed>
      <DrugDescription>Amoxicillin 500 MG Oral Capsule</DrugDescription>
      <DrugCoded><ProductCode Qualifier="ND">00000000001</ProductCode></DrugCoded>
      <Quantity><Value>30</Value><CodeListQualifier>38</CodeListQualifier></Quantity>
      <DaysSupply>10</DaysSupply>
      <NumberOfRefills>1</NumberOfRefills>
      <Substitutions>0</Substitutions>
      <Sig><SigText>Take 1 capsule by mouth three times daily for 10 days.</SigText></Sig>
    </MedicationPrescribed>
  </NewRx></Body>
</Message>`;

const msg = parseScript(xml);
msg.header.messageId; // => "SYNTH-MSG-0101"
msg.warnings.length; // => 0

const rx = newRx(msg);
if (rx === undefined) throw new Error("not a NewRx");

rx.patient?.name?.lastName; // => "TESTPATIENT"
rx.patient?.dateOfBirth; // => "1990-04-12"
rx.prescriber?.identification?.npi; // => "1888888888"
rx.pharmacy?.businessName; // => "Synthetic Community Pharmacy"

const med = rx.medication;
med?.description; // => "Amoxicillin 500 MG Oral Capsule"
med?.coded?.productCode?.value; // => "00000000001"
med?.coded?.productCode?.system; // => "NDC"
med?.quantity?.value?.source; // => "30"
med?.daysSupply?.source; // => "10"
med?.numberOfRefills; // => "1"
med?.sigText; // => "Take 1 capsule by mouth three times daily for 10 days."
```

What to know when you read the result:

- **Every value is the wire string.** Dates such as `dateOfBirth` and `<SentTime>` stay as they
  arrived; [convert dates](./convert-dates.md) when you need a value. Quantities and days supply are
  decimal-safe values whose `source` is the wire string, never a float.
- **A coded product carries its own system.** `system` is recognized from the wire qualifier
  (`ND` is `NDC`; RxNorm, SNOMED CT, NCI Thesaurus, and ICD-10 qualifiers are recognized too, and
  anything else is `UNKNOWN`), and the raw `value` and `qualifier` are kept beside it.
- **Wrapper elements are flattened.** `<HumanPatient>` and `<NonVeterinarian>` do not appear in the
  model; their contents are on `patient` and `prescriber`.
- **A missing required element is warned, not invented.** It reads `undefined` and the message
  carries `NCPDP_SCRIPT_MISSING_REQUIRED_ELEMENT` with the XPath of the gap.
- **A coded drug and an explicit strength are both kept.** When both are present, both are surfaced
  verbatim and `NCPDP_SCRIPT_STRENGTH_CODED_AND_EXPLICIT` is raised; neither is reconciled into the
  other.

Reference: [`parseScript`](./api/@cosyte/ncpdp.md#parsescript), [`newRx`](./api/@cosyte/ncpdp.md#newrx-1),
[`NewRx`](./api/@cosyte/ncpdp.md#newrx), and
[`MedicationPrescribed`](./api/@cosyte/ncpdp.md#medicationprescribed-4).

## Next

- [Read the structured SIG](./read-the-structured-sig.md): the coded dosing view under `sig`.
- [Read a SCRIPT response](./read-script-responses.md): the Status, Error, or Verify that answers a
  NewRx.
- [Diagnostic codes](./diagnostic-codes.md#script-warnings): every SCRIPT warning.

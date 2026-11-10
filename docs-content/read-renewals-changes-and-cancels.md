---
id: read-renewals-changes-and-cancels
title: Read renewals, changes, and cancels
sidebar_label: Read renewals, changes, and cancels
description: "Read the prescription lifecycle requests and responses: RxRenewal, RxChange, and CancelRx, with an outcome that never reads a denial as an approval."
---

# Read renewals, changes, and cancels

The lifecycle transactions come in request and response pairs: `RxRenewalRequest` and
`RxRenewalResponse`, `RxChangeRequest` and `RxChangeResponse`, `CancelRx` and `CancelRxResponse`.
Each has its own projection (`rxRenewalRequest`, `rxRenewalResponse`, `rxChangeRequest`,
`rxChangeResponse`, `cancelRx`, `cancelRxResponse`), and each returns `undefined` for any other
transaction.

## Read the prescriber's decision

A response carries an `outcome`, read only from the choice element inside `<Response>`. When the
prescriber approved with changes, the changed medication is on `medicationPrescribed`, and that is
the one to dispense.

```ts runnable
import { approvalOf, parseScript, rxRenewalResponse } from "@cosyte/ncpdp/script";

const xml = `<Message version="2017071">
  <Header>
    <MessageID>SYNTH-MSG-0203</MessageID>
    <RelatesToMessageID>SYNTH-MSG-0201</RelatesToMessageID>
  </Header>
  <Body><RxRenewalResponse>
    <RequestReferenceNumber>SYNTH-REF-0201</RequestReferenceNumber>
    <Response>
      <ApprovedWithChanges><Note>Dose increased to 40 MG.</Note></ApprovedWithChanges>
    </Response>
    <MedicationPrescribed>
      <DrugDescription>Atorvastatin 40 MG Oral Tablet</DrugDescription>
      <DrugCoded><ProductCode Qualifier="ND">00000000002</ProductCode></DrugCoded>
      <Quantity><Value>30</Value></Quantity>
    </MedicationPrescribed>
  </RxRenewalResponse></Body>
</Message>`;

const renewal = rxRenewalResponse(parseScript(xml));

renewal?.outcome; // => "approvedWithChanges"
renewal?.reason?.note; // => "Dose increased to 40 MG."
renewal?.requestReferenceNumber; // => "SYNTH-REF-0201"
renewal?.medicationPrescribed?.description; // => "Atorvastatin 40 MG Oral Tablet"

approvalOf(renewal?.outcome ?? "unknown"); // => "affirmative"
```

The outcomes are `approved`, `approvedWithChanges`, `denied`, `deniedNewToFollow`, `replace`,
`validated`, and `unknown`. When you only need "did the prescriber say yes", `approvalOf` folds them
into three answers: `affirmative` for the two approvals, `negative` for the two denials, and
`indeterminate` for everything else, `unknown` included.

## Read a denial and its reason

A denial carries its reason verbatim: the code, any reference number, and the free text.

```ts runnable
import { approvalOf, cancelRxResponse, parseScript } from "@cosyte/ncpdp/script";

const xml = `<Message version="2017071">
  <Header><RelatesToMessageID>SYNTH-MSG-0401</RelatesToMessageID></Header>
  <Body><CancelRxResponse>
    <RequestReferenceNumber>SYNTH-REF-0401</RequestReferenceNumber>
    <Response><Denied>
      <ReasonCode>AA</ReasonCode>
      <DenialReason>Prescription was already dispensed and cannot be cancelled.</DenialReason>
    </Denied></Response>
  </CancelRxResponse></Body>
</Message>`;

const cancel = cancelRxResponse(parseScript(xml));

cancel?.outcome; // => "denied"
cancel?.reason?.code; // => "AA"
cancel?.reason?.denialReason; // => "Prescription was already dispensed and cannot be cancelled."
approvalOf(cancel?.outcome ?? "unknown"); // => "negative"
```

## What the reader does with a malformed outcome

- **More than one outcome element**: the reader picks by fail-safe precedence, denials first, so a
  denial is never masked by an approval beside it, and raises
  `NCPDP_SCRIPT_LIFECYCLE_AMBIGUOUS_OUTCOME`.
- **No recognized outcome element**: the outcome is `unknown`, never an assumed approval, and the
  message carries `NCPDP_SCRIPT_LIFECYCLE_OUTCOME_UNRECOGNIZED`.

```ts runnable
import { parseScript, rxChangeResponse } from "@cosyte/ncpdp/script";

const msg = parseScript(
  `<Message version="2017071"><Body><RxChangeResponse><Response><Approved/><Denied/></Response></RxChangeResponse></Body></Message>`,
);

rxChangeResponse(msg)?.outcome; // => "denied"
msg.warnings.map((w) => w.code); // => ["NCPDP_SCRIPT_LIFECYCLE_AMBIGUOUS_OUTCOME"]
```

## Read a request

The three requests share one shape: the request reference number, the patient, the pharmacy, the
prescriber, and the medication the request is about.

```ts runnable
import { parseScript, rxRenewalRequest } from "@cosyte/ncpdp/script";

const xml = `<Message version="2017071">
  <Body><RxRenewalRequest>
    <RequestReferenceNumber>SYNTH-REF-0201</RequestReferenceNumber>
    <Patient><HumanPatient><Name><LastName>TESTPATIENT</LastName></Name></HumanPatient></Patient>
    <MedicationPrescribed><DrugDescription>Atorvastatin 20 MG Oral Tablet</DrugDescription></MedicationPrescribed>
  </RxRenewalRequest></Body>
</Message>`;

const request = rxRenewalRequest(parseScript(xml));

request?.kind; // => "RxRenewalRequest"
request?.requestReferenceNumber; // => "SYNTH-REF-0201"
request?.patient?.name?.lastName; // => "TESTPATIENT"
request?.medicationPrescribed?.description; // => "Atorvastatin 20 MG Oral Tablet"
```

Reference: [`rxRenewalResponse`](./api/@cosyte/ncpdp.md#rxrenewalresponse-1),
[`cancelRxResponse`](./api/@cosyte/ncpdp.md#cancelrxresponse-1),
[`approvalOf`](./api/@cosyte/ncpdp.md#approvalof), and
[`ResponseOutcome`](./api/@cosyte/ncpdp.md#responseoutcome).

## Next

- [Read a SCRIPT response](./read-script-responses.md): the Status, Error, and Verify
  acknowledgments.
- [Read a NewRx prescription](./read-a-newrx.md): the fields the medication on a lifecycle message
  shares with a NewRx.
- [Diagnostic codes](./diagnostic-codes.md#script-warnings): the two lifecycle warnings above.

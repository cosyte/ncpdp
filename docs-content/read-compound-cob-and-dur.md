---
id: read-compound-cob-and-dur
title: Read compounds, other payers, DUR, and prior authorization
sidebar_label: Read compounds, COB, and DUR
description: "Read a claim's compound ingredients, its other-payer amounts, its submitted DUR interactions, and its prior authorization, with nothing dropped or merged."
---

# Read compounds, other payers, DUR, and prior authorization

Four views read the request segments beyond the claim, and a fifth reads the other-payer blocks of a
response. Each takes a parsed transmission and an optional transaction index, and returns
`undefined` when its segment is absent:

| View                    | Segment                  | What it returns                                           |
| ----------------------- | ------------------------ | --------------------------------------------------------- |
| `compound(t)`           | Compound (10)            | the dosage form, the declared count, and every ingredient |
| `cobOtherPayments(t)`   | COB/Other Payments (05)  | each prior payer with its amount rows                     |
| `requestDur(t)`         | DUR/PPS (08)             | each submitted DUR interaction                            |
| `priorAuthorization(t)` | Prior Authorization (12) | that the segment was submitted, with its type and number  |
| `responseCob(t)`        | Response COB (28)        | each other payer the PBM routes the claim on to           |

```ts runnable
import {
  buildTelecomRequest,
  cobOtherPayments,
  compound,
  parseTelecom,
  priorAuthorization,
  requestDur,
  serializeTelecom,
} from "@cosyte/ncpdp/telecom";

const wire = serializeTelecom(
  buildTelecomRequest({
    header: { transactionCode: "B1", binNumber: "999999", dateOfService: "20260115" },
    segments: [
      {
        segmentId: "07",
        fields: [
          { id: "D2", value: "RX0000002" },
          { id: "E7", value: "120000" },
        ],
      },
      {
        segmentId: "10",
        fields: [
          { id: "EF", value: "13" },
          { id: "EC", value: "2" },
          { id: "RE", value: "03" },
          { id: "TE", value: "99999999991" },
          { id: "ED", value: "100000" },
          { id: "EE", value: "1250" },
          { id: "RE", value: "03" },
          { id: "TE", value: "99999999992" },
          { id: "ED", value: "20000" },
          { id: "EE", value: "750" },
        ],
      },
      {
        segmentId: "05",
        fields: [
          { id: "4C", value: "1" },
          { id: "5C", value: "01" },
          { id: "6C", value: "03" },
          { id: "7C", value: "999998" },
          { id: "HC", value: "07" },
          { id: "DV", value: "2000" },
        ],
      },
      {
        segmentId: "08",
        fields: [
          { id: "E4", value: "DD" },
          { id: "E5", value: "M0" },
          { id: "E6", value: "1B" },
        ],
      },
      {
        segmentId: "12",
        fields: [
          { id: "EU", value: "1" },
          { id: "EV", value: "PA0000001" },
        ],
      },
    ],
  }),
);

const t = parseTelecom(wire);

const c = compound(t);
c?.declaredIngredientCount; // => "2"
c?.ingredients.length; // => 2
c?.ingredients.map((i) => i.productId); // => ["99999999991", "99999999992"]
c?.ingredients[0]?.quantity?.impliedDecimal; // => "100.000"
c?.ingredients[1]?.drugCost?.amount; // => "7.50"

const payer = cobOtherPayments(t)?.[0];
payer?.payerId; // => "999998"
payer?.amountsPaid[0]?.qualifier; // => "07"
payer?.amountsPaid[0]?.amount.amount; // => "20.00"

const interaction = requestDur(t)?.[0];
interaction?.reasonForServiceCode; // => "DD"
interaction?.professionalServiceCode; // => "M0"
interaction?.resultOfServiceCode; // => "1B"

priorAuthorization(t); // => { present: true, typeCode: "1", numberSubmitted: "PA0000001" }
t.warnings.length; // => 0
```

What each view guarantees:

- **Every compound ingredient is kept.** A new ingredient starts at each product id qualifier
  (`RE`) or product id (`TE`), so one is found even when a sender leaves the qualifier out. When the
  declared count disagrees with the ingredients decoded, every decoded ingredient is kept and the
  transmission carries `NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH`.
- **Every other-payer amount row is kept with its amount.** A new payer block starts at each Other
  Payer Coverage Type (`5C`), and each amount pairs with the qualifier before it, so two payments are
  never merged. A declared payer count that disagrees warns with `NCPDP_TELECOM_COB_COUNT_MISMATCH`.
- **Money and quantities are exact strings**, read the same way as the response pricing.
- **An unknown DUR reason is kept.** A Reason For Service code outside the labeled set is kept with
  `reasonKnown: false` and warned with `NCPDP_TELECOM_UNKNOWN_DUR_REASON`. Professional service,
  result, and level-of-effort codes are verbatim, with no descriptions.
- **Prior authorization is presence, not adjudication.** The view says the segment was submitted and
  echoes its type and number. Whether an authorization is valid is the PBM's decision, returned in
  the response.

## Read the other payers in a response

```ts runnable
import { parseTelecom, responseCob } from "@cosyte/ncpdp/telecom";

const FS = "\x1c";
const GS = "\x1d";
const RS = "\x1e";

const header = "D0" + "B1" + "1" + "A" + "01" + "1234567890".padEnd(15);
const status = ["AM21", "ANP"].join(FS);
const cob = [
  "AM28",
  "NT1",
  "5C02",
  "6C03",
  "7C999997",
  "MHPCN0000002",
  "NUSYNTHCARD10",
  "MJGRP0000001",
].join(FS);

const next = responseCob(parseTelecom(header + GS + status + RS + cob))?.[0];

next?.coverageType; // => "02"
next?.payerId; // => "999997"
next?.processorControlNumber; // => "PCN0000002"
next?.cardholderId; // => "SYNTHCARD10"
next?.groupId; // => "GRP0000001"
```

Reference: [`compound`](./api/@cosyte/ncpdp/telecom.md#compound),
[`cobOtherPayments`](./api/@cosyte/ncpdp/telecom.md#cobotherpayments),
[`requestDur`](./api/@cosyte/ncpdp/telecom.md#requestdur),
[`priorAuthorization`](./api/@cosyte/ncpdp/telecom.md#priorauthorization), and
[`responseCob`](./api/@cosyte/ncpdp/telecom.md#responsecob).

## Next

- [Compound, COB, and DUR depth](./spec-notes-telecom-compound-cob.md): every field these views lift,
  with its NCPDP designator.
- [Read a Telecom claim](./read-a-telecom-claim.md): the claim fields and the transaction index.
- [Read a PBM response](./read-a-pbm-response.md): the status, pricing, and DUR alerts of the
  answer.

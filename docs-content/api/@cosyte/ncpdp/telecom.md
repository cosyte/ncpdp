# @cosyte/ncpdp/telecom

`@cosyte/ncpdp/telecom`: NCPDP Telecommunication-standard (vD.0) claim parsing.
The zero-dependency claim side. Reading: validates the FS/GS/RS
control-character framing, decodes the fixed request or response Transaction
Header, tokenizes the field-id-keyed variable segments, and lifts the B1/B2/B3
request view, the response adjudication (status, pricing, DUR), and the
request-side depth (compound, coordination of benefits, DUR, prior
authorization). Emitting: serializes a transaction back to spec-clean wire form
and builds one from scratch. Liberal on parse (quirks become stable-coded
warnings with byte-offset context); only structurally unrecoverable input throws
a Telecom fatal. Conservative on emit.

## Interfaces

### TelecomAdjudication

The full adjudication view over a parsed response: the per-claim status (with
its fail-safe disposition), the adjudicated pricing, and every DUR alert.

#### Properties

##### dur

> `readonly` **dur**: readonly [`TelecomDurAlert`](#telecomduralert)[]

Every returned DUR alert (24), in wire order: never dropped.

##### pricing?

> `readonly` `optional` **pricing?**: [`TelecomPricing`](#telecompricing)

The Response Pricing (23) view, when present.

##### status?

> `readonly` `optional` **status?**: [`TelecomResponseStatus`](#telecomresponsestatus)

The Response Status (21) view, when present.

##### transactionCode

> `readonly` **transactionCode**: `string`

Transaction Code (103-A3) echoed by the response, e.g. `"B1"`/`"E1"`.

***

### TelecomCompound

The Compound segment (10) view: the preparation-level descriptors plus every
ingredient in wire order. [declaredIngredientCount](#declaredingredientcount) is the count the
sender claimed (447-EC); compare it against `ingredients.length` to detect a
truncated compound: the parser also raises
`NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH` when the two disagree.

#### Properties

##### declaredIngredientCount?

> `readonly` `optional` **declaredIngredientCount?**: `string`

Compound Ingredient Component Count (447-EC) the sender declared, verbatim.

##### dispensingUnitFormIndicator?

> `readonly` `optional` **dispensingUnitFormIndicator?**: `string`

Compound Dispensing Unit Form Indicator (451-EG), verbatim, when present.

##### dosageFormCode?

> `readonly` `optional` **dosageFormCode?**: `string`

Compound Dosage Form Description Code (450-EF), verbatim, when present.

##### ingredients

> `readonly` **ingredients**: readonly [`TelecomCompoundIngredient`](#telecomcompoundingredient)[]

Every ingredient surfaced in wire order: never dropped or merged.

***

### TelecomCompoundIngredient

One ingredient of a compound preparation, preserved verbatim. The product id
names the substance; its qualifier names the id's code system. Quantity and
cost are decimal-safe (never float). Absent fields are simply omitted: a
missing field is `undefined`, never a guess.

#### Properties

##### basisOfCostDetermination?

> `readonly` `optional` **basisOfCostDetermination?**: `string`

Compound Ingredient Basis of Cost Determination (490-UE), verbatim.

##### drugCost?

> `readonly` `optional` **drugCost?**: [`TelecomMoney`](#telecommoney)

Compound Ingredient Drug Cost (449-EE), decimal-safe, when present.

##### productId

> `readonly` **productId**: `string`

Compound Product ID (489-TE), verbatim: e.g. an 11-digit NDC.

##### productIdQualifier

> `readonly` **productIdQualifier**: `string`

Compound Product ID Qualifier (488-RE), verbatim. No label ships for a
product-id qualifier: no public artifact establishing the value set could be
obtained, so the qualifier is surfaced and never interpreted.

##### quantity?

> `readonly` `optional` **quantity?**: [`TelecomQuantity`](../ncpdp.md#telecomquantity)

Compound Ingredient Quantity (448-ED) with its implied 3-place decimal.

***

### TelecomDurAlert

One returned DUR/PPS alert from the Response DUR/PPS (24) segment.

#### Properties

##### clinicalSignificanceCode?

> `readonly` `optional` **clinicalSignificanceCode?**: `string`

Clinical Significance Code (528-FS), verbatim, when present.

##### counter?

> `readonly` `optional` **counter?**: `string`

DUR/PPS Response Code Counter (567-J6) for this occurrence, when present.

##### freeText?

> `readonly` `optional` **freeText?**: `string`

DUR Free Text Message (544-FY), verbatim, when present. May be PHI-adjacent.

##### levelOfEffort?

> `readonly` `optional` **levelOfEffort?**: `string`

DUR/PPS Level Of Effort (474-8E), verbatim, when present.

##### previousDateOfFill?

> `readonly` `optional` **previousDateOfFill?**: `string`

Previous Date Of Fill (530-FU), verbatim, when present.

##### professionalServiceCode?

> `readonly` `optional` **professionalServiceCode?**: `string`

Professional Service Code (440-E5), verbatim, when present (description BYO).

##### quantityOfPreviousFill?

> `readonly` `optional` **quantityOfPreviousFill?**: `string`

Quantity Of Previous Fill (531-FV), verbatim, when present.

##### reasonDescription?

> `readonly` `optional` **reasonDescription?**: `string`

Short paraphrased reason description, when known.

##### reasonForServiceCode?

> `readonly` `optional` **reasonForServiceCode?**: `string`

Reason For Service Code (439-E4), verbatim: the alert type.

##### reasonKnown

> `readonly` **reasonKnown**: `boolean`

True when [reasonForServiceCode](#reasonforservicecode) is in [DUR\_REASON\_MEANINGS](#dur_reason_meanings).

##### resultOfServiceCode?

> `readonly` `optional` **resultOfServiceCode?**: `string`

Result Of Service Code (441-E6), verbatim, when present (description BYO).

***

### TelecomDurRequest

One DUR/PPS interaction from the **request** segment (08): the reason that
prompted review and the pharmacist's professional service and result. Reason
carries a description when recognized; professional-service and result codes
are verbatim only (description bring-your-own).

#### Properties

##### coAgentId?

> `readonly` `optional` **coAgentId?**: `string`

DUR Co-Agent ID (476-H7), verbatim, when present.

##### coAgentIdQualifier?

> `readonly` `optional` **coAgentIdQualifier?**: `string`

DUR Co-Agent ID Qualifier (475-J9), verbatim, when present.

##### levelOfEffort?

> `readonly` `optional` **levelOfEffort?**: `string`

DUR/PPS Level Of Effort (474-8E), verbatim, when present.

##### professionalServiceCode?

> `readonly` `optional` **professionalServiceCode?**: `string`

Professional Service Code (440-E5), verbatim, when present.

##### reasonDescription?

> `readonly` `optional` **reasonDescription?**: `string`

Short paraphrased reason description, when known.

##### reasonForServiceCode?

> `readonly` `optional` **reasonForServiceCode?**: `string`

Reason For Service Code (439-E4), verbatim, when present.

##### reasonKnown

> `readonly` **reasonKnown**: `boolean`

True when [reasonForServiceCode](#reasonforservicecode-1) is in [DUR\_REASON\_MEANINGS](#dur_reason_meanings).

##### resultOfServiceCode?

> `readonly` `optional` **resultOfServiceCode?**: `string`

Result Of Service Code (441-E6), verbatim, when present.

***

### TelecomMoney

A monetary amount from a Telecom response, preserved exactly as it appeared on
the wire. The verbatim [source](#source) is authoritative; [amount](#amount) is a
best-effort string-wise interpretation present only when [isValid](#isvalid).

#### Properties

##### amount?

> `readonly` `optional` **amount?**: `string`

The signed decimal string (e.g. `"10.00"`, `"-3.50"`), present when valid.

##### isNegative?

> `readonly` `optional` **isNegative?**: `boolean`

True when the decoded amount is negative (overpunch or leading `-`).

##### isValid

> `readonly` **isValid**: `boolean`

True when [source](#source) decodes to a signed implied-2-decimal amount.

##### source

> `readonly` **source**: `string`

The amount exactly as it appeared on the wire, verbatim.

***

### TelecomOtherPayer

One other-payer block from the **request** COB / Other Payments segment (05):
who the other payer is and what they paid / left as patient responsibility.
Every money row is preserved in wire order: none dropped.

#### Properties

##### amountsPaid

> `readonly` **amountsPaid**: readonly [`TelecomOtherPayerAmount`](#telecomotherpayeramount)[]

Every Other Payer Amount Paid (431-DV) row, in wire order: none dropped.

##### coverageType?

> `readonly` `optional` **coverageType?**: `string`

Other Payer Coverage Type (338-5C), verbatim, when present.

##### patientResponsibilityAmounts

> `readonly` **patientResponsibilityAmounts**: readonly [`TelecomOtherPayerAmount`](#telecomotherpayeramount)[]

Every Other Payer-Patient Responsibility (473-7E) row, in wire order.

##### payerDate?

> `readonly` `optional` **payerDate?**: `string`

Other Payer Date (443-E8), verbatim, when present.

##### payerId?

> `readonly` `optional` **payerId?**: `string`

Other Payer ID (340-7C), verbatim, when present.

##### payerIdQualifier?

> `readonly` `optional` **payerIdQualifier?**: `string`

Other Payer ID Qualifier (339-6C), verbatim, when present.

***

### TelecomOtherPayerAmount

A single other-payer money row: a verbatim qualifier and a decimal-safe amount.

#### Properties

##### amount

> `readonly` **amount**: [`TelecomMoney`](#telecommoney)

The amount, decimal-safe (never float).

##### qualifier?

> `readonly` `optional` **qualifier?**: `string`

The amount qualifier (e.g. 342-HC / 472-6E), verbatim, when present.

***

### TelecomPricing

The Response Pricing (23) view: the adjudicated dollar amounts, never float.

#### Properties

##### basisOfReimbursement?

> `readonly` `optional` **basisOfReimbursement?**: `string`

Basis of Reimbursement Determination (522-FM), verbatim.

##### dispensingFeePaid?

> `readonly` `optional` **dispensingFeePaid?**: [`TelecomMoney`](#telecommoney)

Dispensing Fee Paid (507-F7).

##### ingredientCostPaid?

> `readonly` `optional` **ingredientCostPaid?**: [`TelecomMoney`](#telecommoney)

Ingredient Cost Paid (506-F6).

##### patientPayAmount?

> `readonly` `optional` **patientPayAmount?**: [`TelecomMoney`](#telecommoney)

Patient Pay Amount (505-F5).

##### totalAmountPaid?

> `readonly` `optional` **totalAmountPaid?**: [`TelecomMoney`](#telecommoney)

Total Amount Paid (509-F9).

***

### TelecomPriorAuthorization

The Prior Authorization (12) presence view. `present` is always `true` when
this object exists (the accessor returns `undefined` when the segment is
absent), so a consumer can branch on presence without inspecting the optional
fields. The type and number are surfaced verbatim; no approval is implied.

#### Properties

##### numberSubmitted?

> `readonly` `optional` **numberSubmitted?**: `string`

Prior Authorization Number Submitted (462-EV), verbatim, when present.

##### present

> `readonly` **present**: `true`

Always `true`: the Prior Authorization segment was present.

##### typeCode?

> `readonly` `optional` **typeCode?**: `string`

Prior Authorization Type Code (461-EU), verbatim, when present.

***

### TelecomRejectCode

A reject code (511-FB) surfaced verbatim with a recognition flag.

#### Properties

##### code

> `readonly` **code**: `string`

The reject code exactly as it appeared on the wire.

##### known

> `readonly` **known**: `boolean`

Whether this package recognizes [code](#code). Currently `false` for every
reject code: this package ships no 511-FB label table, so there is nothing to
recognize a code against. What the one carried payer manual does and does not
establish for this field, and why the table was withdrawn rather than sourced
from it, is recorded in source above. The flag is kept on every occurrence so
the shape a consumer reads does not change.

***

### TelecomResponseHeader

Field numbers/designators are NCPDP vD.0; names are our own paraphrases.

#### Properties

##### headerResponseStatus

> `readonly` **headerResponseStatus**: `string`

501-F1: Header Response Status: the **transmission-level** accept/reject
flag (`"A"` accepted, `"R"` rejected). This is distinct from the per-claim
Transaction Response Status (112-AN) in the Response Status segment.

##### serviceProviderId

> `readonly` **serviceProviderId**: `string`

201-B1: Service Provider ID (e.g. the pharmacy NPI).

##### serviceProviderIdQualifier

> `readonly` **serviceProviderIdQualifier**: `string`

202-B2: Service Provider ID Qualifier.

##### transactionCode

> `readonly` **transactionCode**: `string`

103-A3: Transaction Code echoed from the request, e.g. `"B1"`/`"B2"`/`"E1"`.

##### transactionCount

> `readonly` **transactionCount**: `string`

109-A9: declared number of transactions in the transmission (1 char).

##### versionRelease

> `readonly` **versionRelease**: `string`

102-A2: Version/Release, `"D0"` for the standard this reader decodes.

***

### TelecomResponseOtherPayer

One other-payer block from the **response** COB / Other Payers segment (28):
the routing identifiers the payer says to use when billing the next payer.

#### Properties

##### cardholderId?

> `readonly` `optional` **cardholderId?**: `string`

Other Payer Cardholder ID (356-NU), verbatim, when present. PHI.

##### coverageType?

> `readonly` `optional` **coverageType?**: `string`

Other Payer Coverage Type (338-5C), verbatim, when present.

##### groupId?

> `readonly` `optional` **groupId?**: `string`

Other Payer Group ID (992-MJ), verbatim, when present.

##### payerId?

> `readonly` `optional` **payerId?**: `string`

Other Payer ID (340-7C), verbatim, when present.

##### payerIdQualifier?

> `readonly` `optional` **payerIdQualifier?**: `string`

Other Payer ID Qualifier (339-6C), verbatim, when present.

##### processorControlNumber?

> `readonly` `optional` **processorControlNumber?**: `string`

Other Payer Processor Control Number (991-MH), verbatim, when present.

***

### TelecomResponseStatus

The Response Status (21) view: the adjudication outcome with its fail-safe
[disposition](#disposition), the verbatim reject codes (never dropped), and the
authorization number when paid.

#### Properties

##### additionalMessage?

> `readonly` `optional` **additionalMessage?**: `string`

Additional Message Information (526-FQ), verbatim, when present.

##### authorizationNumber?

> `readonly` `optional` **authorizationNumber?**: `string`

Authorization Number (503-F3), when present (typically on a paid response).

##### disposition

> `readonly` **disposition**: [`Disposition`](#disposition-1)

The fail-safe disposition over status **and** reject codes. `"rejected"`
whenever any reject is present, regardless of the status field; `"unknown"`
for an unrecognized status: never silently `"paid"`.

##### rejectCodes

> `readonly` **rejectCodes**: readonly [`TelecomRejectCode`](#telecomrejectcode)[]

Every Reject Code (511-FB) returned, in wire order: none dropped.

##### rejectCount?

> `readonly` `optional` **rejectCount?**: `string`

Reject Count (510-FA), verbatim, when present.

##### statusConflict

> `readonly` **statusConflict**: `boolean`

True when the status field claimed a positive outcome (paid/captured/
approved/duplicate) yet reject codes were present. The disposition is forced
to `"rejected"`; this flags that the source disagreed with itself.

##### transactionResponseStatus

> `readonly` **transactionResponseStatus**: `string`

Transaction Response Status (112-AN), verbatim.

## Type Aliases

### Disposition

> **Disposition** = `"paid"` \| `"captured"` \| `"approved"` \| `"duplicate"` \| `"deferred"` \| `"rejected"` \| `"unknown"`

The fail-safe adjudication disposition. Derived from the Transaction Response
Status and the reject codes together: never from the status field alone.

## Variables

### DUR\_REASON\_MEANINGS

> `const` **DUR\_REASON\_MEANINGS**: `ReadonlyMap`\<`string`, `string`\>

Short labels for the DUR Reason For Service codes (439-E4) that a public artifact
establishes. A code outside this set is preserved verbatim with `known: false`
and no description: absence of a label never means the code is invalid.

The establishing artifact, its retrieval date and the single-source caveat that
travels with it are recorded in source immediately above this declaration, and
summarized for consumers in `KNOWN-LIMITATIONS.md`. Read the caveat before
relying on a label: it is corroborated by one state Medicaid payer manual, which
is not the NCPDP External Code List.

#### Example

```ts
import { DUR_REASON_MEANINGS } from "@cosyte/ncpdp/telecom";
DUR_REASON_MEANINGS.get("DD"); // "Drug-Drug Interaction"
DUR_REASON_MEANINGS.get("MC"); // undefined: kept verbatim with known: false
```

***

### RESPONSE\_HEADER\_MIN\_LENGTH

> `const` **RESPONSE\_HEADER\_MIN\_LENGTH**: `6` = `6`

Minimum bytes needed to read the safety-relevant leading response fields.

#### Example

```ts
import { RESPONSE_HEADER_MIN_LENGTH } from "@cosyte/ncpdp/telecom";
RESPONSE_HEADER_MIN_LENGTH; // 6: shorter input can't carry the response header
```

***

### RESPONSE\_STATUS\_MEANINGS

> `const` **RESPONSE\_STATUS\_MEANINGS**: `ReadonlyMap`\<`string`, `StatusMeaning`\>

Fail-safe [Disposition](#disposition-1) for each Transaction Response Status (112-AN) value
this parser models. A value outside this set reads `"unknown"` and is preserved
verbatim. This map carries **no** human-readable description: the package ships
no label table for 112-AN, because no public artifact establishing one could be
obtained. See `KNOWN-LIMITATIONS.md`.

#### Example

```ts
import { RESPONSE_STATUS_MEANINGS } from "@cosyte/ncpdp/telecom";
RESPONSE_STATUS_MEANINGS.get("P")?.disposition; // "paid"
RESPONSE_STATUS_MEANINGS.get("R")?.disposition; // "rejected"
```

## Functions

### adjudication()

> **adjudication**(`transaction`, `index?`): [`TelecomAdjudication`](#telecomadjudication) \| `undefined`

Build the bundled [TelecomAdjudication](#telecomadjudication) view over a parsed Telecom
**response** transmission. Returns `undefined` when the transaction is not a
response (no response header) or carries no segments.

A response transmission may carry an answer per submitted claim, so the view is
addressed by transaction index and every decoded transaction is reachable: a
consumer is never shown the first claim's disposition as though it were the
whole message.

#### Parameters

##### transaction

[`TelecomTransaction`](../ncpdp.md#telecomtransaction)

A transmission from [parseTelecom](../ncpdp.md#parsetelecom).

##### index?

`number` = `0`

Zero-based transaction index; defaults to the first.

#### Returns

[`TelecomAdjudication`](#telecomadjudication) \| `undefined`

The adjudication view, or `undefined` for a non-response.

#### Example

```ts
const a = adjudication(parseTelecom(rawResponse));
a?.status?.disposition;             // "paid" | "rejected" | …
a?.pricing?.patientPayAmount?.amount; // "10.00"
a?.dur.length;                      // returned DUR alert count
```

***

### cobOtherPayments()

> **cobOtherPayments**(`transaction`, `index?`): readonly [`TelecomOtherPayer`](#telecomotherpayer)[]

Build the **request** COB / Other Payments (05) view: every other-payer block
with its amount-paid and patient-responsibility money rows. Returns an empty
array when no segment 05 is present. No block and no money row is ever dropped.

#### Parameters

##### transaction

[`TelecomTransaction`](../ncpdp.md#telecomtransaction)

A transmission from [parseTelecom](../ncpdp.md#parsetelecom).

##### index?

`number` = `0`

Zero-based transaction index; defaults to the first.

#### Returns

readonly [`TelecomOtherPayer`](#telecomotherpayer)[]

Every other-payer block, in wire order.

#### Example

```ts
const payers = cobOtherPayments(parseTelecom(rawSecondaryClaim));
payers[0]?.amountsPaid[0]?.amount.amount; // first other payer's paid amount
```

***

### collectCobWarnings()

> **collectCobWarnings**(`segments`, `warnings`): `void`

Raise `NCPDP_TELECOM_COB_COUNT_MISMATCH` when a COB segment declares an
other-payer count (337-4C on the request 05, 355-NT on the response 28) that
disagrees with the number of decoded other-payer blocks. Checks whichever COB
segment(s) are present; safe to call on either parse path. No block is dropped.

#### Parameters

##### segments

readonly [`TelecomSegment`](../ncpdp.md#telecomsegment)[]

The decoded segments.

##### warnings

[`NcpdpTelecomWarning`](../ncpdp.md#ncpdptelecomwarning)[]

The parse warning sink.

#### Returns

`void`

#### Example

```ts
const warnings: NcpdpTelecomWarning[] = [];
collectCobWarnings(transaction.segments, warnings);
```

***

### collectCompoundWarnings()

> **collectCompoundWarnings**(`segments`, `warnings`): `void`

Raise `NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH` when a Compound segment declares
an ingredient component count (447-EC) that disagrees with the number of
ingredient occurrences decoded. Called on the request path so the signal lives
on `transaction.warnings`. No ingredient is dropped either way.

#### Parameters

##### segments

readonly [`TelecomSegment`](../ncpdp.md#telecomsegment)[]

The decoded request segments.

##### warnings

[`NcpdpTelecomWarning`](../ncpdp.md#ncpdptelecomwarning)[]

The parse warning sink.

#### Returns

`void`

#### Example

```ts
const warnings: NcpdpTelecomWarning[] = [];
collectCompoundWarnings(transaction.segments, warnings);
```

***

### collectDurWarnings()

> **collectDurWarnings**(`segments`, `warnings`): `void`

Emit a warning for each request DUR/PPS interaction whose Reason For Service
code is unrecognized: preserved verbatim, never dropped. Called on the request
path so the signal lives on `transaction.warnings`.

#### Parameters

##### segments

readonly [`TelecomSegment`](../ncpdp.md#telecomsegment)[]

The decoded request segments.

##### warnings

[`NcpdpTelecomWarning`](../ncpdp.md#ncpdptelecomwarning)[]

The parse warning sink.

#### Returns

`void`

#### Example

```ts
const warnings: NcpdpTelecomWarning[] = [];
collectDurWarnings(transaction.segments, warnings);
```

***

### collectResponseWarnings()

> **collectResponseWarnings**(`segments`, `warnings`): `void`

Emit the response safety warnings into a parse-time sink: an unrecognized reject
code, an unrecognized status, and the paid-with-rejects conflict. Pure with
respect to the segments; called by [parseTelecom](../ncpdp.md#parsetelecom) on the response path so
these signals live on `transaction.warnings` rather than only in a derived view.

Because the package ships no 511-FB label table, **every** reject code present is
unrecognized and raises the unknown-reject warning: one per code, position only,
never the code value itself.

#### Parameters

##### segments

readonly [`TelecomSegment`](../ncpdp.md#telecomsegment)[]

The decoded response segments.

##### warnings

[`NcpdpTelecomWarning`](../ncpdp.md#ncpdptelecomwarning)[]

The parse warning sink.

#### Returns

`void`

#### Example

```ts
const warnings: NcpdpTelecomWarning[] = [];
collectResponseWarnings(segments, warnings);
warnings.map((w) => w.code); // e.g. ["NCPDP_TELECOM_STATUS_CONFLICT"]
```

***

### compound()

> **compound**(`transaction`, `index?`): [`TelecomCompound`](#telecomcompound) \| `undefined`

Build the Compound (10) view over a parsed Telecom transaction. Returns
`undefined` when no Compound segment is present. Every ingredient is surfaced
in wire order, none dropped: compare [TelecomCompound.declaredIngredientCount](#declaredingredientcount)
with `ingredients.length` (or watch for `NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH`)
to detect a truncated compound.

#### Parameters

##### transaction

[`TelecomTransaction`](../ncpdp.md#telecomtransaction)

A transmission from [parseTelecom](../ncpdp.md#parsetelecom).

##### index?

`number` = `0`

Zero-based transaction index; defaults to the first.

#### Returns

[`TelecomCompound`](#telecomcompound) \| `undefined`

The compound view, or `undefined` when there is no Compound segment.

#### Example

```ts
const c = compound(parseTelecom(rawCompoundClaim));
c?.ingredients.length;          // number of ingredients (none dropped)
c?.ingredients[0]?.productId;   // the first ingredient's NDC
```

***

### decodeResponseHeader()

> **decodeResponseHeader**(`region`): [`TelecomResponseHeader`](#telecomresponseheader)

Decode the fixed D.0 response header from the unframed header region (the
portion before the first framing control character). Each positional field is sliced
and trimmed of pad whitespace; a field that runs past the region is left empty
rather than read into the framed body.

#### Parameters

##### region

`string`

The unframed header region of a response transmission.

#### Returns

[`TelecomResponseHeader`](#telecomresponseheader)

A frozen [TelecomResponseHeader](#telecomresponseheader).

#### Example

```ts
decodeResponseHeader("D0B11A01" + "1234567890     ").transactionCode; // "B1"
```

***

### fieldValues()

> **fieldValues**(`segment`, `fieldId`): readonly `string`[]

Read **every** value for a given field id within a segment, in wire order. A
Telecom segment can repeat a field (e.g. multiple Reject Codes in a Response
Status segment); collapsing the repeats to the first match would silently drop
a reject code or a DUR alert, so callers that must not lose data use this.

#### Parameters

##### segment

[`TelecomSegment`](../ncpdp.md#telecomsegment) \| `undefined`

The segment to read, or `undefined`.

##### fieldId

`string`

The 2-character field id, e.g. `"FB"`.

#### Returns

readonly `string`[]

Every matching value in wire order (empty array when none/absent).

#### Example

```ts
fieldValues(findSegment(t.segments, "21"), "FB"); // ["70", "88"]: all rejects
```

***

### priorAuthorization()

> **priorAuthorization**(`transaction`, `index?`): [`TelecomPriorAuthorization`](#telecompriorauthorization) \| `undefined`

Build the Prior Authorization presence view over a parsed Telecom transaction.
Returns `undefined` when no Prior Authorization (12) segment is present;
otherwise a [TelecomPriorAuthorization](#telecompriorauthorization) with `present: true` and the
submitted type/number verbatim. Surfaces presence only: never adjudicates.

#### Parameters

##### transaction

[`TelecomTransaction`](../ncpdp.md#telecomtransaction)

A transmission from [parseTelecom](../ncpdp.md#parsetelecom).

##### index?

`number` = `0`

Zero-based transaction index; defaults to the first.

#### Returns

[`TelecomPriorAuthorization`](#telecompriorauthorization) \| `undefined`

The PA presence view, or `undefined` when no PA segment is present.

#### Example

```ts
const pa = priorAuthorization(parseTelecom(rawClaim));
if (pa) {
  pa.numberSubmitted; // the submitted PA number, verbatim (no approval implied)
}
```

***

### requestDur()

> **requestDur**(`transaction`, `index?`): readonly [`TelecomDurRequest`](#telecomdurrequest)[]

Read every DUR/PPS interaction from the **request** segment (08). Splits at each
Reason For Service (439-E4) so a multi-interaction segment surfaces one entry
per interaction; an interaction without a reason code (a bare professional
service) is still surfaced. Returns an empty array when no segment 08 is present.

#### Parameters

##### transaction

[`TelecomTransaction`](../ncpdp.md#telecomtransaction)

A transmission from [parseTelecom](../ncpdp.md#parsetelecom).

##### index?

`number` = `0`

Zero-based transaction index; defaults to the first.

#### Returns

readonly [`TelecomDurRequest`](#telecomdurrequest)[]

Every request-side DUR/PPS interaction, in wire order.

#### Example

```ts
const dur = requestDur(parseTelecom(rawClaimWithDur));
dur[0]?.reasonForServiceCode;  // e.g. "DD"
dur[0]?.professionalServiceCode; // verbatim (description BYO)
```

***

### responseCob()

> **responseCob**(`transaction`, `index?`): readonly [`TelecomResponseOtherPayer`](#telecomresponseotherpayer)[]

Build the **response** COB / Other Payers (28) view: every other-payer routing
block the payer returned. Returns an empty array when no segment 28 is present.
No block is dropped.

#### Parameters

##### transaction

[`TelecomTransaction`](../ncpdp.md#telecomtransaction)

A transmission from [parseTelecom](../ncpdp.md#parsetelecom).

##### index?

`number` = `0`

Zero-based transaction index; defaults to the first.

#### Returns

readonly [`TelecomResponseOtherPayer`](#telecomresponseotherpayer)[]

Every response other-payer block, in wire order.

#### Example

```ts
const next = responseCob(parseTelecom(rawResponse));
next[0]?.payerId; // the next payer to bill
```

***

### responseDur()

> **responseDur**(`transaction`, `index?`): readonly [`TelecomDurAlert`](#telecomduralert)[]

Build the DUR/PPS alert list from a parsed response. The Response DUR/PPS (24)
segment repeats its fields once per alert; this splits at each counter (567-J6)
**and** at each new Reason For Service (439-E4) so no alert is ever collapsed
into another. Returns an empty array when no DUR/PPS segment is present.

#### Parameters

##### transaction

[`TelecomTransaction`](../ncpdp.md#telecomtransaction)

A transmission from [parseTelecom](../ncpdp.md#parsetelecom).

##### index?

`number` = `0`

Zero-based transaction index; defaults to the first.

#### Returns

readonly [`TelecomDurAlert`](#telecomduralert)[]

Every returned DUR alert, in wire order.

#### Example

```ts
responseDur(parseTelecom(rawResponse)).length; // number of returned alerts
```

***

### responsePricing()

> **responsePricing**(`transaction`, `index?`): [`TelecomPricing`](#telecompricing) \| `undefined`

Build the [TelecomPricing](#telecompricing) view from a parsed response. Returns
`undefined` when no Response Pricing (23) segment is present. Every dollar
amount is preserved verbatim and interpreted string-wise, never as a float.

#### Parameters

##### transaction

[`TelecomTransaction`](../ncpdp.md#telecomtransaction)

A transmission from [parseTelecom](../ncpdp.md#parsetelecom).

##### index?

`number` = `0`

Zero-based transaction index; defaults to the first.

#### Returns

[`TelecomPricing`](#telecompricing) \| `undefined`

The pricing view, or `undefined`.

#### Example

```ts
responsePricing(parseTelecom(rawResponse))?.patientPayAmount?.amount; // "10.00"
```

***

### responseStatus()

> **responseStatus**(`transaction`, `index?`): [`TelecomResponseStatus`](#telecomresponsestatus) \| `undefined`

Build the [TelecomResponseStatus](#telecomresponsestatus) view from a parsed response. Returns
`undefined` when no Response Status (21) segment is present.

#### Parameters

##### transaction

[`TelecomTransaction`](../ncpdp.md#telecomtransaction)

A transmission from [parseTelecom](../ncpdp.md#parsetelecom).

##### index?

`number` = `0`

Zero-based transaction index; defaults to the first.

#### Returns

[`TelecomResponseStatus`](#telecomresponsestatus) \| `undefined`

The status view, or `undefined`.

#### Example

```ts
responseStatus(parseTelecom(rawResponse))?.disposition; // "paid" | "rejected" | …
```

***

### telecomMoney()

> **telecomMoney**(`source`): [`TelecomMoney`](#telecommoney)

Decode an NCPDP Telecom dollar-amount field into a [TelecomMoney](#telecommoney). Never
uses floating point: the verbatim source is preserved and the implied 2-place
decimal is applied string-wise. Unrecognized input is preserved with
`isValid: false` and no interpreted amount: money is never guessed.

#### Parameters

##### source

`string`

The amount exactly as it appeared on the wire.

#### Returns

[`TelecomMoney`](#telecommoney)

A frozen [TelecomMoney](#telecommoney).

#### Example

```ts
telecomMoney("0001000").amount; // "10.00"
telecomMoney("000350}").amount; // "-3.50" (negative overpunch)
telecomMoney("N/A").isValid;    // false (preserved verbatim)
```

## References

### buildTelecomRequest

Re-exports [buildTelecomRequest](../ncpdp.md#buildtelecomrequest)

***

### claim

Re-exports [claim](../ncpdp.md#claim)

***

### claimView

Re-exports [claimView](../ncpdp.md#claimview)

***

### D0\_HEADER\_LENGTH

Re-exports [D0_HEADER_LENGTH](../ncpdp.md#d0_header_length)

***

### decodeD0Header

Re-exports [decodeD0Header](../ncpdp.md#decoded0header)

***

### detectVersion

Re-exports [detectVersion](../ncpdp.md#detectversion)

***

### FIELD\_NAMES

Re-exports [FIELD_NAMES](../ncpdp.md#field_names)

***

### FIELD\_SEPARATOR

Re-exports [FIELD_SEPARATOR](../ncpdp.md#field_separator)

***

### fieldValue

Re-exports [fieldValue](../ncpdp.md#fieldvalue)

***

### findSegment

Re-exports [findSegment](../ncpdp.md#findsegment)

***

### GROUP\_SEPARATOR

Re-exports [GROUP_SEPARATOR](../ncpdp.md#group_separator)

***

### impliedThreeDecimal

Re-exports [impliedThreeDecimal](../ncpdp.md#impliedthreedecimal)

***

### NcpdpTelecomBuildError

Re-exports [NcpdpTelecomBuildError](../ncpdp.md#ncpdptelecombuilderror)

***

### NcpdpTelecomParseError

Re-exports [NcpdpTelecomParseError](../ncpdp.md#ncpdptelecomparseerror)

***

### NcpdpTelecomWarning

Re-exports [NcpdpTelecomWarning](../ncpdp.md#ncpdptelecomwarning)

***

### parseTelecom

Re-exports [parseTelecom](../ncpdp.md#parsetelecom)

***

### SEGMENT\_ABSENCES

Re-exports [SEGMENT_ABSENCES](../ncpdp.md#segment_absences)

***

### SEGMENT\_CODE\_RANGES

Re-exports [SEGMENT_CODE_RANGES](../ncpdp.md#segment_code_ranges)

***

### SEGMENT\_ID\_LENGTH

Re-exports [SEGMENT_ID_LENGTH](../ncpdp.md#segment_id_length)

***

### SEGMENT\_NAMES

Re-exports [SEGMENT_NAMES](../ncpdp.md#segment_names)

***

### SEGMENT\_SEPARATOR

Re-exports [SEGMENT_SEPARATOR](../ncpdp.md#segment_separator)

***

### SegmentAbsence

Re-exports [SegmentAbsence](../ncpdp.md#segmentabsence)

***

### SegmentAbsenceReason

Re-exports [SegmentAbsenceReason](../ncpdp.md#segmentabsencereason-1)

***

### SegmentCodeRange

Re-exports [SegmentCodeRange](../ncpdp.md#segmentcoderange)

***

### SegmentGroup

Re-exports [SegmentGroup](../ncpdp.md#segmentgroup)

***

### serializeTelecom

Re-exports [serializeTelecom](../ncpdp.md#serializetelecom)

***

### splitWithOffsets

Re-exports [splitWithOffsets](../ncpdp.md#splitwithoffsets)

***

### TELECOM\_BUILD\_CODES

Re-exports [TELECOM_BUILD_CODES](../ncpdp.md#telecom_build_codes)

***

### TELECOM\_BUILD\_MESSAGES

Re-exports [TELECOM_BUILD_MESSAGES](../ncpdp.md#telecom_build_messages)

***

### TELECOM\_FATAL\_CODES

Re-exports [TELECOM_FATAL_CODES](../ncpdp.md#telecom_fatal_codes)

***

### TELECOM\_FATAL\_MESSAGES

Re-exports [TELECOM_FATAL_MESSAGES](../ncpdp.md#telecom_fatal_messages)

***

### TELECOM\_WARNING\_CODES

Re-exports [TELECOM_WARNING_CODES](../ncpdp.md#telecom_warning_codes)

***

### TELECOM\_WARNING\_MESSAGES

Re-exports [TELECOM_WARNING_MESSAGES](../ncpdp.md#telecom_warning_messages)

***

### TelecomBuildCode

Re-exports [TelecomBuildCode](../ncpdp.md#telecombuildcode)

***

### TelecomClaim

Re-exports [TelecomClaim](../ncpdp.md#telecomclaim)

***

### TelecomDecodedTransaction

Re-exports [TelecomDecodedTransaction](../ncpdp.md#telecomdecodedtransaction)

***

### TelecomFatalCode

Re-exports [TelecomFatalCode](../ncpdp.md#telecomfatalcode)

***

### TelecomField

Re-exports [TelecomField](../ncpdp.md#telecomfield)

***

### TelecomFieldInput

Re-exports [TelecomFieldInput](../ncpdp.md#telecomfieldinput)

***

### TelecomHeader

Re-exports [TelecomHeader](../ncpdp.md#telecomheader)

***

### TelecomHeaderInput

Re-exports [TelecomHeaderInput](../ncpdp.md#telecomheaderinput)

***

### TelecomParseOptions

Re-exports [TelecomParseOptions](../ncpdp.md#telecomparseoptions)

***

### telecomPosition

Re-exports [telecomPosition](../ncpdp.md#telecomposition-1)

***

### TelecomPosition

Re-exports [TelecomPosition](../ncpdp.md#telecomposition)

***

### TelecomProductCode

Re-exports [TelecomProductCode](../ncpdp.md#telecomproductcode)

***

### telecomQuantity

Re-exports [telecomQuantity](../ncpdp.md#telecomquantity-1)

***

### TelecomQuantity

Re-exports [TelecomQuantity](../ncpdp.md#telecomquantity)

***

### TelecomRequestInput

Re-exports [TelecomRequestInput](../ncpdp.md#telecomrequestinput)

***

### TelecomSegment

Re-exports [TelecomSegment](../ncpdp.md#telecomsegment)

***

### TelecomSegmentInput

Re-exports [TelecomSegmentInput](../ncpdp.md#telecomsegmentinput)

***

### TelecomTransaction

Re-exports [TelecomTransaction](../ncpdp.md#telecomtransaction)

***

### TelecomVersion

Re-exports [TelecomVersion](../ncpdp.md#telecomversion)

***

### telecomWarning

Re-exports [telecomWarning](../ncpdp.md#telecomwarning)

***

### TelecomWarningCode

Re-exports [TelecomWarningCode](../ncpdp.md#telecomwarningcode)

***

### tokenizeBody

Re-exports [tokenizeBody](../ncpdp.md#tokenizebody)

***

### tokenizeTransactions

Re-exports [tokenizeTransactions](../ncpdp.md#tokenizetransactions)

***

### undecodedHeader

Re-exports [undecodedHeader](../ncpdp.md#undecodedheader)

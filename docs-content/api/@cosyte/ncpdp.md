# @cosyte/ncpdp

Public entry point for the `@cosyte/ncpdp` package.

NCPDP is two structurally unrelated standards under one brand. They ship via
subpath exports: `@cosyte/ncpdp/script` (SCRIPT XML ePrescribing),
`@cosyte/ncpdp/telecom` (the Telecommunication claim standard),
`@cosyte/ncpdp/common` (shared vocabulary), and `@cosyte/ncpdp/profiles`
(trading-partner profiles).

This root re-exports every export of the SCRIPT, common, and profiles
subpaths, and part of the Telecom one: `parseTelecom`, `claim`,
`serializeTelecom`, `buildTelecomRequest`, the request header, tokenizer, and
quantity helpers, and the Telecom codes and errors. The Telecom response
views (`adjudication` and the rest), the compound, COB, DUR, and
prior-authorization views, `telecomMoney`, and `fieldValues` are exported
from `@cosyte/ncpdp/telecom` only. Deep imports from the subpaths keep
Telecom-only or SCRIPT-only consumers lean.

## Classes

### NcpdpProfileError

Thrown by `defineProfile()` and profile-validation code when a profile
definition is structurally invalid. Carries the offending profile name (when
known) so consumers can pinpoint which definition failed.

#### Example

```ts
import { defineProfile, NcpdpProfileError } from "@cosyte/ncpdp/profiles";
try {
  defineProfile({ name: "" });
} catch (err) {
  if (err instanceof NcpdpProfileError) {
    console.error(err.message, err.profileName);
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new NcpdpProfileError**(`message`, `profileName?`): [`NcpdpProfileError`](#ncpdpprofileerror)

**`Internal`**

Construct a new `NcpdpProfileError`. `profileName` is optional so the name
validator can throw before a usable name is available.

###### Parameters

###### message

`string`

###### profileName?

`string`

###### Returns

[`NcpdpProfileError`](#ncpdpprofileerror)

###### Overrides

`Error.constructor`

#### Properties

##### profileName

> `readonly` **profileName**: `string` \| `undefined`

***

### NcpdpScriptBuildError

Thrown when the SCRIPT emit side is asked for a message it cannot render
honestly: an invalid-by-construction message handed to the builder, or a
transaction this library does not model handed to the serializer. Carries a
stable [ScriptBuildCode](#scriptbuildcode), and its `message` is that code's
[SCRIPT\_BUILD\_MESSAGES](#script_build_messages) entry: emit input is caller-supplied and
PHI-dense, so none of it is quoted back. The error carries the code and
nothing else, so it, including its `stack`, is safe to log whole.

#### Example

```ts
try {
  buildScriptResponse({ kind: "Status" });
} catch (err) {
  if (err instanceof NcpdpScriptBuildError) {
    err.code; // "NCPDP_SCRIPT_BUILD_MISSING_RESPONSE_CODE"
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new NcpdpScriptBuildError**(`code`): [`NcpdpScriptBuildError`](#ncpdpscriptbuilderror)

###### Parameters

###### code

[`ScriptBuildCode`](#scriptbuildcode)

The stable build error code, which selects the message.

###### Returns

[`NcpdpScriptBuildError`](#ncpdpscriptbuilderror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`ScriptBuildCode`](#scriptbuildcode)

Stable, machine-readable build error code.

***

### NcpdpScriptParseError

Thrown when NCPDP SCRIPT input is structurally unrecoverable.

Carries a stable [ScriptFatalCode](#scriptfatalcode) and optional positional context, and
**nothing else**. `message` is the [SCRIPT\_FATAL\_MESSAGES](#script_fatal_messages) entry for the
code, so the error, including its `stack`, is safe to log and safe to forward
to an error reporter.

It carries no snippet of the offending input. An earlier version did, capped
at 64 characters and documented as a redaction boundary; the cap bounded the
length and nothing about the content, and the paths that raised it are exactly
the paths where the input is too broken to say where in it those characters
came from. `NcpdpScriptBuildError` and both Telecom errors had already refused
a snippet for that reason. This one now agrees with them.

#### Example

```ts
try {
  parseScript("not xml");
} catch (err) {
  if (err instanceof NcpdpScriptParseError) {
    err.code; // "NCPDP_SCRIPT_NOT_XML"
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new NcpdpScriptParseError**(`code`, `opts?`): [`NcpdpScriptParseError`](#ncpdpscriptparseerror)

###### Parameters

###### code

[`ScriptFatalCode`](#scriptfatalcode)

The stable fatal code, which selects the message.

###### opts?

Optional positional context.

###### position?

[`ScriptPosition`](#scriptposition)

###### Returns

[`NcpdpScriptParseError`](#ncpdpscriptparseerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`ScriptFatalCode`](#scriptfatalcode)

Stable, machine-readable fatal code.

##### position?

> `readonly` `optional` **position?**: [`ScriptPosition`](#scriptposition)

XPath-style location of the failure, when known.

***

### NcpdpTelecomBuildError

Thrown when the Telecom builder is asked to construct an invalid-by-construction
transaction. Carries a stable [TelecomBuildCode](#telecombuildcode), and its `message` is
that code's [TELECOM\_BUILD\_MESSAGES](#telecom_build_messages) entry; like the parse error it never
quotes the offending value (Telecom data is PHI-dense).

#### Example

```ts
try {
  buildTelecomRequest({ header: {}, segments: [] });
} catch (err) {
  if (err instanceof NcpdpTelecomBuildError) {
    err.code; // "NCPDP_TELECOM_BUILD_MISSING_TRANSACTION_CODE"
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new NcpdpTelecomBuildError**(`code`, `headerField?`): [`NcpdpTelecomBuildError`](#ncpdptelecombuilderror)

###### Parameters

###### code

[`TelecomBuildCode`](#telecombuildcode)

The stable build error code, which selects the message.

###### headerField?

keyof TelecomHeader

The fixed-header slot at fault, when applicable.

###### Returns

[`NcpdpTelecomBuildError`](#ncpdptelecombuilderror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`TelecomBuildCode`](#telecombuildcode)

Stable, machine-readable build error code.

##### headerField?

> `readonly` `optional` **headerField?**: keyof TelecomHeader

Which fixed-header field the builder rejected, when the rejection was about
one. Typed as `keyof TelecomHeader`, so it can only ever be one of this
parser's own nine header field names: it names the **slot**, never anything
the caller supplied. Absent for rejections that are not header-field-scoped.

***

### NcpdpTelecomParseError

Thrown when NCPDP Telecommunication-standard input is structurally
unrecoverable.

Carries a stable [TelecomFatalCode](#telecomfatalcode) and optional positional context, and
nothing else. `message` is the [TELECOM\_FATAL\_MESSAGES](#telecom_fatal_messages) entry for the
code, and it intentionally carries no snippet of the offending bytes: a
Telecom message is PHI-dense, so the [TelecomPosition](#telecomposition) (offset + field
id, never a value) is the only context.

#### Example

```ts
try {
  parseTelecom("");
} catch (err) {
  if (err instanceof NcpdpTelecomParseError) {
    err.code; // "EMPTY_INPUT"
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new NcpdpTelecomParseError**(`code`, `opts?`): [`NcpdpTelecomParseError`](#ncpdptelecomparseerror)

###### Parameters

###### code

[`TelecomFatalCode`](#telecomfatalcode)

The stable fatal code, which selects the message.

###### opts?

Optional positional context.

###### position?

[`TelecomPosition`](#telecomposition)

###### Returns

[`NcpdpTelecomParseError`](#ncpdptelecomparseerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`TelecomFatalCode`](#telecomfatalcode)

Stable, machine-readable fatal code.

##### position?

> `readonly` `optional` **position?**: [`TelecomPosition`](#telecomposition)

Byte-offset context of the failure, when known.

***

### ScriptMessage

An immutable parsed SCRIPT message: routing header, the typed body, and any
non-fatal warnings raised while parsing. Construct via
"./parse".parseScript: instances are deeply frozen.

#### Example

```ts
const msg = parseScript(xml);
msg.header.messageId;
msg.asNewRx()?.medication?.description;
```

#### Constructors

##### Constructor

> **new ScriptMessage**(`init`): [`ScriptMessage`](#scriptmessage)

###### Parameters

###### init

Pre-extracted header, body, warnings, and optional profile.

###### body

[`ScriptBody`](#scriptbody)

###### header

[`ScriptHeader`](#scriptheader)

###### profile?

[`NcpdpProfile`](#ncpdpprofile)

###### warnings

readonly [`NcpdpScriptWarning`](#ncpdpscriptwarning)[]

###### Returns

[`ScriptMessage`](#scriptmessage)

#### Properties

##### body

> `readonly` **body**: [`ScriptBody`](#scriptbody)

The typed transaction body.

##### header

> `readonly` **header**: [`ScriptHeader`](#scriptheader)

Routing/correlation header fields.

##### profile?

> `readonly` `optional` **profile?**: [`NcpdpProfile`](#ncpdpprofile)

The trading-partner profile in effect for this parse: either passed
explicitly via `parseScript`'s `options.profile` or resolved from the
process-scoped default. Present only when a profile applied; attribution
only (profiles never alter the parse).

##### warnings

> `readonly` **warnings**: readonly [`NcpdpScriptWarning`](#ncpdpscriptwarning)[]

Non-fatal warnings, in the order raised.

#### Accessors

##### correlatesTo

###### Get Signature

> **get** **correlatesTo**(): `string` \| `undefined`

The identifier of the message this one answers (`<RelatesToMessageID>`), or
`undefined`. The correlation key that ties a response back to its request.

###### Example

```ts
parseScript(responseXml).correlatesTo; // the request's MessageID
```

###### Returns

`string` \| `undefined`

The correlated message id, or `undefined`.

##### disposition

###### Get Signature

> **get** **disposition**(): [`ResponseDisposition`](#responsedisposition) \| `undefined`

The disposition of this message when it is a response transaction
(`<Status>`/`<Error>`/`<Verify>`), else `undefined`. Derived only from the
body kind: an `<Error>` is **always** `"error"` and is never read as a
success.

###### Example

```ts
parseScript(xml).disposition; // "success" | "error" | "verify" | undefined
```

###### Returns

[`ResponseDisposition`](#responsedisposition) \| `undefined`

The [ResponseDisposition](#responsedisposition), or `undefined` for a request /
  unsupported transaction.

#### Methods

##### asError()

> **asError**(): [`ErrorBody`](#errorbody) \| `undefined`

The [ErrorBody](#errorbody) when this message is an `<Error>` response, else
`undefined`.

###### Returns

[`ErrorBody`](#errorbody) \| `undefined`

The Error body, or `undefined`.

###### Example

```ts
parseScript(xml).asError()?.code;
```

##### asLifecycleRequest()

> **asLifecycleRequest**(): [`LifecycleRequest`](#lifecyclerequest) \| `undefined`

The [LifecycleRequest](#lifecyclerequest) body when this message is a renewal/change/cancel
**request** (`RxRenewalRequest`/`RxChangeRequest`/`CancelRx`), else `undefined`.

###### Returns

[`LifecycleRequest`](#lifecyclerequest) \| `undefined`

The lifecycle request body, or `undefined`.

###### Example

```ts
parseScript(xml).asLifecycleRequest()?.medicationPrescribed?.description;
```

##### asLifecycleResponse()

> **asLifecycleResponse**(): [`LifecycleResponse`](#lifecycleresponse) \| `undefined`

The [LifecycleResponse](#lifecycleresponse) body when this message is a renewal/change/cancel
**response** (`RxRenewalResponse`/`RxChangeResponse`/`CancelRxResponse`), else
`undefined`.

###### Returns

[`LifecycleResponse`](#lifecycleresponse) \| `undefined`

The lifecycle response body, or `undefined`.

###### Example

```ts
parseScript(xml).asLifecycleResponse()?.outcome; // "approved" | "denied" | …
```

##### asNewRx()

> **asNewRx**(): [`NewRx`](#newrx) \| `undefined`

The [NewRx](#newrx) body when this message is a NewRx, else `undefined`.

###### Returns

[`NewRx`](#newrx) \| `undefined`

The NewRx body, or `undefined`.

###### Example

```ts
const rx = parseScript(xml).asNewRx();
rx?.medication?.description;
```

##### asStatus()

> **asStatus**(): [`StatusBody`](#statusbody) \| `undefined`

The [StatusBody](#statusbody) when this message is a `<Status>` response, else
`undefined`.

###### Returns

[`StatusBody`](#statusbody) \| `undefined`

The Status body, or `undefined`.

###### Example

```ts
parseScript(xml).asStatus()?.code;
```

##### asVerify()

> **asVerify**(): [`VerifyBody`](#verifybody) \| `undefined`

The [VerifyBody](#verifybody) when this message is a `<Verify>` response, else
`undefined`.

###### Returns

[`VerifyBody`](#verifybody) \| `undefined`

The Verify body, or `undefined`.

###### Example

```ts
parseScript(xml).asVerify()?.code;
```

##### toString()

> **toString**(): `string`

Serialize this message back to canonical NCPDP SCRIPT XML. Equivalent to
"./serialize".serializeScript; only the modeled fields are emitted, so
the result is canonical (idempotent under re-parse) rather than byte-identical
to any original input.

Because this is the object's own string conversion, it also runs on implicit
coercion (a template literal, string concatenation, a log line). When the body
is a transaction this library does not model it **throws** rather than
returning a document with the transaction body deleted, so check
`message.body.kind !== "unsupported"` before coercing a message you did not
build yourself.

###### Returns

`string`

The canonical SCRIPT XML string.

###### Throws

NcpdpScriptBuildError with
  "../common/errors".SCRIPT\_BUILD\_CODES.UNSUPPORTED\_TRANSACTION when
  `body.kind` is `"unsupported"`. No string is returned.

###### Example

```ts
parseScript(raw).toString(); // canonical XML
```

## Interfaces

### CancelRx

A prescriber-initiated request to retract a prescription (`<CancelRx>`).

#### Extends

- [`LifecycleRequestFields`](#lifecyclerequestfields)

#### Properties

##### kind

> `readonly` **kind**: `"CancelRx"`

##### medicationPrescribed?

> `readonly` `optional` **medicationPrescribed?**: [`MedicationPrescribed`](#medicationprescribed-4)

The prescription this request concerns (`<MedicationPrescribed>`).

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`medicationPrescribed`](#medicationprescribed-2)

##### patient?

> `readonly` `optional` **patient?**: [`Patient`](#patient-4)

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`patient`](#patient-1)

##### pharmacy?

> `readonly` `optional` **pharmacy?**: [`Pharmacy`](#pharmacy-4)

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`pharmacy`](#pharmacy-1)

##### prescriber?

> `readonly` `optional` **prescriber?**: [`Prescriber`](#prescriber-4)

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`prescriber`](#prescriber-1)

##### requestReferenceNumber?

> `readonly` `optional` **requestReferenceNumber?**: `string`

Request reference number, verbatim (`<RequestReferenceNumber>`).

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`requestReferenceNumber`](#requestreferencenumber-2)

***

### CancelRxResponse

A pharmacy's confirmation/denial of a cancel request (`<CancelRxResponse>`).

#### Extends

- [`LifecycleResponseFields`](#lifecycleresponsefields)

#### Properties

##### kind

> `readonly` **kind**: `"CancelRxResponse"`

##### medicationPrescribed?

> `readonly` `optional` **medicationPrescribed?**: [`MedicationPrescribed`](#medicationprescribed-4)

The medication carried with the response. For an `approvedWithChanges`
outcome this is the **changed** medication and is the field a consumer must
read to dispense correctly.

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`medicationPrescribed`](#medicationprescribed-3)

##### outcome

> `readonly` **outcome**: [`ResponseOutcome`](#responseoutcome)

The prescriber's decision, detected fail-safe from the `<Response>` choice.

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`outcome`](#outcome-1)

##### reason?

> `readonly` `optional` **reason?**: [`ResponseReason`](#responsereason)

The reason carried with the outcome, when present.

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`reason`](#reason-1)

##### requestReferenceNumber?

> `readonly` `optional` **requestReferenceNumber?**: `string`

Request reference number echoing the request, verbatim (`<RequestReferenceNumber>`).

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`requestReferenceNumber`](#requestreferencenumber-3)

***

### CodedValue

A coded value: the raw code, its source qualifier, and the normalized system
we recognized from that qualifier. The original qualifier is always preserved
so a consumer can re-derive the mapping if our table lags the spec.

#### Properties

##### qualifier

> `readonly` **qualifier**: `string`

The source qualifier string that accompanied the code.

##### system

> `readonly` **system**: [`CodeSystem`](#codesystem)

Normalized code system recognized from [qualifier](#qualifier).

##### value

> `readonly` **value**: `string`

The code itself, verbatim.

***

### DateParts

The calendar components a parsed value actually stated, and nothing else.

ONLY STATED COMPONENTS ARE PRESENT. A component the value did not state is
absent: the key is not there at all, rather than there holding `undefined`.
`Object.keys()` of the result is therefore exactly the set of stated
components and the value's precision is recoverable from it. There is no
`precision` key, no `source` key and no `isValid` key.

This shape is shared verbatim with the sibling `@cosyte/*` parsers, so all
eight components are declared here even though this package can populate only
three of them. The one wire form decoded is `CCYYMMDD`, a whole calendar day,
so `year`, `month` and `day` are always present together and `hour`,
`minute`, `second`, `millisecond` and `offsetMinutes` are never present at
all. They are declared so that a consumer moving between two `@cosyte/*`
parsers reads one declaration rather than two.

Deleting `offsetMinutes` leaves an object that `Temporal.PlainDate.from` and
luxon's `DateTime.fromObject` accept with no key rename and no value
adjustment: `month` is spec-native 1 to 12 and the names are singular. That
compatibility is the reason for the shape. Neither library is a dependency of
this package and neither is imported here.

#### Properties

##### day?

> `readonly` `optional` **day?**: `number`

Calendar day of month.

##### hour?

> `readonly` `optional` **hour?**: `number`

Hour of day, 0 to 23. Never populated by this package.

##### millisecond?

> `readonly` `optional` **millisecond?**: `number`

Millisecond, 0 to 999. Never populated by this package.

##### minute?

> `readonly` `optional` **minute?**: `number`

Minute of hour, 0 to 59. Never populated by this package.

##### month?

> `readonly` `optional` **month?**: `number`

Calendar month, 1 to 12: spec-native, never the JS `Date` 0 to 11.

##### offsetMinutes?

> `readonly` `optional` **offsetMinutes?**: `number`

Signed minutes east of UTC. Never populated by this package.

##### second?

> `readonly` `optional` **second?**: `number`

Second of minute, 0 to 59. Never populated by this package.

##### year?

> `readonly` `optional` **year?**: `number`

Four-digit calendar year, as stated (`0050` is year 50, never 1950).

***

### DateValue

A calendar date decoded from an NCPDP wire value, preserving the wire string
exactly beside the components it stated.

ONE WIRE FORM IS DECODED, AND THAT IS DELIBERATE: `CCYYMMDD`, a fixed run of
eight digits naming one whole calendar day. It is the only date form this
package declares anywhere, on Date of Service (401-D1) in the Transaction
Header and on Date of Birth (304-C4) in the Patient segment. Every other
date-bearing or time-bearing field this package surfaces is carried verbatim
with no form stated for it: the SCRIPT `<SentTime>`, `<DateOfBirth>` and
`<WrittenDate>` values, and the Telecom Other Payer Date (443-E8) and
Previous Date Of Fill (530-FU) values. Those are UNDECODED here rather than
guessed, because the documents that would settle their form are purchased
products this package cannot cite, and a date decoded from an unread
specification is the quiet wrong answer this whole surface exists to refuse.

The parsed structures are untouched by any of this. `header.dateOfService`,
`claim.dateOfBirth`, `patient.dateOfBirth` and every other date field are
still the verbatim strings they have always been; decoding one is opt-in.

#### Properties

##### day

> `readonly` **day**: `number`

Calendar day of month, 1 to the length of [month](#month-1) in [year](#year-1).

##### month

> `readonly` **month**: `number`

Calendar month, 1 to 12: spec-native, never the JS `Date` 0 to 11.

##### source

> `readonly` **source**: `string`

The date exactly as it appeared on the wire.

##### year

> `readonly` **year**: `number`

Four-digit calendar year, as stated (`0050` is year 50, never 1950).

***

### DecimalValue

A decimal value preserved exactly as it appeared on the wire.

NCPDP quantities, strengths, and days-supply are decimal quantities where
binary floating point would silently corrupt the value (e.g. `0.1`). We never
parse them into a JS `number`; we keep the original source string and a
validity flag, leaving any arithmetic to the consumer who can choose a
decimal-safe representation.

#### Properties

##### isValid

> `readonly` **isValid**: `boolean`

True when [source](#source-1) matches a plain decimal numeric literal.

##### source

> `readonly` **source**: `string`

The original textual value, verbatim.

***

### DrugCoded

A coded drug product (`<DrugCoded>`).

#### Properties

##### drugDbCode?

> `readonly` `optional` **drugDbCode?**: [`CodedValue`](#codedvalue)

`<DrugDBCode>` with its qualifier resolved to a code system.

##### productCode?

> `readonly` `optional` **productCode?**: [`CodedValue`](#codedvalue)

`<ProductCode>` with its qualifier resolved to a code system.

***

### ErrorBody

A SCRIPT `<Error>`: a negative acknowledgment. Its [ResponseFields.code](#code-7)
and description are surfaced verbatim and it always dispositions as
`"error"`: it is never coerced to a success.

#### Extends

- [`ResponseFields`](#responsefields)

#### Properties

##### code?

> `readonly` `optional` **code?**: `string`

Primary response code, verbatim (`<Code>`).

###### Inherited from

[`ResponseFields`](#responsefields).[`code`](#code-7)

##### description?

> `readonly` `optional` **description?**: `string`

Free-text description, verbatim (`<Description>`).

###### Inherited from

[`ResponseFields`](#responsefields).[`description`](#description-5)

##### descriptionCode?

> `readonly` `optional` **descriptionCode?**: `string`

Secondary description code, verbatim (`<DescriptionCode>`).

###### Inherited from

[`ResponseFields`](#responsefields).[`descriptionCode`](#descriptioncode-1)

##### kind

> `readonly` **kind**: `"Error"`

***

### LifecycleRequestFields

Fields shared by the lifecycle **request** transactions.

#### Extended by

- [`RxRenewalRequest`](#rxrenewalrequest)
- [`RxChangeRequest`](#rxchangerequest)
- [`CancelRx`](#cancelrx)

#### Properties

##### medicationPrescribed?

> `readonly` `optional` **medicationPrescribed?**: [`MedicationPrescribed`](#medicationprescribed-4)

The prescription this request concerns (`<MedicationPrescribed>`).

##### patient?

> `readonly` `optional` **patient?**: [`Patient`](#patient-4)

##### pharmacy?

> `readonly` `optional` **pharmacy?**: [`Pharmacy`](#pharmacy-4)

##### prescriber?

> `readonly` `optional` **prescriber?**: [`Prescriber`](#prescriber-4)

##### requestReferenceNumber?

> `readonly` `optional` **requestReferenceNumber?**: `string`

Request reference number, verbatim (`<RequestReferenceNumber>`).

***

### LifecycleResponseFields

Fields shared by the lifecycle **response** transactions.

#### Extended by

- [`RxRenewalResponse`](#rxrenewalresponse)
- [`RxChangeResponse`](#rxchangeresponse)
- [`CancelRxResponse`](#cancelrxresponse)

#### Properties

##### medicationPrescribed?

> `readonly` `optional` **medicationPrescribed?**: [`MedicationPrescribed`](#medicationprescribed-4)

The medication carried with the response. For an `approvedWithChanges`
outcome this is the **changed** medication and is the field a consumer must
read to dispense correctly.

##### outcome

> `readonly` **outcome**: [`ResponseOutcome`](#responseoutcome)

The prescriber's decision, detected fail-safe from the `<Response>` choice.

##### reason?

> `readonly` `optional` **reason?**: [`ResponseReason`](#responsereason)

The reason carried with the outcome, when present.

##### requestReferenceNumber?

> `readonly` `optional` **requestReferenceNumber?**: `string`

Request reference number echoing the request, verbatim (`<RequestReferenceNumber>`).

***

### MedicationPrescribed

The prescribed medication (`<MedicationPrescribed>`).

#### Properties

##### coded?

> `readonly` `optional` **coded?**: [`DrugCoded`](#drugcoded)

##### daysSupply?

> `readonly` `optional` **daysSupply?**: [`DecimalValue`](#decimalvalue)

##### description?

> `readonly` `optional` **description?**: `string`

##### directions?

> `readonly` `optional` **directions?**: `string`

Free-text directions (`<Directions>`), verbatim.

##### note?

> `readonly` `optional` **note?**: `string`

##### numberOfRefills?

> `readonly` `optional` **numberOfRefills?**: `string`

##### quantity?

> `readonly` `optional` **quantity?**: [`Quantity`](#quantity-1)

##### sig?

> `readonly` `optional` **sig?**: [`StructuredSig`](#structuredsig)

Best-effort, **lossy** decode of the structured `<Sig>`, present only when a
`<Sig>` element exists. The free-text [sigText](#sigtext) stays the source of
truth; this structured view is additive and per-field provenance-tagged.

##### sigText?

> `readonly` `optional` **sigText?**: `string`

Structured SIG free text (`<Sig><SigText>`), verbatim.

##### strength?

> `readonly` `optional` **strength?**: [`Strength`](#strength-1)

##### substitutions?

> `readonly` `optional` **substitutions?**: `string`

##### writtenDate?

> `readonly` `optional` **writtenDate?**: `string`

Written date, verbatim.

***

### NcpdpProfile

A readonly, frozen profile produced by `defineProfile()`. Mirrors the
x12/hl7 shape (name / description / lineage) plus NCPDP's `standard`-tagged
`quirks` axis and a structured `describe()`.

#### Example

```ts
import { parseTelecom } from "@cosyte/ncpdp/telecom";
import { profiles } from "@cosyte/ncpdp/profiles";
const tx = parseTelecom(raw, { profile: profiles.pbm });
tx.profile?.name;          // "pbm"
tx.profile?.describe().requires.length;
```

#### Properties

##### describe

> `readonly` **describe**: () => [`NcpdpProfileDescription`](#ncpdpprofiledescription-1)

###### Returns

[`NcpdpProfileDescription`](#ncpdpprofiledescription-1)

##### description?

> `readonly` `optional` **description?**: `string`

##### lineage

> `readonly` **lineage**: readonly `string`[]

##### name

> `readonly` **name**: `string`

##### quirks

> `readonly` **quirks**: readonly [`NcpdpProfileQuirk`](#ncpdpprofilequirk)[]

***

### NcpdpProfileDescription

Structured `describe()` output: the "what this profile relaxes / adds /
requires" record published with the package. Returned as DATA (not a
formatted string) so downstream tooling: docs generators, the `pathways`
engine: can consume it programmatically.

#### Example

```ts
import { profiles } from "@cosyte/ncpdp/profiles";
const d = profiles.pbm.describe();
d.requires.map((q) => q.id);   // ["person-code-required"]
d.expectedWarnings;            // readonly NcpdpWarningCode[]
```

#### Properties

##### adds

> `readonly` **adds**: readonly [`NcpdpProfileQuirk`](#ncpdpprofilequirk)[]

##### description?

> `readonly` `optional` **description?**: `string`

##### expectedWarnings

> `readonly` **expectedWarnings**: readonly [`NcpdpWarningCode`](#ncpdpwarningcode)[]

Sorted, de-duplicated union of every quirk's `expectedWarnings`.

##### lineage

> `readonly` **lineage**: readonly `string`[]

##### name

> `readonly` **name**: `string`

##### relaxes

> `readonly` **relaxes**: readonly [`NcpdpProfileQuirk`](#ncpdpprofilequirk)[]

##### requires

> `readonly` **requires**: readonly [`NcpdpProfileQuirk`](#ncpdpprofilequirk)[]

##### standards

> `readonly` **standards**: readonly [`NcpdpStandard`](#ncpdpstandard)[]

Standards this profile's quirks touch (sorted, de-duplicated).

***

### NcpdpProfileQuirk

A single trading-partner convention captured by a profile. Every quirk is
fixture-grounded: `fixture` points at a committed corpus file that
demonstrates the convention, and `sourceCategory` records where it is
documented. This is the fixture rule: a quirk without a demonstrating
fixture is forbidden, enforced both by this required field and by the
accuracy test.

#### Example

```ts
import type { NcpdpProfileQuirk } from "@cosyte/ncpdp/profiles";
const quirk: NcpdpProfileQuirk = {
  id: "person-code-required",
  standard: "telecom",
  effect: "requires",
  summary: "Insurance segment carries a Person Code (303-C3) cardholder/dependent value.",
  fixture: "telecom/pbm-person-code.ncpdp",
  sourceCategory: "NCPDP Telecommunication vD.0: Person Code (303-C3); PBM payer sheets",
};
```

#### Properties

##### effect

> `readonly` **effect**: [`NcpdpProfileEffect`](#ncpdpprofileeffect)

Which `describe()` bucket this quirk renders into.

##### expectedWarnings?

> `readonly` `optional` **expectedWarnings?**: readonly [`NcpdpWarningCode`](#ncpdpwarningcode)[]

Warning codes this quirk leads a consumer to EXPECT when the convention is
present. Drives `partitionWarnings`. Often empty: the lenient parser
absorbs most conventions with zero warnings, and that "lossless, no warning"
outcome is itself the documented behavior.

##### fixture

> `readonly` **fixture**: `string`

Path to the committed fixture demonstrating the convention, relative to
`test/fixtures/` (e.g. `"telecom/pbm-person-code.ncpdp"`). REQUIRED: the
fixture rule. The accuracy test parses this file and asserts the
claimed convention is present.

##### id

> `readonly` **id**: `string`

Stable, kebab-case identifier: unique within a profile's quirk set.

##### sourceCategory

> `readonly` **sourceCategory**: `string`

Where the convention is documented (standard clause / companion guide).

##### standard

> `readonly` **standard**: [`NcpdpStandard`](#ncpdpstandard)

Which NCPDP standard the quirk (and its cited fixture) belongs to.

##### summary

> `readonly` **summary**: `string`

One-line human summary. NEVER contains PHI: describes structure only.

***

### NcpdpProfileSpec

Input accepted by `defineProfile()`. Every field except `name` is optional;
`extends` composes parent profiles (lineage + quirks merge) the same way the
x12/hl7 `extends` does.

#### Example

```ts
import { defineProfile, profiles, type NcpdpProfileSpec } from "@cosyte/ncpdp/profiles";
const spec: NcpdpProfileSpec = {
  name: "my-regional-pbm",
  extends: profiles.pbm,
  quirks: [
    {
      id: "reject-code-depth",
      standard: "telecom",
      effect: "adds",
      summary: "Returns reject codes beyond the modeled core set.",
      fixture: "telecom/pbm-reject-unknown.ncpdp",
      sourceCategory: "regional PBM payer sheet: reject-code taxonomy",
    },
  ],
};
const profile = defineProfile(spec);
```

#### Properties

##### description?

> `readonly` `optional` **description?**: `string`

##### extends?

> `readonly` `optional` **extends?**: [`NcpdpProfile`](#ncpdpprofile) \| readonly [`NcpdpProfile`](#ncpdpprofile)[]

##### name

> `readonly` **name**: `string`

##### quirks?

> `readonly` `optional` **quirks?**: readonly [`NcpdpProfileQuirk`](#ncpdpprofilequirk)[]

***

### NcpdpScriptWarning

A non-fatal SCRIPT parse warning: a stable code, its registry message, and the
XPath-style location where it was raised.

**What is and is not guaranteed.** `message` is always the
[SCRIPT\_WARNING\_MESSAGES](#script_warning_messages) entry for `code`, byte for byte, so no part of
a parsed document can appear in it. `position.path` is assembled only from
element names this parser recognizes, so a sender-chosen name never reaches it
either. A warning is therefore safe to log whole. That is a property of the
construction, not a promise about the document.

#### Properties

##### code

> `readonly` **code**: [`ScriptWarningCode`](#scriptwarningcode)

Stable, machine-readable warning code.

##### message

> `readonly` **message**: `string`

The [SCRIPT\_WARNING\_MESSAGES](#script_warning_messages) entry for [code](#code-5), verbatim.

##### position

> `readonly` **position**: [`ScriptPosition`](#scriptposition)

XPath-style location where the condition was detected.

***

### NcpdpTelecomWarning

A non-fatal Telecom parse warning: a stable code, its registry message, and
the byte-offset location where it was raised.

**What is and is not guaranteed.** `message` is always the
[TELECOM\_WARNING\_MESSAGES](#telecom_warning_messages) entry for `code`, byte for byte, so no part
of a transmission can appear in it. `position` carries a byte offset and, when
known, a field identifier this parser named itself. A warning is therefore
safe to log whole. That is a property of the construction, not a promise about
the transmission: the segment and field **values** on the model are wire data
and are exactly as sensitive as the claim they came from.

#### Properties

##### code

> `readonly` **code**: [`TelecomWarningCode`](#telecomwarningcode)

Stable, machine-readable warning code.

##### message

> `readonly` **message**: `string`

The [TELECOM\_WARNING\_MESSAGES](#telecom_warning_messages) entry for [code](#code-6), verbatim.

##### position

> `readonly` **position**: [`TelecomPosition`](#telecomposition)

Byte-offset location where the condition was detected.

***

### NcpdpWarningPartition

The result of [partitionWarnings](#partitionwarnings): warnings split into those a profile
leads you to EXPECT and those it does not. Preserves the input warning type.

#### Example

```ts
import type { NcpdpWarningPartition } from "@cosyte/ncpdp/profiles";
import type { NcpdpTelecomWarning } from "@cosyte/ncpdp/telecom";
declare const p: NcpdpWarningPartition<NcpdpTelecomWarning>;
p.unexpected.length; // alert only on these
```

#### Type Parameters

##### W

`W` *extends* `object`

#### Properties

##### expected

> `readonly` **expected**: readonly `W`[]

##### unexpected

> `readonly` **unexpected**: readonly `W`[]

***

### NdcValue

A National Drug Code preserved verbatim, with a best-effort segmentation hint.
We do not rewrite or zero-pad the value: the original is authoritative.

#### Properties

##### segmentation

> `readonly` **segmentation**: [`NdcSegmentation`](#ndcsegmentation)

Best-effort segmentation classification of [value](#value-1).

##### value

> `readonly` **value**: `string`

The NDC exactly as it appeared, including any hyphens.

***

### NewRx

A parsed SCRIPT NewRx transaction body.

#### Properties

##### kind

> `readonly` **kind**: `"NewRx"`

##### medication?

> `readonly` `optional` **medication?**: [`MedicationPrescribed`](#medicationprescribed-4)

##### patient?

> `readonly` `optional` **patient?**: [`Patient`](#patient-4)

##### pharmacy?

> `readonly` `optional` **pharmacy?**: [`Pharmacy`](#pharmacy-4)

##### prescriber?

> `readonly` `optional` **prescriber?**: [`Prescriber`](#prescriber-4)

***

### NewRxInput

Input to [buildNewRx](#buildnewrx): routing header, optional parties, and the medication.

#### Properties

##### header?

> `readonly` `optional` **header?**: [`ScriptHeaderInput`](#scriptheaderinput)

##### medication

> `readonly` **medication**: [`MedicationPrescribed`](#medicationprescribed-4)

The prescribed medication; a `description` is required.

##### patient?

> `readonly` `optional` **patient?**: [`Patient`](#patient-4)

##### pharmacy?

> `readonly` `optional` **pharmacy?**: [`Pharmacy`](#pharmacy-4)

##### prescriber?

> `readonly` `optional` **prescriber?**: [`Prescriber`](#prescriber-4)

***

### ParseScriptOptions

Options for [parseScript](#parsescript).

#### Properties

##### profile?

> `readonly` `optional` **profile?**: [`NcpdpProfile`](#ncpdpprofile) \| `null`

Trading-partner profile to attach to the result for attribution (and
`partitionWarnings`). An explicit profile ALWAYS wins over any
process-scoped default; pass `null` to opt out of the default for this one
call; omit (or `undefined`) to consult `getDefaultProfile()`. Profiles
are DESCRIPTIVE: the profile is surfaced as `msg.profile` but does NOT
alter the lenient parse.

***

### PartyIdentification

A pharmacy or prescriber identification (`<Identification>`).

#### Properties

##### deaNumber?

> `readonly` `optional` **deaNumber?**: `string`

##### ncpdpId?

> `readonly` `optional` **ncpdpId?**: `string`

##### npi?

> `readonly` `optional` **npi?**: `string`

***

### Patient

The patient on a NewRx (`<Patient>`).

#### Properties

##### dateOfBirth?

> `readonly` `optional` **dateOfBirth?**: `string`

Date of birth, verbatim: no reformatting.

##### gender?

> `readonly` `optional` **gender?**: `string`

##### name?

> `readonly` `optional` **name?**: [`ScriptName`](#scriptname)

***

### Pharmacy

The dispensing pharmacy on a NewRx (`<Pharmacy>`).

#### Properties

##### businessName?

> `readonly` `optional` **businessName?**: `string`

##### identification?

> `readonly` `optional` **identification?**: [`PartyIdentification`](#partyidentification)

***

### Prescriber

The prescriber on a NewRx (`<Prescriber>`).

#### Properties

##### identification?

> `readonly` `optional` **identification?**: [`PartyIdentification`](#partyidentification)

##### name?

> `readonly` `optional` **name?**: [`ScriptName`](#scriptname)

***

### Quantity

A dispense quantity (`<Quantity>`).

#### Properties

##### codeListQualifier?

> `readonly` `optional` **codeListQualifier?**: `string`

##### unitOfMeasure?

> `readonly` `optional` **unitOfMeasure?**: `string`

##### value?

> `readonly` `optional` **value?**: [`DecimalValue`](#decimalvalue)

***

### ResponseFields

Fields shared by the SCRIPT response transactions. All are optional because a
real-world sender may omit them; every value is surfaced **verbatim**: codes
and descriptions are never reformatted, looked up, or translated.

#### Extended by

- [`StatusBody`](#statusbody)
- [`ErrorBody`](#errorbody)
- [`VerifyBody`](#verifybody)

#### Properties

##### code?

> `readonly` `optional` **code?**: `string`

Primary response code, verbatim (`<Code>`).

##### description?

> `readonly` `optional` **description?**: `string`

Free-text description, verbatim (`<Description>`).

##### descriptionCode?

> `readonly` `optional` **descriptionCode?**: `string`

Secondary description code, verbatim (`<DescriptionCode>`).

***

### ResponseReason

The reason carried alongside a lifecycle response outcome. All fields are
surfaced **verbatim**: codes and free text are never reformatted, looked up,
or translated.

#### Properties

##### code?

> `readonly` `optional` **code?**: `string`

Coded reason, verbatim (`<ReasonCode>`).

##### denialReason?

> `readonly` `optional` **denialReason?**: `string`

Free-text denial reason, verbatim (`<DenialReason>`).

##### note?

> `readonly` `optional` **note?**: `string`

Free-text note, verbatim (`<Note>`).

##### referenceNumber?

> `readonly` `optional` **referenceNumber?**: `string`

Reference number tying the reason to a request item, verbatim (`<ReferenceNumber>`).

***

### RxChangeRequest

A pharmacy-initiated request to change a prescription (`<RxChangeRequest>`).

#### Extends

- [`LifecycleRequestFields`](#lifecyclerequestfields)

#### Properties

##### kind

> `readonly` **kind**: `"RxChangeRequest"`

##### medicationPrescribed?

> `readonly` `optional` **medicationPrescribed?**: [`MedicationPrescribed`](#medicationprescribed-4)

The prescription this request concerns (`<MedicationPrescribed>`).

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`medicationPrescribed`](#medicationprescribed-2)

##### patient?

> `readonly` `optional` **patient?**: [`Patient`](#patient-4)

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`patient`](#patient-1)

##### pharmacy?

> `readonly` `optional` **pharmacy?**: [`Pharmacy`](#pharmacy-4)

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`pharmacy`](#pharmacy-1)

##### prescriber?

> `readonly` `optional` **prescriber?**: [`Prescriber`](#prescriber-4)

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`prescriber`](#prescriber-1)

##### requestReferenceNumber?

> `readonly` `optional` **requestReferenceNumber?**: `string`

Request reference number, verbatim (`<RequestReferenceNumber>`).

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`requestReferenceNumber`](#requestreferencenumber-2)

***

### RxChangeResponse

A prescriber's answer to a change request (`<RxChangeResponse>`).

#### Extends

- [`LifecycleResponseFields`](#lifecycleresponsefields)

#### Properties

##### kind

> `readonly` **kind**: `"RxChangeResponse"`

##### medicationPrescribed?

> `readonly` `optional` **medicationPrescribed?**: [`MedicationPrescribed`](#medicationprescribed-4)

The medication carried with the response. For an `approvedWithChanges`
outcome this is the **changed** medication and is the field a consumer must
read to dispense correctly.

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`medicationPrescribed`](#medicationprescribed-3)

##### outcome

> `readonly` **outcome**: [`ResponseOutcome`](#responseoutcome)

The prescriber's decision, detected fail-safe from the `<Response>` choice.

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`outcome`](#outcome-1)

##### reason?

> `readonly` `optional` **reason?**: [`ResponseReason`](#responsereason)

The reason carried with the outcome, when present.

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`reason`](#reason-1)

##### requestReferenceNumber?

> `readonly` `optional` **requestReferenceNumber?**: `string`

Request reference number echoing the request, verbatim (`<RequestReferenceNumber>`).

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`requestReferenceNumber`](#requestreferencenumber-3)

***

### RxRenewalRequest

A pharmacy-initiated request to renew a prescription (`<RxRenewalRequest>`).

#### Extends

- [`LifecycleRequestFields`](#lifecyclerequestfields)

#### Properties

##### kind

> `readonly` **kind**: `"RxRenewalRequest"`

##### medicationPrescribed?

> `readonly` `optional` **medicationPrescribed?**: [`MedicationPrescribed`](#medicationprescribed-4)

The prescription this request concerns (`<MedicationPrescribed>`).

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`medicationPrescribed`](#medicationprescribed-2)

##### patient?

> `readonly` `optional` **patient?**: [`Patient`](#patient-4)

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`patient`](#patient-1)

##### pharmacy?

> `readonly` `optional` **pharmacy?**: [`Pharmacy`](#pharmacy-4)

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`pharmacy`](#pharmacy-1)

##### prescriber?

> `readonly` `optional` **prescriber?**: [`Prescriber`](#prescriber-4)

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`prescriber`](#prescriber-1)

##### requestReferenceNumber?

> `readonly` `optional` **requestReferenceNumber?**: `string`

Request reference number, verbatim (`<RequestReferenceNumber>`).

###### Inherited from

[`LifecycleRequestFields`](#lifecyclerequestfields).[`requestReferenceNumber`](#requestreferencenumber-2)

***

### RxRenewalResponse

A prescriber's answer to a renewal request (`<RxRenewalResponse>`).

#### Extends

- [`LifecycleResponseFields`](#lifecycleresponsefields)

#### Properties

##### kind

> `readonly` **kind**: `"RxRenewalResponse"`

##### medicationPrescribed?

> `readonly` `optional` **medicationPrescribed?**: [`MedicationPrescribed`](#medicationprescribed-4)

The medication carried with the response. For an `approvedWithChanges`
outcome this is the **changed** medication and is the field a consumer must
read to dispense correctly.

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`medicationPrescribed`](#medicationprescribed-3)

##### outcome

> `readonly` **outcome**: [`ResponseOutcome`](#responseoutcome)

The prescriber's decision, detected fail-safe from the `<Response>` choice.

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`outcome`](#outcome-1)

##### reason?

> `readonly` `optional` **reason?**: [`ResponseReason`](#responsereason)

The reason carried with the outcome, when present.

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`reason`](#reason-1)

##### requestReferenceNumber?

> `readonly` `optional` **requestReferenceNumber?**: `string`

Request reference number echoing the request, verbatim (`<RequestReferenceNumber>`).

###### Inherited from

[`LifecycleResponseFields`](#lifecycleresponsefields).[`requestReferenceNumber`](#requestreferencenumber-3)

***

### ScriptHeader

The SCRIPT `<Header>` fields useful for routing and correlation. Every field
is optional because real-world senders omit some; absence is `undefined`, not
an error (Postel's Law).

#### Properties

##### from?

> `readonly` `optional` **from?**: `string`

Source identifier (`<From>`).

##### messageId?

> `readonly` `optional` **messageId?**: `string`

Unique message identifier (`<MessageID>`).

##### prescriberOrderNumber?

> `readonly` `optional` **prescriberOrderNumber?**: `string`

Prescriber order number (`<PrescriberOrderNumber>`), when present.

##### relatesToMessageId?

> `readonly` `optional` **relatesToMessageId?**: `string`

Correlated prior message identifier (`<RelatesToMessageID>`).

##### sentTime?

> `readonly` `optional` **sentTime?**: `string`

Sender timestamp, verbatim (`<SentTime>`).

##### to?

> `readonly` `optional` **to?**: `string`

Destination identifier (`<To>`).

##### version?

> `readonly` `optional` **version?**: `string`

Declared SCRIPT version (root `version`/`Version`, or `<Header><Version>`).

***

### ScriptHeaderInput

The SCRIPT `<Header>` fields a builder accepts; all optional.

#### Properties

##### from?

> `readonly` `optional` **from?**: `string`

##### messageId?

> `readonly` `optional` **messageId?**: `string`

##### prescriberOrderNumber?

> `readonly` `optional` **prescriberOrderNumber?**: `string`

##### relatesToMessageId?

> `readonly` `optional` **relatesToMessageId?**: `string`

##### sentTime?

> `readonly` `optional` **sentTime?**: `string`

##### to?

> `readonly` `optional` **to?**: `string`

##### version?

> `readonly` `optional` **version?**: `string`

Declared SCRIPT version, emitted as the root `version` attribute.

***

### ScriptName

A person's name as carried in SCRIPT (`<Name>`).

#### Properties

##### firstName?

> `readonly` `optional` **firstName?**: `string`

##### lastName?

> `readonly` `optional` **lastName?**: `string`

##### middleName?

> `readonly` `optional` **middleName?**: `string`

***

### ScriptPosition

Positional context attached to NCPDP SCRIPT warnings and fatal errors.

SCRIPT is XML, so position is an XPath-style location string (e.g.
`/Message/Body/NewRx/MedicationPrescribed`): never a field value. This keeps
diagnostics PHI-safe: a consumer learns *where* a problem is without the
library echoing patient data.

#### Properties

##### path

> `readonly` **path**: `string`

XPath-style location of the element, e.g. `/Message/Body/NewRx`.

***

### ScriptResponseInput

Input to [buildScriptResponse](#buildscriptresponse): the response kind, its code, and optional detail.

#### Properties

##### code

> `readonly` **code**: `string`

The primary response `<Code>`; required (a response must carry one).

##### description?

> `readonly` `optional` **description?**: `string`

##### descriptionCode?

> `readonly` `optional` **descriptionCode?**: `string`

##### header?

> `readonly` `optional` **header?**: [`ScriptHeaderInput`](#scriptheaderinput)

##### kind

> `readonly` **kind**: [`ResponseKind`](#responsekind)

Which response transaction to build.

***

### SegmentAbsence

The published accounting for one unnamed code inside a declared range.

#### Properties

##### reason

> `readonly` **reason**: `"unsourced"`

Why this code carries no name here.

***

### SegmentCodeRange

A run of 111-AM codes this package declares that it covers, and whether an
artifact fixes the bounds.

#### Properties

##### boundsVerified

> `readonly` **boundsVerified**: `boolean`

Whether a publicly readable artifact establishes these bounds. `false` on
every range declared today: the bounds are this package's own working
assumption, carried forward from an unsourced source comment, and are NOT
presented as a fact about the standard.

##### first

> `readonly` **first**: `string`

First code in the range, 2 characters.

##### group

> `readonly` **group**: [`SegmentGroup`](#segmentgroup)

The half of the transmission this range covers.

##### last

> `readonly` **last**: `string`

Last code in the range, 2 characters, inclusive.

***

### SigField

One decoded component of a structured SIG, always carrying its
[SigFieldProvenance](#sigfieldprovenance-1) so a consumer can tell, per field, whether the value
was coded, derived from uncoded structure, or absent. A `"coded"` field's code
keeps its source qualifier verbatim (SNOMED CT / NCI Thesaurus / etc.) so the
provenance is auditable even when our qualifier table lags the spec.

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CodedValue`](#codedvalue)

The code + recognized system, when the structure carried a coded value.

##### provenance

> `readonly` **provenance**: [`SigFieldProvenance`](#sigfieldprovenance-1)

Whether this field was coded, derived from uncoded structure, or absent.

##### text?

> `readonly` `optional` **text?**: `string`

Verbatim human-readable text, when the structure carried any.

***

### StatusBody

A SCRIPT `<Status>`: a positive acknowledgment of a prior transaction.

#### Extends

- [`ResponseFields`](#responsefields)

#### Properties

##### code?

> `readonly` `optional` **code?**: `string`

Primary response code, verbatim (`<Code>`).

###### Inherited from

[`ResponseFields`](#responsefields).[`code`](#code-7)

##### description?

> `readonly` `optional` **description?**: `string`

Free-text description, verbatim (`<Description>`).

###### Inherited from

[`ResponseFields`](#responsefields).[`description`](#description-5)

##### descriptionCode?

> `readonly` `optional` **descriptionCode?**: `string`

Secondary description code, verbatim (`<DescriptionCode>`).

###### Inherited from

[`ResponseFields`](#responsefields).[`descriptionCode`](#descriptioncode-1)

##### kind

> `readonly` **kind**: `"Status"`

***

### Strength

Explicit `<Strength>`. Surfaced independently of any strength implied by a
coded product: the two are **never reconciled** (see
"../common/warnings".SCRIPT\_WARNING\_CODES.STRENGTH\_CODED\_AND\_EXPLICIT).

#### Properties

##### form?

> `readonly` `optional` **form?**: `string`

##### unitOfMeasure?

> `readonly` `optional` **unitOfMeasure?**: `string`

##### value?

> `readonly` `optional` **value?**: `string`

***

### StructuredSig

A best-effort, **lossy** decode of a SCRIPT structured `<Sig>` into typed
dosing components. Every component slot is always present and tagged
[SigFieldProvenance](#sigfieldprovenance-1), so the surface is uniform and a consumer can see
which fields are coded, derived, or absent.

**Safety contract.** The free-text [sigText](#sigtext-1) is the source of truth and
is preserved **verbatim**; the structured view is **additive** and clearly
flagged lossy (see "../common/warnings".SCRIPT\_WARNING\_CODES.SIG\_STRUCTURED\_LOSSY).
The two are **never reconciled**: when structured dosing and the free text
disagree, both are surfaced as-is. An ambiguous structured dose is never
collapsed into a confident value (see
"../common/warnings".SCRIPT\_WARNING\_CODES.SIG\_AMBIGUOUS\_DOSE).

**A component only decodes when its element name is grounded.** A slot whose
name this release cannot trace to a published field label always reads
`"absent"`, whatever the message carried: see SIG\_COMPONENT\_NAMES for
which slots those are and SIG\_NAME\_PROVENANCE for the evidence behind
the rest.

#### Properties

##### administrationTiming

> `readonly` **administrationTiming**: [`SigField`](#sigfield)

Administration timing.

##### dose

> `readonly` **dose**: [`SigField`](#sigfield)

Dose amount (the numeric quantity), string-preserved; never a confident guess.

##### doseDeliveryMethod

> `readonly` **doseDeliveryMethod**: [`SigField`](#sigfield)

Method of dose delivery (e.g. "take", "apply").

##### doseUnitOfMeasure

> `readonly` **doseUnitOfMeasure**: [`SigField`](#sigfield)

Unit of measure for the dose. **No grounded element name: always `"absent"`.**

##### duration

> `readonly` **duration**: [`SigField`](#sigfield)

Duration of therapy. **No grounded element name: always `"absent"`.**

##### hasStructuredData

> `readonly` **hasStructuredData**: `boolean`

True when at least one component decoded to a non-`"absent"` value.

##### indication

> `readonly` **indication**: [`SigField`](#sigfield)

Clinical indication. **No grounded element name: always `"absent"`.**

##### maximumDoseRestriction

> `readonly` **maximumDoseRestriction**: [`SigField`](#sigfield)

Maximum-dose restriction. **No grounded element name: always `"absent"`.**

##### route

> `readonly` **route**: [`SigField`](#sigfield)

Route of administration (SNOMED/NCI when coded).

##### sigText?

> `readonly` `optional` **sigText?**: `string`

The free-text SIG (`<SigText>`), verbatim: always the source of truth.

##### siteOfAdministration

> `readonly` **siteOfAdministration**: [`SigField`](#sigfield)

Site of administration (SNOMED/NCI when coded).

##### vehicle

> `readonly` **vehicle**: [`SigField`](#sigfield)

Vehicle / diluent. **No grounded element name: always `"absent"`.**

***

### TelecomClaim

A B1/B2/B3 request view over a decoded Telecom transaction: the safety-relevant
fields a biller needs, lifted from their field-id-keyed segments and preserved
verbatim. Every field is optional: a missing segment or field yields
`undefined` rather than a throw, in keeping with the lenient parse contract.

#### Properties

##### cardholderId?

> `readonly` `optional` **cardholderId?**: `string`

Cardholder ID (302-C2) from the Insurance segment. PHI.

##### dateOfBirth?

> `readonly` `optional` **dateOfBirth?**: `string`

Date of Birth (304-C4) from the Patient segment, verbatim (`CCYYMMDD`). PHI.

##### daysSupply?

> `readonly` `optional` **daysSupply?**: [`DecimalValue`](#decimalvalue)

Days Supply (405-D5), preserved as a decimal-safe value.

##### dispenseAsWritten?

> `readonly` `optional` **dispenseAsWritten?**: `string`

Dispense As Written / Product Selection Code (408-D8), verbatim.

##### fillNumber?

> `readonly` `optional` **fillNumber?**: `string`

Fill Number (403-D3) from the Claim segment.

##### genderCode?

> `readonly` `optional` **genderCode?**: `string`

Patient Gender Code (305-C5) from the Patient segment.

##### groupId?

> `readonly` `optional` **groupId?**: `string`

Group ID (301-C1) from the Insurance segment.

##### personCode?

> `readonly` `optional` **personCode?**: `string`

Person Code (303-C3) from the Insurance segment.

##### prescriberId?

> `readonly` `optional` **prescriberId?**: `string`

Prescriber ID (411-DB) from the Prescriber segment.

##### prescriberIdQualifier?

> `readonly` `optional` **prescriberIdQualifier?**: `string`

Prescriber ID Qualifier (466-EZ) from the Prescriber segment.

##### prescriptionReferenceNumber?

> `readonly` `optional` **prescriptionReferenceNumber?**: `string`

Prescription/Service Reference Number (402-D2) from the Claim segment.

##### prescriptionReferenceQualifier?

> `readonly` `optional` **prescriptionReferenceQualifier?**: `string`

Prescription/Service Reference Number Qualifier (455-EM).

##### product?

> `readonly` `optional` **product?**: [`TelecomProductCode`](#telecomproductcode)

Product/Service ID + qualifier (407-D7 / 436-E1), when present.

##### quantityDispensed?

> `readonly` `optional` **quantityDispensed?**: [`TelecomQuantity`](#telecomquantity)

Quantity Dispensed (442-E7) with its implied 3-place decimal.

##### transactionCode

> `readonly` **transactionCode**: `string`

Transaction Code (103-A3) from the header, e.g. `"B1"`.

***

### TelecomDecodedTransaction

One group-separated transaction decoded out of a transmission body: its
position in the transmission, the absolute byte offset of its first byte, its
segments in wire order, and the warnings raised while decoding **it**.

A transmission may carry several transactions (the Group Separator is what
divides them), and each one is decoded into its own entry with its own warning
list. That is what isolates a malformed transaction: a quirk in one cannot
discard, reorder or re-attribute the segments of another, and a consumer can
tell which transaction a warning belongs to without re-tokenizing the input.

#### Properties

##### byteOffset

> `readonly` **byteOffset**: `number`

Byte offset of this transaction's first byte in the raw message.

##### index

> `readonly` **index**: `number`

Zero-based position of this transaction within the transmission.

##### segments

> `readonly` **segments**: readonly [`TelecomSegment`](#telecomsegment)[]

This transaction's segments, in wire order.

##### warnings

> `readonly` **warnings**: readonly [`NcpdpTelecomWarning`](#ncpdptelecomwarning)[]

The warnings raised decoding this transaction, in the order they were raised.

***

### TelecomField

A single decoded field: its 2-character id, verbatim value, and paraphrased name.

#### Properties

##### byteOffset

> `readonly` **byteOffset**: `number`

Byte offset of this field token in the raw message.

##### id

> `readonly` **id**: `string`

The 2-character field identifier, verbatim (empty for a malformed token).

##### name?

> `readonly` `optional` **name?**: `string`

Paraphrased field name when [id](#id-1) is recognized.

##### value

> `readonly` **value**: `string`

The field value exactly as it appeared on the wire.

***

### TelecomFieldInput

A single field to build: its 2-character id and verbatim value.

#### Properties

##### id

> `readonly` **id**: `string`

The 2-character field identifier, e.g. `"D7"`.

##### value

> `readonly` **value**: `string`

The field value, emitted verbatim.

***

### TelecomHeader

The fixed-length Transaction Header that opens every NCPDP Telecommunication
request. It carries no field separators: each field is positional. Field
numbers/designators are from the NCPDP Telecommunication standard vD.0; the
names here are our own paraphrases (we do not redistribute NCPDP prose).

Values are trimmed of pad whitespace; numeric leading zeros are preserved
(a BIN or PCN is an identifier, not an arithmetic quantity).

#### Properties

##### binNumber

> `readonly` **binNumber**: `string`

101-A1: the routing Bank Identification Number (6 chars on the wire).

##### dateOfService

> `readonly` **dateOfService**: `string`

401-D1: Date of Service, verbatim (`CCYYMMDD` on the wire).

##### processorControlNumber

> `readonly` **processorControlNumber**: `string`

104-A4: Processor Control Number.

##### serviceProviderId

> `readonly` **serviceProviderId**: `string`

201-B1: Service Provider ID (e.g. the pharmacy NPI).

##### serviceProviderIdQualifier

> `readonly` **serviceProviderIdQualifier**: `string`

202-B2: Service Provider ID Qualifier.

##### softwareCertificationId

> `readonly` **softwareCertificationId**: `string`

110-AK: Software Vendor / Certification ID.

##### transactionCode

> `readonly` **transactionCode**: `string`

103-A3: Transaction Code, e.g. `"B1"` (billing), `"B2"`, `"B3"`, `"E1"`.

##### transactionCount

> `readonly` **transactionCount**: `string`

109-A9: declared number of transactions in the transmission (1 char).

##### versionRelease

> `readonly` **versionRelease**: `string`

102-A2: Version/Release, `"D0"` for the standard this reader decodes.

***

### TelecomHeaderInput

The fixed Transaction Header fields to build. Only `transactionCode` is required.

#### Properties

##### binNumber?

> `readonly` `optional` **binNumber?**: `string`

101-A1: routing BIN.

##### dateOfService?

> `readonly` `optional` **dateOfService?**: `string`

401-D1: Date of Service (`CCYYMMDD`).

##### processorControlNumber?

> `readonly` `optional` **processorControlNumber?**: `string`

104-A4: Processor Control Number.

##### serviceProviderId?

> `readonly` `optional` **serviceProviderId?**: `string`

201-B1: Service Provider ID.

##### serviceProviderIdQualifier?

> `readonly` `optional` **serviceProviderIdQualifier?**: `string`

202-B2: Service Provider ID Qualifier.

##### softwareCertificationId?

> `readonly` `optional` **softwareCertificationId?**: `string`

110-AK: Software Vendor / Certification ID.

##### transactionCode

> `readonly` **transactionCode**: `string`

103-A3: Transaction Code; required (a request cannot route without one).

##### transactionCount?

> `readonly` `optional` **transactionCount?**: `string`

109-A9: transaction count; defaults to `"1"`.

##### versionRelease?

> `readonly` `optional` **versionRelease?**: `string`

102-A2: Version/Release; defaults to `"D0"`.

***

### TelecomParseOptions

Options controlling [parseTelecom](#parsetelecom).

#### Properties

##### encoding?

> `readonly` `optional` **encoding?**: `BufferEncoding`

When the input is a Buffer, the encoding used to decode it to text.
The Telecommunication standard is single-byte ASCII; defaults to `"latin1"`
so every byte maps to a code point without loss.

##### profile?

> `readonly` `optional` **profile?**: [`NcpdpProfile`](#ncpdpprofile) \| `null`

Trading-partner profile to attach to the result for attribution (and
`partitionWarnings`). An explicit profile ALWAYS wins over any
process-scoped default; pass `null` to opt out of the default for this one
call; omit (or `undefined`) to consult `getDefaultProfile()`. Profiles
are DESCRIPTIVE: the profile is surfaced as `tx.profile` but does NOT alter
the lenient parse.

***

### TelecomPosition

Positional context attached to NCPDP Telecommunication-standard warnings and
fatal errors.

The Telecommunication standard is a byte-oriented, control-character-framed
format, so position is a **byte offset** into the raw message: optionally
narrowed to the 2-character field identifier where the condition was detected.
It never carries a field *value*: a consumer learns *where* a problem is
without the library echoing cardholder, patient, or drug data, keeping
diagnostics PHI-safe.

#### Properties

##### byteOffset

> `readonly` **byteOffset**: `number`

Zero-based byte offset into the raw message.

##### fieldId?

> `readonly` `optional` **fieldId?**: `string`

The 2-character field identifier in scope, when known. Never a value.

***

### TelecomProductCode

A drug identifier from the Claim segment: the Product/Service ID (407-D7) and
its qualifier (436-E1), each preserved verbatim.

The qualifier names the code system the id belongs to. This package does not
ship a label for it: no public artifact establishing the 436-E1 value set could
be obtained, so the qualifier comes back exactly as it appeared on the wire and
nothing else. Absence of a meaning never means the value is invalid.

#### Properties

##### id

> `readonly` **id**: `string`

Product/Service ID (407-D7), verbatim: e.g. an 11-digit NDC.

##### qualifier

> `readonly` **qualifier**: `string`

Product/Service ID Qualifier (436-E1), verbatim.

***

### TelecomQuantity

Quantity Dispensed (442-E7). On the wire this is an unsigned integer string
with an **implied 3-place decimal** (NCPDP format `9(7)v999`): `"30000"` means
`30.000`. We never parse it into a float: binary floating point would corrupt
the value, so we keep the verbatim source and, when it is all digits, surface
the implied decimal applied **string-wise**.

#### Properties

##### impliedDecimal?

> `readonly` `optional` **impliedDecimal?**: `string`

[source](#source-2) with the implied 3-place decimal inserted, when valid.

##### isValid

> `readonly` **isValid**: `boolean`

True when [source](#source-2) is a non-empty run of digits.

##### source

> `readonly` **source**: `string`

The quantity exactly as it appeared on the wire.

***

### TelecomRequestInput

The whole request to build: the fixed header and the variable segments.

#### Properties

##### header

> `readonly` **header**: [`TelecomHeaderInput`](#telecomheaderinput)

The fixed Transaction Header fields.

##### segments

> `readonly` **segments**: readonly [`TelecomSegmentInput`](#telecomsegmentinput)[]

The request segments, in wire order.

***

### TelecomSegment

A decoded segment: its identification code, name, and ordered fields.

#### Properties

##### byteOffset

> `readonly` **byteOffset**: `number`

Byte offset of the segment in the raw message.

##### fields

> `readonly` **fields**: readonly [`TelecomField`](#telecomfield)[]

The segment's data fields, in wire order. The `AM` field is not repeated
here once it has been read into [segmentId](#segmentid); when it could not be
(`MALFORMED_SEGMENT_ID`), it stays in this list instead of being dropped.

##### name?

> `readonly` `optional` **name?**: `string`

Paraphrased segment name when [segmentId](#segmentid) is recognized.

##### segmentId

> `readonly` **segmentId**: `string`

The Segment Identification (111-AM) code, e.g. `"07"`.

Always either exactly two characters or empty. It is empty when the segment
did not begin with an `AM` field (`MISSING_SEGMENT_ID`) **and** when it did
but that field's value was not two characters (`MALFORMED_SEGMENT_ID`); in
the second case the `AM` field itself is kept in [fields](#fields), verbatim, so
no byte is lost. The bound is what makes this field safe for a consumer to
interpolate into its own diagnostics: `fields[].value` is not.

***

### TelecomSegmentInput

A segment to build: its Segment Identification code and ordered fields.

#### Properties

##### fields

> `readonly` **fields**: readonly [`TelecomFieldInput`](#telecomfieldinput)[]

The segment's data fields, in wire order.

##### segmentId

> `readonly` **segmentId**: `string`

The Segment Identification (111-AM) code, e.g. `"07"`.

***

### TelecomTransaction

A decoded Telecom transmission: the fixed header, every group-separated
transaction it carries (each with its own field-id-keyed segments, in wire
order), the header's declared transaction count beside the number actually
decoded, and any non-fatal warnings. Everything is frozen.

#### Properties

##### decodedTransactionCount

> `readonly` **decodedTransactionCount**: `number`

The number of transactions actually decoded: `transactions.length`, surfaced
beside the declared [transactionCount](#transactioncount-2) so the two are read as separate
facts rather than one reconciled guess.

##### header

> `readonly` **header**: [`TelecomHeader`](#telecomheader)

The decoded fixed Transaction Header. For a response, the overlapping fields
(version, transaction code, count, service provider) are lifted from the
response header; request-only fields (BIN, PCN, …) are empty.

##### kind

> `readonly` **kind**: `"request"` \| `"response"`

Whether this is a request transmission (decoded against the 56-byte request
header) or a response transmission (decoded against the response header).

##### profile?

> `readonly` `optional` **profile?**: [`NcpdpProfile`](#ncpdpprofile)

The trading-partner profile in effect for this parse: either passed
explicitly via `options.profile` or resolved from the process-scoped
default. Present only when a profile applied; attribution only (profiles
never alter the parse).

##### responseHeader?

> `readonly` `optional` **responseHeader?**: [`TelecomResponseHeader`](ncpdp/telecom.md#telecomresponseheader)

The decoded Response Transaction Header: present only when `kind` is `"response"`.

##### segments

> `readonly` **segments**: readonly [`TelecomSegment`](#telecomsegment)[]

The **first** decoded transaction's segments, in wire order (empty when
nothing decoded). A transmission may carry several transactions, so this is
a convenience alias for `transactions[0].segments`, never the whole message:
[transactions](#transactions) is what carries them all.

##### transactionCount

> `readonly` **transactionCount**: `string`

Declared number of transactions (109-A9), **verbatim from the header**: never
coerced to a number, never defaulted, and never reconciled against what
decoded. Compare it with [decodedTransactionCount](#decodedtransactioncount), which is the count
this reader actually decoded; when they disagree,
`NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH` says so and nothing is dropped.

##### transactions

> `readonly` **transactions**: readonly [`TelecomDecodedTransaction`](#telecomdecodedtransaction)[]

Every decoded transaction, in wire order, each with its own segments, its own
byte offset and the warnings raised decoding it. A transmission carrying one
transaction has exactly one entry, so this is the uniform read path whatever
the message carried.

##### warnings

> `readonly` **warnings**: readonly [`NcpdpTelecomWarning`](#ncpdptelecomwarning)[]

Non-fatal parse warnings for the whole transmission: stable code + byte
offset + field id, never PHI. Every transaction's warnings appear here in
wire order; `transactions[n].warnings` is the same set, split per
transaction, when a consumer needs to attribute one.

***

### ToDateOptions

The one option [toDate](#todate) takes, and the only key it carries.

#### Properties

##### assumeOffsetMinutes?

> `readonly` `optional` **assumeOffsetMinutes?**: `number`

The UTC offset, in signed minutes east of UTC, to assume for a value that
states none. An explicit `0` means "treat this naive value as UTC". With no
value here there is no determinate zone and [toDate](#todate) answers
`undefined`.

***

### UnsupportedBody

A SCRIPT transaction body this parser recognizes but does not model. The raw
transaction name is surfaced so a consumer can branch, without the parser
pretending to understand it.

A message carrying one of these **cannot be serialized**: nothing under the
transaction was modeled, so emit refuses rather than writing a document with
the transaction body deleted. `body.kind === "unsupported"` is the public,
non-throwing way to test for that before you emit.

#### Properties

##### kind

> `readonly` **kind**: `"unsupported"`

##### transaction?

> `readonly` `optional` **transaction?**: `string`

The SCRIPT transaction element name (e.g. `RxRenewalRequest`), present only
when the element the sender used is one of
"./versions".SCRIPT\_TRANSACTION\_NAMES.

It is **absent** for any other element name, and that is deliberate rather
than a gap. A `<Body>` child name is chosen by the sender, so echoing it
onto the model would hand every downstream package an unbounded, wire-derived
string to build its own diagnostics out of. When it is absent, the warning's
position and the document itself are how you find the element.

***

### VerifyBody

A SCRIPT `<Verify>`: a prescriber's verification acknowledgment.

#### Extends

- [`ResponseFields`](#responsefields)

#### Properties

##### code?

> `readonly` `optional` **code?**: `string`

Primary response code, verbatim (`<Code>`).

###### Inherited from

[`ResponseFields`](#responsefields).[`code`](#code-7)

##### description?

> `readonly` `optional` **description?**: `string`

Free-text description, verbatim (`<Description>`).

###### Inherited from

[`ResponseFields`](#responsefields).[`description`](#description-5)

##### descriptionCode?

> `readonly` `optional` **descriptionCode?**: `string`

Secondary description code, verbatim (`<DescriptionCode>`).

###### Inherited from

[`ResponseFields`](#responsefields).[`descriptionCode`](#descriptioncode-1)

##### kind

> `readonly` **kind**: `"Verify"`

***

### XmlElement

A namespace-stripped, immutable view of an XML element. This is the only XML
shape the rest of the SCRIPT parser sees: the `fast-xml-parser` output is
transformed into this tree at load time so downstream code never depends on
the parser's representation.

#### Properties

##### attrs

> `readonly` **attrs**: `Readonly`\<`Record`\<`string`, `string`\>\>

Attributes, prefix-stripped, in document order.

##### children

> `readonly` **children**: readonly [`XmlElement`](#xmlelement)[]

Child elements, in document order.

##### name

> `readonly` **name**: `string`

Local element name, namespace prefix stripped (e.g. `Message`).

##### text

> `readonly` **text**: `string`

Concatenated direct text content, verbatim (not trimmed).

## Type Aliases

### CodeSystem

> **CodeSystem** = `"NDC"` \| `"RXNORM"` \| `"SNOMED"` \| `"NCI"` \| `"ICD10"` \| `"UNKNOWN"`

Drug/clinical code systems recognized in NCPDP SCRIPT product codes. SCRIPT
carries a qualifier alongside each coded value; we map common qualifiers to a
normalized system and fall back to `"UNKNOWN"` rather than guessing.

***

### KnownScriptVersion

> **KnownScriptVersion** = *typeof* [`KNOWN_SCRIPT_VERSIONS`](#known_script_versions)\[`number`\]

Union of the explicitly-supported SCRIPT version literals.

***

### LifecycleRequest

> **LifecycleRequest** = [`RxRenewalRequest`](#rxrenewalrequest) \| [`RxChangeRequest`](#rxchangerequest) \| [`CancelRx`](#cancelrx)

A parsed SCRIPT prescription-lifecycle request body.

***

### LifecycleRequestKind

> **LifecycleRequestKind** = `"RxRenewalRequest"` \| `"RxChangeRequest"` \| `"CancelRx"`

The SCRIPT prescription-lifecycle **request** transactions this parser models.

***

### LifecycleResponse

> **LifecycleResponse** = [`RxRenewalResponse`](#rxrenewalresponse) \| [`RxChangeResponse`](#rxchangeresponse) \| [`CancelRxResponse`](#cancelrxresponse)

A parsed SCRIPT prescription-lifecycle response body.

***

### LifecycleResponseKind

> **LifecycleResponseKind** = `"RxRenewalResponse"` \| `"RxChangeResponse"` \| `"CancelRxResponse"`

The SCRIPT prescription-lifecycle **response** transactions this parser models.

***

### NcpdpProfileEffect

> **NcpdpProfileEffect** = `"relaxes"` \| `"adds"` \| `"requires"`

The bucket a quirk falls into when rendered by [NcpdpProfile.describe](#describe).
A profile states what it relaxes, what it adds and what it requires.

- `relaxes`: the partner tolerates / emits a structural variation a strict
  baseline read would flag (e.g. a SCRIPT version stamp outside the explicitly
  supported set).
- `adds`: the partner emits extra spec-optional content (e.g. an additional
  Telecom response segment, a deeper reject-code taxonomy) a generic consumer
  might not expect.
- `requires`: the partner mandates a normally-situational element be present
  (e.g. a PBM that requires Person Code in the Insurance segment).

#### Example

```ts
import type { NcpdpProfileEffect } from "@cosyte/ncpdp/profiles";
const effect: NcpdpProfileEffect = "adds";
```

***

### NcpdpStandard

> **NcpdpStandard** = `"script"` \| `"telecom"`

Which NCPDP standard a quirk applies to. SCRIPT and Telecom are unrelated
formats with disjoint warning registries; a quirk is grounded in exactly one.

#### Example

```ts
import type { NcpdpStandard } from "@cosyte/ncpdp/profiles";
const std: NcpdpStandard = "telecom";
```

***

### NcpdpWarningCode

> **NcpdpWarningCode** = [`ScriptWarningCode`](#scriptwarningcode) \| [`TelecomWarningCode`](#telecomwarningcode)

The union of every public warning code across both standards. A quirk's
`expectedWarnings` is drawn from this set and validated against it.

#### Example

```ts
import type { NcpdpWarningCode } from "@cosyte/ncpdp/profiles";
const code: NcpdpWarningCode = "NCPDP_TELECOM_UNKNOWN_REJECT_CODE";
```

***

### NdcSegmentation

> **NdcSegmentation** = `"5-4-2"` \| `"5-4-1"` \| `"5-3-2"` \| `"4-4-2"` \| `"11-digit"` \| `"10-digit"` \| `"unknown"`

The labeler/product/package segmentation hint for an NDC. Real-world NDCs
arrive in several digit groupings; we surface the detected shape rather than
forcing a normalization the consumer may not want.

***

### ResponseApproval

> **ResponseApproval** = `"affirmative"` \| `"negative"` \| `"indeterminate"`

A coarse, **fail-safe** classification of a [ResponseOutcome](#responseoutcome) for
consumers that only need "did the prescriber say yes?". A denial is never
`"affirmative"`, and anything that is not a clean yes/no (including `unknown`)
is `"indeterminate"` so it is never mistaken for a grant.

***

### ResponseBody

> **ResponseBody** = [`StatusBody`](#statusbody) \| [`ErrorBody`](#errorbody) \| [`VerifyBody`](#verifybody)

A parsed SCRIPT response transaction body.

***

### ResponseDisposition

> **ResponseDisposition** = `"success"` \| `"error"` \| `"verify"`

How a SCRIPT response transaction dispositions the message it answers:
`success` (a `<Status>`), `error` (an `<Error>`), or `verify` (a `<Verify>`).
Derived purely from the response body kind so that an `Error` can **never** be
read as a success.

***

### ResponseKind

> **ResponseKind** = `"Status"` \| `"Error"` \| `"Verify"`

The three SCRIPT response-transaction element names this parser models.

***

### ResponseOutcome

> **ResponseOutcome** = `"approved"` \| `"approvedWithChanges"` \| `"denied"` \| `"deniedNewToFollow"` \| `"replace"` \| `"validated"` \| `"unknown"`

The prescriber's decision on a lifecycle request, detected purely from the
`<Response>` choice element. The mapping is one-directional and fail-safe: a
`<Denied>` is **always** `"denied"` and is never read as an approval, and a
response with no recognized choice is `"unknown"`: never assumed approved.

- `approved`: `<Approved>`: the request is granted as written.
- `approvedWithChanges`: `<ApprovedWithChanges>`: granted, but the prescriber
  altered the medication; the changed medication is carried in
  [LifecycleResponseFields.medicationPrescribed](#medicationprescribed-3).
- `denied`: `<Denied>`: the request is refused.
- `deniedNewToFollow`: `<DenyNewToFollow>` (renewal): denied, a new
  prescription will follow separately.
- `replace`: `<Replace>`: the prescriber is replacing the prescription.
- `validated`: `<Validated>` (change): the prescriber validated the request
  without approving or denying it.
- `unknown`: no recognized outcome choice was present.

***

### ScriptBody

> **ScriptBody** = [`NewRx`](#newrx) \| [`ResponseBody`](#responsebody) \| [`LifecycleRequest`](#lifecyclerequest) \| [`LifecycleResponse`](#lifecycleresponse) \| [`UnsupportedBody`](#unsupportedbody)

The parsed body of a SCRIPT message.

***

### ScriptBuildCode

> **ScriptBuildCode** = *typeof* [`SCRIPT_BUILD_CODES`](#script_build_codes)\[keyof *typeof* [`SCRIPT_BUILD_CODES`](#script_build_codes)\]

Union of the SCRIPT builder error code string literals.

***

### ScriptFatalCode

> **ScriptFatalCode** = *typeof* [`SCRIPT_FATAL_CODES`](#script_fatal_codes)\[keyof *typeof* [`SCRIPT_FATAL_CODES`](#script_fatal_codes)\]

Union of the SCRIPT fatal error code string literals.

***

### ScriptTransactionName

> **ScriptTransactionName** = *typeof* [`SCRIPT_TRANSACTION_NAMES`](#script_transaction_names)\[`number`\]

Union of the SCRIPT transaction element names this parser will name.

***

### ScriptWarningCode

> **ScriptWarningCode** = *typeof* [`SCRIPT_WARNING_CODES`](#script_warning_codes)\[keyof *typeof* [`SCRIPT_WARNING_CODES`](#script_warning_codes)\]

Union of the SCRIPT warning code string literals.

***

### SegmentAbsenceReason

> **SegmentAbsenceReason** = `"unsourced"`

Why a code inside a declared 111-AM range carries no name in this package.

`"unsourced"`: no publicly readable artifact establishes what the standard
defines at this code, so the package neither names it nor claims that nothing
exists there. The normative vocabulary is the NCPDP External Code List, a
purchased product this package can neither cite nor redistribute. A transmission
carrying such a code is still decoded in full and warned, never dropped.

***

### SegmentGroup

> **SegmentGroup** = `"request"` \| `"response"`

Which half of a transmission a declared 111-AM code range covers. Both tokens
are this package's own vocabulary, not a decoded label.

***

### SigFieldProvenance

> **SigFieldProvenance** = `"coded"` \| `"derived"` \| `"absent"`

Where a decoded structured-SIG field's value came from.

- `"coded"`: the structured element carried a code (with an optional system
  qualifier); a [SigField.code](#code-10) is present.
- `"derived"`: a value was read from the structured element but it was not
  coded; only [SigField.text](#text) is present.
- `"absent"`: the structured element was missing or empty; neither a code nor
  text could be read. The field is **not** inferred from the free text.

***

### TelecomBuildCode

> **TelecomBuildCode** = *typeof* [`TELECOM_BUILD_CODES`](#telecom_build_codes)\[keyof *typeof* [`TELECOM_BUILD_CODES`](#telecom_build_codes)\]

Union of the Telecom builder error code string literals.

***

### TelecomFatalCode

> **TelecomFatalCode** = *typeof* [`TELECOM_FATAL_CODES`](#telecom_fatal_codes)\[keyof *typeof* [`TELECOM_FATAL_CODES`](#telecom_fatal_codes)\]

Union of the Telecom fatal error code string literals.

***

### TelecomVersion

> **TelecomVersion** = \{ `kind`: `"d0"`; \} \| \{ `kind`: `"f6"`; `stamp`: `string`; \} \| \{ `kind`: `"unsupported"`; `stamp`: `string`; \}

Classification of the version stamp peeked from a raw Telecom message.

- `"d0"`: the supported D.0 standard; decode the fixed header at D.0 offsets.
- `"f6"`: the emerging F6 stamp; recognized but not decoded (different layout).
- `"unsupported"`: no recognizable version stamp; the byte layout is untrustworthy.

***

### TelecomWarningCode

> **TelecomWarningCode** = *typeof* [`TELECOM_WARNING_CODES`](#telecom_warning_codes)\[keyof *typeof* [`TELECOM_WARNING_CODES`](#telecom_warning_codes)\]

Union of the Telecom warning code string literals.

***

### VersionClassification

> **VersionClassification** = \{ `kind`: `"known"`; `version`: [`KnownScriptVersion`](#knownscriptversion); \} \| \{ `kind`: `"tolerated"`; `version`: `string`; \} \| \{ `kind`: `"absent"`; \} \| \{ `kind`: `"unsupported"`; `version`: `string`; \}

Outcome of classifying a declared SCRIPT version string.

## Variables

### D0\_HEADER\_LENGTH

> `const` **D0\_HEADER\_LENGTH**: `56` = `56`

Byte length of the fixed vD.0 request Transaction Header.

#### Example

```ts
import { D0_HEADER_LENGTH } from "@cosyte/ncpdp/telecom";
D0_HEADER_LENGTH; // 56: the fixed-width vD.0 request header
```

***

### FIELD\_NAMES

> `const` **FIELD\_NAMES**: `ReadonlyMap`\<`string`, `string`\>

Paraphrased names for the safety-relevant B1 field identifiers this parser
surfaces, keyed by their 2-character field id. A field whose id is absent here
is still preserved verbatim: absence of a name means only that the parser has
not labeled it, never that the field is invalid or droppable.

#### Example

```ts
import { FIELD_NAMES } from "@cosyte/ncpdp/telecom";
FIELD_NAMES.get("D7"); // "Product / Service ID"
FIELD_NAMES.get("ZZ"); // undefined: unlabeled, still preserved verbatim
```

***

### FIELD\_SEPARATOR

> `const` **FIELD\_SEPARATOR**: "\\u001c" = "\\x1c"

Field Separator (NCPDP "FS", ASCII 0x1C): separates fields within a segment.

#### Example

```ts
import { FIELD_SEPARATOR } from "@cosyte/ncpdp/telecom";
FIELD_SEPARATOR.charCodeAt(0); // 28 (0x1C)
```

***

### GROUP\_SEPARATOR

> `const` **GROUP\_SEPARATOR**: "\\u001d" = "\\x1d"

Group Separator (NCPDP "GS", ASCII 0x1D): separates transactions in a transmission.

#### Example

```ts
import { GROUP_SEPARATOR } from "@cosyte/ncpdp/telecom";
GROUP_SEPARATOR.charCodeAt(0); // 29 (0x1D)
```

***

### KNOWN\_SCRIPT\_VERSIONS

> `const` **KNOWN\_SCRIPT\_VERSIONS**: readonly \[`"2017071"`, `"2023011"`\]

SCRIPT versions this parser explicitly supports. Both are XML-era releases
routed through Surescripts.

The pair is grounded in US federal regulation, which is public law and
therefore the license-clean source for a version identifier (the standard
itself is paywalled). Two sections carry it:

- **45 CFR 170.205(b)** adopts exactly these two SCRIPT Implementation Guide
  versions for electronic prescribing, at (b)(1) and (b)(2). It also states
  that the Secretary's adoption of `2017071` **expires on January 1, 2028**,
  after which `2023011` is the only SCRIPT version that paragraph adopts.
- **42 CFR 423.160** (Medicare Part D electronic prescribing) requires at
  (b)(1) that a prescription or prescription-related information comply with
  a standard in 45 CFR 170.205(b), and incorporates both guides by reference
  at (c)(2) and (c)(3).

**Scope, because the list is narrower than it looks.** This is the set those
two sections adopt, not the set of SCRIPT versions NCPDP has ever published.
A version outside it may well be real; nothing public that this package can
cite would establish that, so it is not written down here. Narrowing the list
never refuses a message: a present-but-unrecognized stamp is still parsed
best-effort and reported as `tolerated`, per [classifyVersion](#classifyversion).

#### Example

```ts
import { KNOWN_SCRIPT_VERSIONS } from "@cosyte/ncpdp/script";
KNOWN_SCRIPT_VERSIONS.includes("2023011"); // true
```

***

### SCRIPT\_BUILD\_CODES

> `const` **SCRIPT\_BUILD\_CODES**: `object`

Stable error codes for the SCRIPT **emit** side: the builder and the
serializer. Emit is the conservative half of Postel's Law: it refuses to
construct, or to write out, a message it cannot render honestly (with one of
these codes) rather than emitting XML a downstream system would reject or, in
the unmodeled-transaction case, XML that looks correct and is not. Distinct
from the parser's [SCRIPT\_FATAL\_CODES](#script_fatal_codes).

#### Type Declaration

##### INVALID\_CHARACTER

> `readonly` **INVALID\_CHARACTER**: `"NCPDP_SCRIPT_BUILD_INVALID_CHARACTER"` = `"NCPDP_SCRIPT_BUILD_INVALID_CHARACTER"`

A supplied value carries a character that is illegal in XML 1.0 text.

##### MISSING\_MEDICATION

> `readonly` **MISSING\_MEDICATION**: `"NCPDP_SCRIPT_BUILD_MISSING_MEDICATION"` = `"NCPDP_SCRIPT_BUILD_MISSING_MEDICATION"`

A NewRx was built with no prescribed medication (a drug description is required).

##### MISSING\_RESPONSE\_CODE

> `readonly` **MISSING\_RESPONSE\_CODE**: `"NCPDP_SCRIPT_BUILD_MISSING_RESPONSE_CODE"` = `"NCPDP_SCRIPT_BUILD_MISSING_RESPONSE_CODE"`

A `<Status>`/`<Error>`/`<Verify>` response was built without a `<Code>`.

##### UNSUPPORTED\_TRANSACTION

> `readonly` **UNSUPPORTED\_TRANSACTION**: `"NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION"` = `"NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION"`

Serializing was asked for a transaction this library does not model (an
`unsupported` body). Nothing under such a transaction is modeled, so the
only document emit could write is one with the transaction body deleted.

#### Example

```ts
import { SCRIPT_BUILD_CODES } from "@cosyte/ncpdp/common";
SCRIPT_BUILD_CODES.MISSING_RESPONSE_CODE; // "NCPDP_SCRIPT_BUILD_MISSING_RESPONSE_CODE"
```

***

### SCRIPT\_BUILD\_MESSAGES

> `const` **SCRIPT\_BUILD\_MESSAGES**: `Readonly`\<`Record`\<[`ScriptBuildCode`](#scriptbuildcode), `string`\>\>

The frozen message registry for SCRIPT builder errors: one fixed sentence per
code, and the only source an [NcpdpScriptBuildError](#ncpdpscriptbuilderror)'s `message` can come
from.

#### Example

```ts
import { SCRIPT_BUILD_CODES, SCRIPT_BUILD_MESSAGES } from "@cosyte/ncpdp/common";
SCRIPT_BUILD_MESSAGES[SCRIPT_BUILD_CODES.MISSING_MEDICATION];
```

***

### SCRIPT\_FATAL\_CODES

> `const` **SCRIPT\_FATAL\_CODES**: `object`

Fatal error codes for NCPDP SCRIPT parsing. A fatal is reserved for
unrecoverable structural corruption: input that cannot be treated as a
SCRIPT message at all. Everything recoverable is a warning instead (see
"./warnings".SCRIPT\_WARNING\_CODES).

#### Type Declaration

##### EMPTY\_INPUT

> `readonly` **EMPTY\_INPUT**: `"EMPTY_INPUT"` = `"EMPTY_INPUT"`

Input is empty or whitespace-only.

##### NO\_MESSAGE\_ROOT

> `readonly` **NO\_MESSAGE\_ROOT**: `"NCPDP_SCRIPT_NO_MESSAGE_ROOT"` = `"NCPDP_SCRIPT_NO_MESSAGE_ROOT"`

Well-formed XML, but the root element is not a SCRIPT `<Message>`.

##### NOT\_XML

> `readonly` **NOT\_XML**: `"NCPDP_SCRIPT_NOT_XML"` = `"NCPDP_SCRIPT_NOT_XML"`

Input is not well-formed XML, or carries a forbidden DOCTYPE/ENTITY.

##### UNSUPPORTED\_VERSION

> `readonly` **UNSUPPORTED\_VERSION**: `"NCPDP_SCRIPT_UNSUPPORTED_VERSION"` = `"NCPDP_SCRIPT_UNSUPPORTED_VERSION"`

The declared SCRIPT version predates the XML SCRIPT era and is unsupported.

#### Example

```ts
import { SCRIPT_FATAL_CODES } from "@cosyte/ncpdp/common";
SCRIPT_FATAL_CODES.NOT_XML; // "NCPDP_SCRIPT_NOT_XML"
```

***

### SCRIPT\_FATAL\_MESSAGES

> `const` **SCRIPT\_FATAL\_MESSAGES**: `Readonly`\<`Record`\<[`ScriptFatalCode`](#scriptfatalcode), `string`\>\>

The frozen message registry for SCRIPT fatals: one fixed sentence per code,
and the only source an [NcpdpScriptParseError](#ncpdpscriptparseerror)'s `message` can come from.

#### Example

```ts
import { SCRIPT_FATAL_CODES, SCRIPT_FATAL_MESSAGES } from "@cosyte/ncpdp/common";
SCRIPT_FATAL_MESSAGES[SCRIPT_FATAL_CODES.EMPTY_INPUT]; // "SCRIPT input is empty."
```

***

### SCRIPT\_TRANSACTION\_NAMES

> `const` **SCRIPT\_TRANSACTION\_NAMES**: readonly \[`"GetMessage"`, `"Status"`, `"Error"`, `"RxChangeRequest"`, `"RxChangeResponse"`, `"RxRenewalRequest"`, `"RxRenewalResponse"`, `"Resupply"`, `"Verify"`, `"CancelRx"`, `"CancelRxResponse"`, `"RxFill"`, `"DrugAdministration"`, `"NewRxRequest"`, `"NewRx"`, `"NewRxResponseDenied"`, `"RxTransferInitiationRequest"`, `"RxTransfer"`, `"RxTransferConfirm"`, `"RxFillIndicatorChange"`, `"Recertification"`, `"REMSInitiationRequest"`, `"REMSInitiationResponse"`, `"REMSRequest"`, `"REMSResponse"`, `"RxHistoryRequest"`, `"RxHistoryResponse"`, `"PAInitiationRequest"`, `"PAInitiationResponse"`, `"PARequest"`, `"PAResponse"`, `"PAAppealRequest"`, `"PAAppealResponse"`, `"PACancelRequest"`, `"PACancelResponse"`, `"PANotification"`\]

SCRIPT transaction element names this parser will **name**, as opposed to
model. It is a closed vocabulary the library owns, not something read out of a
document, and it exists so that an unmodeled transaction can still be
identified without copying a sender-chosen element name onto the model or into
a diagnostic.

The list is the transaction vocabulary published in **42 CFR 423.160**, the
federal e-prescribing standards rule, verbatim and in its order. That source is
public law, not the paywalled standard, which is why the names can be written
down here at all. Being grounded rather than invented matters: an earlier draft
of this list was written from memory and got three transfer names and the
recertification names wrong while omitting the whole prior-authorization and
REMS families, which would have silently stripped the identity off every ePA
message this library saw.

**One assumption is worth stating**: the regulation lists transaction *names*
in prose, and this list is matched against XML element *local names*. Those are
the same artifact only insofar as the regulation transcribed the standard's
element names, which the shape of the names strongly suggests but which cannot
be confirmed against a public source, since the schemas are paywalled. If one
of them turns out not to be the element name, that transaction is surfaced
unnamed, which is the same fail-safe path a vendor extension takes.

A transaction the standard defines but that regulation does not name is
surfaced as unmodeled and **unnamed**; so is a vendor extension. That is the
intended default, because the alternative (repeat whatever the element was
called) is what put document-derived bytes on a diagnostic surface. A consumer
that needs the element name reads the document it already holds.

Note that the PHI gate cannot check this list: a closed set passes it by
construction. What keeps it safe is that it stays closed and stays sourced,
which is a property of review, not of a test.

#### Example

```ts
import { SCRIPT_TRANSACTION_NAMES } from "@cosyte/ncpdp/script";
SCRIPT_TRANSACTION_NAMES.includes("RxHistoryRequest"); // true
```

***

### SCRIPT\_WARNING\_CODES

> `const` **SCRIPT\_WARNING\_CODES**: `object`

Stable warning codes for NCPDP SCRIPT parsing. Per Postel's Law, the parser is
lenient: anything recoverable yields a warning with one of these codes rather
than throwing. Codes are part of the public contract: renaming one is a
breaking change.

#### Type Declaration

##### LIFECYCLE\_AMBIGUOUS\_OUTCOME

> `readonly` **LIFECYCLE\_AMBIGUOUS\_OUTCOME**: `"NCPDP_SCRIPT_LIFECYCLE_AMBIGUOUS_OUTCOME"` = `"NCPDP_SCRIPT_LIFECYCLE_AMBIGUOUS_OUTCOME"`

A lifecycle response (`RxRenewalResponse`/`RxChangeResponse`/`CancelRxResponse`)
carried more than one outcome choice (e.g. both `<Approved>` and `<Denied>`);
the most conservative outcome (a denial before an approval) is reported so an
approval can never mask a denial.

##### LIFECYCLE\_OUTCOME\_UNRECOGNIZED

> `readonly` **LIFECYCLE\_OUTCOME\_UNRECOGNIZED**: `"NCPDP_SCRIPT_LIFECYCLE_OUTCOME_UNRECOGNIZED"` = `"NCPDP_SCRIPT_LIFECYCLE_OUTCOME_UNRECOGNIZED"`

A lifecycle response carried no recognized outcome choice; the outcome is
surfaced as `"unknown"` rather than being assumed to be an approval.

##### MISSING\_REQUIRED\_ELEMENT

> `readonly` **MISSING\_REQUIRED\_ELEMENT**: `"NCPDP_SCRIPT_MISSING_REQUIRED_ELEMENT"` = `"NCPDP_SCRIPT_MISSING_REQUIRED_ELEMENT"`

A required element for the detected transaction was missing; left undefined.

##### RESPONSE\_AMBIGUOUS\_DISPOSITION

> `readonly` **RESPONSE\_AMBIGUOUS\_DISPOSITION**: `"NCPDP_SCRIPT_RESPONSE_AMBIGUOUS_DISPOSITION"` = `"NCPDP_SCRIPT_RESPONSE_AMBIGUOUS_DISPOSITION"`

More than one response transaction (`<Status>`/`<Error>`/`<Verify>`) was
present in one body; the most conservative disposition (error first) is
reported so a failure is never masked by a co-present success.

##### SIG\_AMBIGUOUS\_DOSE

> `readonly` **SIG\_AMBIGUOUS\_DOSE**: `"NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE"` = `"NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE"`

A structured dose element was present but no unambiguous dose quantity could
be derived from it. The dose is surfaced as **absent** (provenance
`"absent"`) rather than a guessed value, so an ambiguous SIG never yields a
confident dose.

##### SIG\_STRUCTURED\_LOSSY

> `readonly` **SIG\_STRUCTURED\_LOSSY**: `"NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY"` = `"NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY"`

A structured `<Sig>` was decoded into typed dosing components. The decode is
**best-effort and lossy**; the free-text `SigText` remains the source of
truth and is preserved verbatim. Raised once per medication carrying any
structured component so a consumer never mistakes the additive structured
view for an authoritative one.

##### STRENGTH\_CODED\_AND\_EXPLICIT

> `readonly` **STRENGTH\_CODED\_AND\_EXPLICIT**: `"NCPDP_SCRIPT_STRENGTH_CODED_AND_EXPLICIT"` = `"NCPDP_SCRIPT_STRENGTH_CODED_AND_EXPLICIT"`

A coded drug and an explicit Strength were both present; both surfaced, never reconciled.

##### UNSUPPORTED\_TRANSACTION

> `readonly` **UNSUPPORTED\_TRANSACTION**: `"NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION"` = `"NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION"`

The transaction body is a SCRIPT type this parser does not model; surfaced as unsupported.

##### UNSUPPORTED\_VERSION\_TOLERATED

> `readonly` **UNSUPPORTED\_VERSION\_TOLERATED**: `"NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED"` = `"NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED"`

Version is a plausible SCRIPT release we don't explicitly support; tolerated.

##### VERSION\_ABSENT

> `readonly` **VERSION\_ABSENT**: `"NCPDP_SCRIPT_VERSION_ABSENT"` = `"NCPDP_SCRIPT_VERSION_ABSENT"`

No version could be determined from the message; parsed best-effort.

#### Example

```ts
import { SCRIPT_WARNING_CODES } from "@cosyte/ncpdp/common";
SCRIPT_WARNING_CODES.VERSION_ABSENT; // "NCPDP_SCRIPT_VERSION_ABSENT"
```

***

### SCRIPT\_WARNING\_MESSAGES

> `const` **SCRIPT\_WARNING\_MESSAGES**: `Readonly`\<`Record`\<[`ScriptWarningCode`](#scriptwarningcode), `string`\>\>

The frozen message registry: one fixed sentence per SCRIPT warning code, and
the **only** source a warning's `message` can come from.

This is the mechanism, not a convention. [scriptWarning](#scriptwarning) takes no value
parameter at all, so there is no interpolation site for a document-derived
string to reach: a message is a table lookup or it does not exist. Everything
a consumer needs to locate the problem travels in the `code` and the
[ScriptPosition](#scriptposition), whose path is built from element names this parser
recognizes rather than from names a sender chose.

#### Example

```ts
import { SCRIPT_WARNING_CODES, SCRIPT_WARNING_MESSAGES } from "@cosyte/ncpdp/common";
SCRIPT_WARNING_MESSAGES[SCRIPT_WARNING_CODES.VERSION_ABSENT];
// "No SCRIPT version declared; parsed best-effort."
```

***

### SEGMENT\_ABSENCES

> `const` **SEGMENT\_ABSENCES**: `ReadonlyMap`\<`string`, [`SegmentAbsence`](#segmentabsence)\>

Why each unnamed code inside a declared range has no name here, keyed by the
2-character 111-AM code. A code that is absent from this map and from
`SEGMENT_NAMES` is simply outside every range this package declares (`99`, say):
it decodes identically, and the inventory makes no claim about it either way.

Absence of a name is never absence of data. The segment and every one of its
fields survive verbatim, in wire order, with `NCPDP_TELECOM_UNKNOWN_SEGMENT`.

#### Example

```ts
import { SEGMENT_ABSENCES } from "@cosyte/ncpdp/telecom";
SEGMENT_ABSENCES.get("06")?.reason; // "unsourced"
SEGMENT_ABSENCES.get("07"); // undefined: 07 is named
```

***

### SEGMENT\_CODE\_RANGES

> `const` **SEGMENT\_CODE\_RANGES**: readonly [`SegmentCodeRange`](#segmentcoderange)[]

The 111-AM code ranges this package declares. Neither range's bounds are
established by any artifact this package can cite (`boundsVerified` is `false`
on both), so read them as the extent of this package's own claim of coverage
and not as the extent of the standard.

Every code inside a declared range is either named by `SEGMENT_NAMES` or carries
a `SEGMENT_ABSENCES` record; `test/telecom/segment-inventory.test.ts` fails when
one is neither.

#### Example

```ts
import { SEGMENT_CODE_RANGES } from "@cosyte/ncpdp/telecom";
SEGMENT_CODE_RANGES[0]?.group; // "request"
SEGMENT_CODE_RANGES.every((r) => r.boundsVerified); // false: nothing sources them
```

***

### SEGMENT\_ID\_LENGTH

> `const` **SEGMENT\_ID\_LENGTH**: `2` = `2`

Wire width of the Segment Identification (111-AM) code: two characters in the
Telecommunication standard, which both halves of this library treat as a
structural shape rather than a hint. The parser will not promote an AM value
of any other length to [TelecomSegment.segmentId](#segmentid), and the builder
refuses to construct one, so the bound holds however a transaction was made.

#### Example

```ts
import { SEGMENT_ID_LENGTH } from "@cosyte/ncpdp/telecom";
SEGMENT_ID_LENGTH; // 2
```

***

### SEGMENT\_NAMES

> `const` **SEGMENT\_NAMES**: `ReadonlyMap`\<`string`, `string`\>

Segment Identification (111-AM) codes modeled by this parser, mapped to our own
paraphrased names. Codes are factual identifiers from the NCPDP
Telecommunication standard; the names are ours (no redistributed NCPDP prose).
A code outside this set is preserved verbatim with an undefined name.

This map is not the whole inventory. `SEGMENT_CODE_RANGES` publishes the code
ranges this package declares, and `SEGMENT_ABSENCES` says why each code inside
one of them carries no name here, so an unnamed code can be told apart from an
unexplained hole.

#### Example

```ts
import { SEGMENT_NAMES } from "@cosyte/ncpdp/telecom";
SEGMENT_NAMES.get("07"); // "Claim"
SEGMENT_NAMES.get("99"); // undefined: preserved verbatim, just not labeled
```

***

### SEGMENT\_SEPARATOR

> `const` **SEGMENT\_SEPARATOR**: "\\u001e" = "\\x1e"

Segment Separator (NCPDP "RS", ASCII 0x1E): separates segments within a transaction.

#### Example

```ts
import { SEGMENT_SEPARATOR } from "@cosyte/ncpdp/telecom";
SEGMENT_SEPARATOR.charCodeAt(0); // 30 (0x1E)
```

***

### TELECOM\_BUILD\_CODES

> `const` **TELECOM\_BUILD\_CODES**: `object`

Stable error codes for the Telecom **builder**. The builder is the
conservative (emit) half of Postel's Law: it refuses to construct a
message that is invalid by construction, with one of these codes, rather
than producing malformed wire output that a downstream system would have to
reject. These are distinct from the parser's [TELECOM\_FATAL\_CODES](#telecom_fatal_codes).

#### Type Declaration

##### EMBEDDED\_CONTROL\_CHARACTER

> `readonly` **EMBEDDED\_CONTROL\_CHARACTER**: `"NCPDP_TELECOM_BUILD_EMBEDDED_CONTROL_CHARACTER"` = `"NCPDP_TELECOM_BUILD_EMBEDDED_CONTROL_CHARACTER"`

A field separator / group separator / segment separator appeared inside supplied data.

##### FIELD\_TOO\_LONG

> `readonly` **FIELD\_TOO\_LONG**: `"NCPDP_TELECOM_BUILD_FIELD_TOO_LONG"` = `"NCPDP_TELECOM_BUILD_FIELD_TOO_LONG"`

A fixed-width header field was supplied with a value longer than its wire width.

##### INVALID\_FIELD\_ID

> `readonly` **INVALID\_FIELD\_ID**: `"NCPDP_TELECOM_BUILD_INVALID_FIELD_ID"` = `"NCPDP_TELECOM_BUILD_INVALID_FIELD_ID"`

A data field was supplied without a 2-character field identifier.

##### INVALID\_SEGMENT\_ID

> `readonly` **INVALID\_SEGMENT\_ID**: `"NCPDP_TELECOM_BUILD_INVALID_SEGMENT_ID"` = `"NCPDP_TELECOM_BUILD_INVALID_SEGMENT_ID"`

A segment was supplied with a Segment Identification (111-AM) code that is
not exactly 2 characters. The builder refuses it for the same reason the
parser refuses to promote one: 111-AM is 2 characters on the wire, and a
longer value would put unbounded caller data on `segment.segmentId`, which
the model documents as bounded and safe for a consumer to interpolate.

##### MISSING\_SEGMENT\_ID

> `readonly` **MISSING\_SEGMENT\_ID**: `"NCPDP_TELECOM_BUILD_MISSING_SEGMENT_ID"` = `"NCPDP_TELECOM_BUILD_MISSING_SEGMENT_ID"`

A segment was supplied with no Segment Identification code.

##### MISSING\_TRANSACTION\_CODE

> `readonly` **MISSING\_TRANSACTION\_CODE**: `"NCPDP_TELECOM_BUILD_MISSING_TRANSACTION_CODE"` = `"NCPDP_TELECOM_BUILD_MISSING_TRANSACTION_CODE"`

No Transaction Code (103-A3) was supplied; a request cannot be routed without one.

##### MULTI\_TRANSACTION\_EMIT

> `readonly` **MULTI\_TRANSACTION\_EMIT**: `"NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT"` = `"NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT"`

A model carrying more than one decoded transaction was handed to the
serializer. Emit is whole-message, one transaction per transmission, so the
only two honest answers are to write every transaction or to refuse: writing
the first and dropping the rest would turn a complete read into a silently
partial message. The reader decodes them all; the writer says it cannot yet
express them all.

#### Example

```ts
import { TELECOM_BUILD_CODES } from "@cosyte/ncpdp/telecom";
TELECOM_BUILD_CODES.MISSING_TRANSACTION_CODE; // "NCPDP_TELECOM_BUILD_MISSING_TRANSACTION_CODE"
```

***

### TELECOM\_BUILD\_MESSAGES

> `const` **TELECOM\_BUILD\_MESSAGES**: `Readonly`\<`Record`\<[`TelecomBuildCode`](#telecombuildcode), `string`\>\>

The frozen message registry for Telecom builder errors.

Every entry names the **rule** that was broken, never the offending value. A
caller who supplied the value knows what it was; the library quoting it back
is how a cardholder id ends up in a log line. Where the rejection is about one
fixed-header slot, the slot travels as
[NcpdpTelecomBuildError.headerField](#headerfield), which is typed closed.

#### Example

```ts
import { TELECOM_BUILD_CODES, TELECOM_BUILD_MESSAGES } from "@cosyte/ncpdp/telecom";
TELECOM_BUILD_MESSAGES[TELECOM_BUILD_CODES.INVALID_FIELD_ID];
```

***

### TELECOM\_FATAL\_CODES

> `const` **TELECOM\_FATAL\_CODES**: `object`

Fatal error codes for NCPDP Telecommunication-standard parsing. A fatal is
reserved for structure that cannot be treated as a Telecom transmission at all:
input too short to hold the fixed Transaction Header, an unframeable body,
or a version whose byte layout this reader cannot trust. Everything
recoverable is a warning instead (see "./warnings".TELECOM\_WARNING\_CODES).

#### Type Declaration

##### EMPTY\_INPUT

> `readonly` **EMPTY\_INPUT**: `"EMPTY_INPUT"` = `"EMPTY_INPUT"`

Input is empty or whitespace-only.

##### INVALID\_FRAMING

> `readonly` **INVALID\_FRAMING**: `"NCPDP_TELECOM_INVALID_FRAMING"` = `"NCPDP_TELECOM_INVALID_FRAMING"`

The message body carries content but none of the framing control characters
needed to tokenize it into segments and fields; a separator is never guessed.

##### NO\_HEADER

> `readonly` **NO\_HEADER**: `"NCPDP_TELECOM_NO_HEADER"` = `"NCPDP_TELECOM_NO_HEADER"`

Input is too short to contain the fixed Transaction Header.

##### UNSUPPORTED\_VERSION

> `readonly` **UNSUPPORTED\_VERSION**: `"NCPDP_TELECOM_UNSUPPORTED_VERSION"` = `"NCPDP_TELECOM_UNSUPPORTED_VERSION"`

A version stamp is present but is neither the supported D.0 nor a recognized
future stamp (e.g. F6); the fixed-header byte layout cannot be trusted, so
the message is refused rather than decoded against the wrong offsets.

#### Example

```ts
import { TELECOM_FATAL_CODES } from "@cosyte/ncpdp/telecom";
TELECOM_FATAL_CODES.NO_HEADER; // "NCPDP_TELECOM_NO_HEADER"
```

***

### TELECOM\_FATAL\_MESSAGES

> `const` **TELECOM\_FATAL\_MESSAGES**: `Readonly`\<`Record`\<[`TelecomFatalCode`](#telecomfatalcode), `string`\>\>

The frozen message registry for Telecom fatals: one fixed sentence per code,
and the only source an [NcpdpTelecomParseError](#ncpdptelecomparseerror)'s `message` can come from.

The two length-related entries name the parser's own fixed header widths
rather than the input's length. A byte count is a number and could not carry a
value on its own, but it is also nothing a caller cannot measure from the
input it just passed in, and dropping it is what lets a test assert that a
message equals its registry entry exactly.

#### Example

```ts
import { TELECOM_FATAL_CODES, TELECOM_FATAL_MESSAGES } from "@cosyte/ncpdp/telecom";
TELECOM_FATAL_MESSAGES[TELECOM_FATAL_CODES.EMPTY_INPUT]; // "Input is empty."
```

***

### TELECOM\_WARNING\_CODES

> `const` **TELECOM\_WARNING\_CODES**: `object`

Stable warning codes for NCPDP Telecommunication-standard parsing. Per Postel's
Law, the parser is lenient: anything recoverable yields a warning with one of
these codes rather than throwing, and the underlying bytes are always preserved
verbatim so nothing is silently dropped. Codes are part of the public contract.
Renaming one is a breaking change.

#### Type Declaration

##### COB\_COUNT\_MISMATCH

> `readonly` **COB\_COUNT\_MISMATCH**: `"NCPDP_TELECOM_COB_COUNT_MISMATCH"` = `"NCPDP_TELECOM_COB_COUNT_MISMATCH"`

A Coordination-of-Benefits segment declared an other-payer/other-payment count
(337-4C request, 355-NT response) that disagrees with the number of other-payer
blocks decoded. Every block is still surfaced; this flags a possible mis-read
COB chain so secondary-payer money is never silently dropped or duplicated.

##### COMPOUND\_COUNT\_MISMATCH

> `readonly` **COMPOUND\_COUNT\_MISMATCH**: `"NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH"` = `"NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH"`

A Compound segment declared an ingredient count (447-EC) that disagrees with
the number of ingredient occurrences actually decoded. Every ingredient is
still surfaced verbatim; this flags a possible truncated/over-stuffed compound
so a missing or extra ingredient is never silent (a compound with a missing
ingredient is, clinically, a different medication).

##### MALFORMED\_FIELD

> `readonly` **MALFORMED\_FIELD**: `"NCPDP_TELECOM_MALFORMED_FIELD"` = `"NCPDP_TELECOM_MALFORMED_FIELD"`

A field token was too short to carry a 2-character field identifier. It is
preserved verbatim (with an empty id) rather than dropped.

##### MALFORMED\_SEGMENT\_ID

> `readonly` **MALFORMED\_SEGMENT\_ID**: `"NCPDP_TELECOM_MALFORMED_SEGMENT_ID"` = `"NCPDP_TELECOM_MALFORMED_SEGMENT_ID"`

A segment led with an `AM` field whose value is not a 2-character Segment
Identification code. Off-shape bytes there are almost always a framing
failure (a dropped field separator runs the rest of the segment into the
code), so the value is **not** promoted to `segment.segmentId`: it stays in
the segment's `fields` as the `AM` field, verbatim and nothing dropped, and
the segment id reads empty. Keeping it out of the id also keeps unbounded
wire bytes off a structural identifier a downstream package would build a
diagnostic from.

##### MISSING\_SEGMENT\_ID

> `readonly` **MISSING\_SEGMENT\_ID**: `"NCPDP_TELECOM_MISSING_SEGMENT_ID"` = `"NCPDP_TELECOM_MISSING_SEGMENT_ID"`

A segment's first field was not the Segment Identification (`AM`). The
segment is still surfaced with its fields preserved, but its segment id is
left empty since it could not be read from the expected position.

##### STATUS\_CONFLICT

> `readonly` **STATUS\_CONFLICT**: `"NCPDP_TELECOM_STATUS_CONFLICT"` = `"NCPDP_TELECOM_STATUS_CONFLICT"`

A response declared a paid/captured/approved Transaction Response Status
(112-AN) **while also carrying one or more reject codes**. The two disagree;
the library resolves the disposition to **rejected** (a reject always wins:
a consumer must never be told a rejected claim was paid) and raises this so
the conflict is visible, never silent.

##### TRANSACTION\_COUNT\_MISMATCH

> `readonly` **TRANSACTION\_COUNT\_MISMATCH**: `"NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH"` = `"NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH"`

The Transaction Count (109-A9) declared in the fixed header disagrees with
the number of group-separated transactions actually decoded. Every decoded
transaction is still surfaced on `transaction.transactions`; the declared
value stays verbatim on `transaction.transactionCount` and the decoded number
on `transaction.decodedTransactionCount`, so a consumer reads both and this
warning only says they differ.

It reports a **disagreement**, never an illegal count: no public artifact
establishing a maximum could be read, so this reader enforces none and a
transmission declaring any number decodes every transaction it carries.

##### UNKNOWN\_DUR\_REASON

> `readonly` **UNKNOWN\_DUR\_REASON**: `"NCPDP_TELECOM_UNKNOWN_DUR_REASON"` = `"NCPDP_TELECOM_UNKNOWN_DUR_REASON"`

A request DUR/PPS Reason For Service code (439-E4) is not one this parser
recognizes. The code is preserved verbatim and surfaced; only the
human-readable description is absent. The interaction is never dropped.

##### UNKNOWN\_REJECT\_CODE

> `readonly` **UNKNOWN\_REJECT\_CODE**: `"NCPDP_TELECOM_UNKNOWN_REJECT_CODE"` = `"NCPDP_TELECOM_UNKNOWN_REJECT_CODE"`

A Reject Code (511-FB) value is not one this parser recognizes. The code is
preserved verbatim and surfaced with `known: false`; only the human-readable
description is absent. The reject is never dropped or reinterpreted.

##### UNKNOWN\_RESPONSE\_STATUS

> `readonly` **UNKNOWN\_RESPONSE\_STATUS**: `"NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS"` = `"NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS"`

A Transaction Response Status (112-AN) value is not one this parser models.
The status is preserved verbatim and the disposition reads `"unknown"`:
never assumed paid, so an unrecognized status can never imply payment.

##### UNKNOWN\_SEGMENT

> `readonly` **UNKNOWN\_SEGMENT**: `"NCPDP_TELECOM_UNKNOWN_SEGMENT"` = `"NCPDP_TELECOM_UNKNOWN_SEGMENT"`

A segment's identification code is not one this parser models. The segment and
its fields are preserved verbatim (keyed by their field ids) and surfaced;
only the human-readable segment name is left undefined.

##### VF6\_NOT\_DECODED

> `readonly` **VF6\_NOT\_DECODED**: `"NCPDP_TELECOM_VF6_NOT_DECODED"` = `"NCPDP_TELECOM_VF6_NOT_DECODED"`

The message declares the emerging F6 version stamp. F6 changes the fixed
header layout (an 8-byte IIN replaces the 6-byte BIN, among other changes),
so this D.0 reader **recognizes but does not decode** it: the version is
surfaced and the body is left untokenized rather than read against the wrong
offsets.

#### Example

```ts
import { TELECOM_WARNING_CODES } from "@cosyte/ncpdp/telecom";
TELECOM_WARNING_CODES.UNKNOWN_SEGMENT; // "NCPDP_TELECOM_UNKNOWN_SEGMENT"
```

***

### TELECOM\_WARNING\_MESSAGES

> `const` **TELECOM\_WARNING\_MESSAGES**: `Readonly`\<`Record`\<[`TelecomWarningCode`](#telecomwarningcode), `string`\>\>

The frozen message registry: one fixed sentence per Telecom warning code, and
the **only** source a warning's `message` can come from.

This is the mechanism, not a convention. [telecomWarning](#telecomwarning) takes no value
parameter at all, so there is no interpolation site for wire bytes to reach.
A Telecom transmission is PHI-dense in almost every field, and a message that
quoted so much as a segment code could quote an NDC or a prescription number
instead the moment a field separator went missing. What a consumer needs to
locate the problem travels in the `code` and the [TelecomPosition](#telecomposition): a
byte offset and, when known, a 2-character field identifier.

#### Example

```ts
import { TELECOM_WARNING_CODES, TELECOM_WARNING_MESSAGES } from "@cosyte/ncpdp/telecom";
TELECOM_WARNING_MESSAGES[TELECOM_WARNING_CODES.UNKNOWN_SEGMENT];
// "The segment at this offset declares a code this parser does not model; preserved verbatim."
```

***

### VERSION

> `const` **VERSION**: `string` = `"0.1.5"`

Library version string, synced with `package.json#version` by the build.

#### Example

```ts
import { VERSION } from "@cosyte/ncpdp";
console.log(VERSION);
```

## Functions

### approvalOf()

> **approvalOf**(`outcome`): [`ResponseApproval`](#responseapproval)

Map a [ResponseOutcome](#responseoutcome) to its fail-safe [ResponseApproval](#responseapproval). Total
and one-directional: only an outright approval is `"affirmative"`; denials are
`"negative"`; everything else (`replace`/`validated`/`unknown`) is
`"indeterminate"`.

#### Parameters

##### outcome

[`ResponseOutcome`](#responseoutcome)

The detected response outcome.

#### Returns

[`ResponseApproval`](#responseapproval)

The coarse approval classification.

#### Example

```ts
approvalOf("denied"); // "negative"
approvalOf("approvedWithChanges"); // "affirmative"
approvalOf("unknown"); // "indeterminate"
```

***

### buildNewRx()

> **buildNewRx**(`input`): [`ScriptMessage`](#scriptmessage)

Build a spec-clean SCRIPT **NewRx** message. The conservative (emit) half of
Postel's Law: it refuses to construct a NewRx with no prescribed-medication
description ([SCRIPT\_BUILD\_CODES.MISSING\_MEDICATION](#missing_medication)) or carrying an
XML-illegal control character ([SCRIPT\_BUILD\_CODES.INVALID\_CHARACTER](#invalid_character)),
throwing [NcpdpScriptBuildError](#ncpdpscriptbuilderror) rather than emitting an unusable message.

The returned [ScriptMessage](#scriptmessage) serializes (via
"./serialize".serializeScript / `toString()`) to XML that re-parses with
zero warnings.

#### Parameters

##### input

[`NewRxInput`](#newrxinput)

The header, parties, and medication to build.

#### Returns

[`ScriptMessage`](#scriptmessage)

A frozen [ScriptMessage](#scriptmessage) carrying a NewRx body.

#### Throws

NcpdpScriptBuildError when the input cannot form a spec-clean NewRx.

#### Example

```ts
import { buildNewRx } from "@cosyte/ncpdp/script";
const msg = buildNewRx({
  header: { version: "2017071", messageId: "SYNTH-1" },
  medication: { description: "Amoxicillin 500 MG Oral Capsule" },
});
msg.toString(); // canonical SCRIPT XML
```

***

### buildScriptResponse()

> **buildScriptResponse**(`input`): [`ScriptMessage`](#scriptmessage)

Build a spec-clean SCRIPT response (`<Status>`/`<Error>`/`<Verify>`) message.
Refuses to construct a response with no `<Code>`
([SCRIPT\_BUILD\_CODES.MISSING\_RESPONSE\_CODE](#missing_response_code)): the one field the parser
itself flags as required, or an XML-illegal control character
([SCRIPT\_BUILD\_CODES.INVALID\_CHARACTER](#invalid_character)).

#### Parameters

##### input

[`ScriptResponseInput`](#scriptresponseinput)

The response kind, code, optional description, and header.

#### Returns

[`ScriptMessage`](#scriptmessage)

A frozen [ScriptMessage](#scriptmessage) carrying the response body.

#### Throws

NcpdpScriptBuildError when the input cannot form a spec-clean response.

#### Example

```ts
import { buildScriptResponse } from "@cosyte/ncpdp/script";
const ack = buildScriptResponse({
  kind: "Status",
  code: "010",
  header: { relatesToMessageId: "SYNTH-1" },
});
ack.disposition; // "success"
```

***

### buildTelecomRequest()

> **buildTelecomRequest**(`input`): [`TelecomTransaction`](#telecomtransaction)

Build a spec-clean NCPDP Telecommunication vD.0 **request** transaction from a
structured model. The conservative (emit) half of Postel's Law: it refuses to
construct a message that is invalid by construction: a missing Transaction
Code, a missing or non-2-character Segment Identification, a non-2-character
field id, an embedded FS/GS/RS control character, or an over-long fixed-header
field: throwing a typed [NcpdpTelecomBuildError](#ncpdptelecombuilderror) rather than producing
malformed wire output a downstream processor would have to reject.

The returned transaction is frozen and ready for
"./serialize".serializeTelecom; the round trip
`parseTelecom(serializeTelecom(buildTelecomRequest(input)))` re-parses with zero
warnings.

#### Parameters

##### input

[`TelecomRequestInput`](#telecomrequestinput)

The header fields and segments to build.

#### Returns

[`TelecomTransaction`](#telecomtransaction)

A frozen, valid-by-construction [TelecomTransaction](#telecomtransaction).

#### Throws

NcpdpTelecomBuildError when the input cannot form a spec-clean message.

#### Example

```ts
import { buildTelecomRequest, serializeTelecom } from "@cosyte/ncpdp/telecom";
const t = buildTelecomRequest({
  header: { transactionCode: "B1", binNumber: "999999" },
  segments: [{ segmentId: "07", fields: [{ id: "D2", value: "RX0000001" }] }],
});
serializeTelecom(t); // canonical wire string
```

***

### cancelRx()

> **cancelRx**(`message`): [`CancelRx`](#cancelrx) \| `undefined`

Convenience accessor: the [CancelRx](#cancelrx) body, or `undefined`.

#### Parameters

##### message

[`ScriptMessage`](#scriptmessage)

A parsed [ScriptMessage](#scriptmessage).

#### Returns

[`CancelRx`](#cancelrx) \| `undefined`

The cancel body, or `undefined`.

#### Example

```ts
cancelRx(parseScript(xml))?.medicationPrescribed?.description;
```

***

### cancelRxResponse()

> **cancelRxResponse**(`message`): [`CancelRxResponse`](#cancelrxresponse) \| `undefined`

Convenience accessor: the [CancelRxResponse](#cancelrxresponse) body, or `undefined`.

#### Parameters

##### message

[`ScriptMessage`](#scriptmessage)

A parsed [ScriptMessage](#scriptmessage).

#### Returns

[`CancelRxResponse`](#cancelrxresponse) \| `undefined`

The cancel-response body, or `undefined`.

#### Example

```ts
cancelRxResponse(parseScript(xml))?.outcome; // "approved" | "denied" | …
```

***

### claim()

> **claim**(`transaction`, `index?`): [`TelecomClaim`](#telecomclaim) \| `undefined`

Build the B1/B2/B3 request view over one decoded transaction of a parsed
Telecom transmission.

A transmission may carry several claims for the same patient, so the view is
addressed by transaction index: `index` defaults to the first transaction and
every decoded transaction is reachable, not just the leading one. An index past
the last decoded transaction reads `undefined` rather than throwing.

#### Parameters

##### transaction

[`TelecomTransaction`](#telecomtransaction)

A transmission from [parseTelecom](#parsetelecom).

##### index?

`number` = `0`

Zero-based transaction index; defaults to the first.

#### Returns

[`TelecomClaim`](#telecomclaim) \| `undefined`

The [TelecomClaim](#telecomclaim) view, or `undefined` when that transaction
  decoded no segments.

#### Example

```ts
const t = parseTelecom(rawClaim);
claim(t)?.product?.id;    // the first transaction's dispensed NDC
claim(t, 1)?.product?.id; // the second transaction's, when the message carried one
```

***

### claimView()

> **claimView**(`transactionCode`, `segments`): [`TelecomClaim`](#telecomclaim) \| `undefined`

Build the B1/B2/B3 request view over a decoded Telecom transaction. Returns
`undefined` only when the transaction carries no segments at all; otherwise it
surfaces whatever safety-relevant fields are present, each optional.

#### Parameters

##### transactionCode

`string`

Transaction Code (103-A3) from the header.

##### segments

readonly [`TelecomSegment`](#telecomsegment)[]

The decoded segments in wire order.

#### Returns

[`TelecomClaim`](#telecomclaim) \| `undefined`

The claim view, or `undefined` when there are no segments to read.

#### Example

```ts
const t = parseTelecom(raw);
claimView(t.header.transactionCode, t.segments)?.product?.id; // the NDC
```

***

### classifyVersion()

> **classifyVersion**(`raw`): [`VersionClassification`](#versionclassification)

Classify a declared SCRIPT version string.

- A known XML version → `known`.
- A legacy dotted major (pre-XML, e.g. `10.6`) → `unsupported` (fatal).
- Absent/blank → `absent` (parse best-effort + warn).
- Anything else present-but-unrecognized → `tolerated` (parse best-effort +
  warn), since refusing an odd-but-present version string would violate
  Postel's Law for a message that is still XML.

#### Parameters

##### raw

`string` \| `undefined`

The version attribute value, or `undefined` when absent.

#### Returns

[`VersionClassification`](#versionclassification)

The [VersionClassification](#versionclassification).

#### Example

```ts
classifyVersion("2017071"); // { kind: "known", version: "2017071" }
classifyVersion("2099001"); // { kind: "tolerated", version: "2099001" }
classifyVersion("10.6");    // { kind: "unsupported", version: "10.6" }
classifyVersion(undefined); // { kind: "absent" }
```

***

### codedValue()

> **codedValue**(`value`, `qualifier`): [`CodedValue`](#codedvalue)

Build a frozen [CodedValue](#codedvalue) from a raw code and qualifier, recognizing
the code system in the process.

#### Parameters

##### value

`string`

The code, verbatim.

##### qualifier

`string`

The accompanying qualifier string.

#### Returns

[`CodedValue`](#codedvalue)

A frozen [CodedValue](#codedvalue).

#### Example

```ts
codedValue("00002821501", "ND").system; // "NDC"
```

***

### dateValue()

> **dateValue**(`raw`): [`DateValue`](#datevalue) \| `undefined`

Decode a verbatim NCPDP date string into a [DateValue](#datevalue), or `undefined`
when it is not a value this package decodes.

Never throws, for any input, and never returns a half-filled value: a string
that is not exactly eight digits, or that names a day the calendar does not
have (February 30, month 13, day 0), is `undefined` rather than a value with
some components set. `undefined` and `null` are `undefined` too, so a caller
can hand it an optional field straight off a parsed model.

Returning `undefined` loses nothing. Unlike "./decimal".decimalValue
and its siblings, this wrapper never replaces a field on a parsed structure:
the wire string stays on the model whatever this answers, so there is no
source for the caller to lose.

#### Parameters

##### raw

`string` \| `null` \| `undefined`

The date value exactly as it appeared on the wire.

#### Returns

[`DateValue`](#datevalue) \| `undefined`

A frozen [DateValue](#datevalue), or `undefined` when the string does not
  match a decoded form.

#### Example

```ts
dateValue("19880705")?.month; // 7: spec-native, never 6
dateValue("19880732");        // undefined: no such day, nothing partial
dateValue("1988-07-05");      // undefined: not a form this package declares
```

***

### decimalValue()

> **decimalValue**(`raw`): [`DecimalValue`](#decimalvalue)

Wrap a raw textual value as a [DecimalValue](#decimalvalue) without converting to a
float. Invalid input is preserved as-is with `isValid: false`: lenient parse,
never a throw.

#### Parameters

##### raw

`string`

The textual value from the message (already trimmed by the caller).

#### Returns

[`DecimalValue`](#decimalvalue)

A frozen [DecimalValue](#decimalvalue).

#### Example

```ts
decimalValue("0.1").isValid;   // true
decimalValue("1/2").isValid;   // false (still preserved as source)
```

***

### decodeD0Header()

> **decodeD0Header**(`raw`): [`TelecomHeader`](#telecomheader)

Decode the fixed-length D.0 Transaction Header from the head of a raw message.
The caller guarantees `raw.length >= {@link D0_HEADER_LENGTH}`. Each positional
field is sliced and trimmed of pad whitespace.

#### Parameters

##### raw

`string`

The raw message text (length already validated by the caller).

#### Returns

[`TelecomHeader`](#telecomheader)

A frozen [TelecomHeader](#telecomheader).

#### Example

```ts
const h = decodeD0Header("610279D0B1".padEnd(56, " "));
h.binNumber;       // "610279"
h.transactionCode; // "B1"
```

***

### deepFreeze()

> **deepFreeze**\<`T`\>(`value`): `T`

Recursively freeze an object graph so parsed models are immutable by default.
Mutation, where allowed, happens only through explicit builder/setter methods
that return new instances: never by reaching into a returned model.

#### Type Parameters

##### T

`T`

The value type.

#### Parameters

##### value

`T`

The value to deep-freeze in place.

#### Returns

`T`

The same reference, now deeply frozen.

#### Example

```ts
const m = deepFreeze({ a: { b: 1 } });
Object.isFrozen(m.a); // true
```

***

### defineProfile()

> **defineProfile**(`opts`): [`NcpdpProfile`](#ncpdpprofile)

Build a readonly [NcpdpProfile](#ncpdpprofile) from a validated spec. Invalid input
throws "./errors.js".NcpdpProfileError with an actionable message:
missing/empty name, unknown option key (with a typo hint), or a quirk that
breaks the fixture rule or the quirk shape (missing `fixture`, bad `standard`/`effect`,
unknown `expectedWarnings` code).

`extends` composes parent profiles: lineage flattens + dedupes, quirks merge
by id (child wins on collision, non-colliding parent quirks survive), and
`description` is last-wins.

#### Parameters

##### opts

[`NcpdpProfileSpec`](#ncpdpprofilespec)

#### Returns

[`NcpdpProfile`](#ncpdpprofile)

#### Example

```ts
import { defineProfile } from "@cosyte/ncpdp/profiles";
const pbm = defineProfile({
  name: "pbm",
  description: "PBM / clearinghouse Telecom claim conventions",
  quirks: [
    {
      id: "person-code-required",
      standard: "telecom",
      effect: "requires",
      summary: "Insurance segment carries a Person Code (303-C3).",
      fixture: "telecom/pbm-person-code.ncpdp",
      sourceCategory: "NCPDP Telecommunication vD.0: Person Code (303-C3)",
    },
  ],
});
pbm.name;                    // "pbm"
pbm.lineage;                 // ["pbm"]
pbm.describe().requires;     // [{ id: "person-code-required", ... }]
```

***

### detectVersion()

> **detectVersion**(`raw`): [`TelecomVersion`](#telecomversion)

Peek the version stamp of a raw Telecom message without trusting the rest of
the header layout.

D.0 carries `"D0"` in the Version/Release field at offset 6; F6 (which widens
the leading identification field) carries `"F6"` at offset 8. Both candidate
positions are checked. Anything else is `"unsupported"`: the offsets cannot be
trusted, so the caller refuses rather than guesses.

#### Parameters

##### raw

`string`

The raw message text.

#### Returns

[`TelecomVersion`](#telecomversion)

The [TelecomVersion](#telecomversion) classification.

#### Example

```ts
detectVersion("123456D0B1…").kind; // "d0"
```

***

### dispositionOf()

> **dispositionOf**(`kind`): [`ResponseDisposition`](#responsedisposition)

Map a response body kind to its disposition. The mapping is total and
one-directional: an [ErrorBody](#errorbody) is **always** `"error"`.

#### Parameters

##### kind

[`ResponseKind`](#responsekind)

The response body kind.

#### Returns

[`ResponseDisposition`](#responsedisposition)

The disposition.

#### Example

```ts
dispositionOf("Error"); // "error"
```

***

### error()

> **error**(`message`): [`ErrorBody`](#errorbody) \| `undefined`

Convenience accessor: the `<Error>` (negative-acknowledgment) body of a
message, or `undefined`. An Error is never read as a success.

#### Parameters

##### message

[`ScriptMessage`](#scriptmessage)

A parsed [ScriptMessage](#scriptmessage).

#### Returns

[`ErrorBody`](#errorbody) \| `undefined`

The Error body, or `undefined` when the message is not an Error.

#### Example

```ts
error(parseScript(xml))?.code;
```

***

### extractStructuredSig()

> **extractStructuredSig**(`medEl`, `path`, `warnings`): [`StructuredSig`](#structuredsig) \| `undefined`

Decode a structured SCRIPT `<Sig>` element into a [StructuredSig](#structuredsig), or
return `undefined` when no `<Sig>` is present under `medEl`.

Lenient and lossy by construction: every component is read independently and
tagged with its provenance; unrecoverable ambiguity downgrades a field to
`"absent"` and warns rather than guessing. The free-text `<SigText>` is always
preserved verbatim. Raises "../common/warnings".SCRIPT\_WARNING\_CODES.SIG\_STRUCTURED\_LOSSY
once when any structured component is decoded.

#### Parameters

##### medEl

[`XmlElement`](#xmlelement)

The `<MedicationPrescribed>` (or equivalent) element.

##### path

`string`

XPath-style location of `medEl` (for warning context).

##### warnings

[`NcpdpScriptWarning`](#ncpdpscriptwarning)[]

Sink that collects non-fatal warnings.

#### Returns

[`StructuredSig`](#structuredsig) \| `undefined`

A frozen [StructuredSig](#structuredsig), or `undefined` when no `<Sig>` exists.

#### Example

```ts
const warnings: NcpdpScriptWarning[] = [];
const sig = extractStructuredSig(medEl, "/Message/Body/NewRx/MedicationPrescribed", warnings);
sig?.sigText;        // verbatim free text: the source of truth
sig?.route.code?.system; // "SNOMED" when the route was coded
```

***

### fieldValue()

> **fieldValue**(`segment`, `fieldId`): `string` \| `undefined`

Read the verbatim value of the first field with a given id within a segment.

#### Parameters

##### segment

[`TelecomSegment`](#telecomsegment) \| `undefined`

The segment to read, or `undefined`.

##### fieldId

`string`

The 2-character field id, e.g. `"D7"`.

#### Returns

`string` \| `undefined`

The field value, or `undefined` when the segment or field is absent.

#### Example

```ts
fieldValue(findSegment(t.segments, "07"), "D7"); // the Product/Service ID
```

***

### findSegment()

> **findSegment**(`segments`, `code`): [`TelecomSegment`](#telecomsegment) \| `undefined`

Find the first segment with a given identification code.

#### Parameters

##### segments

readonly [`TelecomSegment`](#telecomsegment)[]

The decoded segments.

##### code

`string`

The 2-character Segment Identification code, e.g. `"07"`.

#### Returns

[`TelecomSegment`](#telecomsegment) \| `undefined`

The first matching segment, or `undefined`.

#### Example

```ts
findSegment(t.segments, "07")?.name; // "Claim"
```

***

### getDefaultProfile()

> **getDefaultProfile**(): [`NcpdpProfile`](#ncpdpprofile) \| `undefined`

Return the current default profile, or `undefined` if none is registered.

#### Returns

[`NcpdpProfile`](#ncpdpprofile) \| `undefined`

#### Example

```ts
import { getDefaultProfile } from "@cosyte/ncpdp/profiles";
const p = getDefaultProfile();
if (p !== undefined) console.log("default profile:", p.name);
```

***

### impliedThreeDecimal()

> **impliedThreeDecimal**(`digits`): `string` \| `undefined`

Apply the NCPDP implied 3-place decimal to an integer digit string, string-wise
(never via float). Returns `undefined` for non-digit input.

#### Parameters

##### digits

`string`

The verbatim integer string from the wire.

#### Returns

`string` \| `undefined`

The value with a 3-place fraction, or `undefined` if not all digits.

#### Example

```ts
impliedThreeDecimal("30000"); // "30.000"
impliedThreeDecimal("5");     // "0.005"
```

***

### joinPath()

> **joinPath**(`parent`, `child`): `string`

Append a child step to an XPath-style location string.

#### Parameters

##### parent

`string`

The parent path, e.g. `/Message/Body`.

##### child

`string`

The child element name, e.g. `NewRx`.

#### Returns

`string`

The joined path, e.g. `/Message/Body/NewRx`.

#### Example

```ts
joinPath("/Message/Body", "NewRx"); // "/Message/Body/NewRx"
```

***

### ndcValue()

> **ndcValue**(`raw`): [`NdcValue`](#ndcvalue)

Classify an NDC string into a [NdcSegmentation](#ndcsegmentation) hint. Hyphenated forms
are matched by their digit groups; bare digit strings are classified by total
length. Anything else is `"unknown"`.

#### Parameters

##### raw

`string`

The NDC value as it appeared on the wire.

#### Returns

[`NdcValue`](#ndcvalue)

A frozen [NdcValue](#ndcvalue).

#### Example

```ts
ndcValue("0002-8215-01").segmentation; // "4-4-2"
ndcValue("00002821501").segmentation;  // "11-digit"
```

***

### newRx()

> **newRx**(`message`): [`NewRx`](#newrx) \| `undefined`

Convenience accessor: the [NewRx](#newrx) body of a message, or `undefined`.

#### Parameters

##### message

[`ScriptMessage`](#scriptmessage)

A parsed [ScriptMessage](#scriptmessage).

#### Returns

[`NewRx`](#newrx) \| `undefined`

The NewRx body, or `undefined` when the message is another transaction.

#### Example

```ts
const rx = newRx(parseScript(xml));
rx?.patient?.name?.lastName;
```

***

### parseScript()

> **parseScript**(`raw`, `options?`): [`ScriptMessage`](#scriptmessage)

Parse a raw NCPDP SCRIPT XML string into an immutable [ScriptMessage](#scriptmessage).

Liberal on input (Postel's Law): recoverable anomalies become warnings with
stable codes and XPath context. Fatal only for unrecoverable structure:
empty input, non-XML / entity-bearing input, a non-`<Message>` root, or a
pre-XML legacy SCRIPT version.

#### Parameters

##### raw

`string`

The raw SCRIPT XML.

##### options?

[`ParseScriptOptions`](#parsescriptoptions)

Optional [ParseScriptOptions](#parsescriptoptions).

#### Returns

[`ScriptMessage`](#scriptmessage)

The parsed [ScriptMessage](#scriptmessage).

#### Throws

On unrecoverable structural problems.

#### Example

```ts
const msg = parseScript("<Message version='2017071'>…</Message>");
msg.asNewRx()?.medication?.description;
```

***

### parseTelecom()

> **parseTelecom**(`raw`, `opts?`): [`TelecomTransaction`](#telecomtransaction)

Parse a raw NCPDP Telecommunication-standard transmission into a frozen
[TelecomTransaction](#telecomtransaction). Lenient by contract: anything recoverable becomes a
warning and the underlying bytes are preserved. Only structurally unrecoverable
input throws [NcpdpTelecomParseError](#ncpdptelecomparseerror) with a Telecom fatal code.

**Every** group-separated transaction is decoded, request and response alike,
each into its own entry on `transactions` with its own segments and warnings; a
malformed one costs only itself. The declared Transaction Count is surfaced
verbatim beside the number decoded and no maximum is enforced.

#### Parameters

##### raw

`string` \| `Buffer`\<`ArrayBufferLike`\>

The raw message as a string or Buffer.

##### opts?

[`TelecomParseOptions`](#telecomparseoptions)

Optional [TelecomParseOptions](#telecomparseoptions).

#### Returns

[`TelecomTransaction`](#telecomtransaction)

The decoded transmission.

#### Throws

NcpdpTelecomParseError on empty input, a missing fixed header,
  unframeable body bytes, or an untrusted version layout.

#### Example

```ts
const t = parseTelecom(rawClaim);
t.header.transactionCode;      // "B1"
t.transactions.length;         // every transaction the transmission carried
t.transactionCount;            // "3": what the header declared, verbatim
t.decodedTransactionCount;     // 3: what actually decoded
t.transactions[2]?.segments;   // the third transaction's segments
```

***

### partitionWarnings()

> **partitionWarnings**\<`W`\>(`warnings`, `profile`): [`NcpdpWarningPartition`](#ncpdpwarningpartition)\<`W`\>

Split a parse's warnings against a profile's expected-warning union. A
warning whose `code` is in the profile's `expectedWarnings` lands in
`expected`; everything else lands in `unexpected`. Order within each bucket
preserves the input order.

#### Type Parameters

##### W

`W` *extends* `object`

#### Parameters

##### warnings

readonly `W`[]

##### profile

[`NcpdpProfile`](#ncpdpprofile)

#### Returns

[`NcpdpWarningPartition`](#ncpdpwarningpartition)\<`W`\>

#### Example

```ts
import { parseTelecom } from "@cosyte/ncpdp/telecom";
import { partitionWarnings, profiles } from "@cosyte/ncpdp/profiles";
const tx = parseTelecom(raw, { profile: profiles.pbm });
const { expected, unexpected } = partitionWarnings(tx.warnings, profiles.pbm);
if (unexpected.length > 0) flagForReview(unexpected);
```

***

### recognizeCodeSystem()

> **recognizeCodeSystem**(`qualifier`): [`CodeSystem`](#codesystem)

Recognize a normalized [CodeSystem](#codesystem) from a SCRIPT code qualifier.
Matching is case-insensitive; unrecognized qualifiers yield `"UNKNOWN"` (a
lenient default, never a throw).

#### Parameters

##### qualifier

`string`

The qualifier string accompanying a coded value.

#### Returns

[`CodeSystem`](#codesystem)

The normalized code system.

#### Example

```ts
recognizeCodeSystem("ND");     // "NDC"
recognizeCodeSystem("RxCUI");  // "RXNORM"
recognizeCodeSystem("zzz");    // "UNKNOWN"
```

***

### rxChangeRequest()

> **rxChangeRequest**(`message`): [`RxChangeRequest`](#rxchangerequest) \| `undefined`

Convenience accessor: the [RxChangeRequest](#rxchangerequest) body, or `undefined`.

#### Parameters

##### message

[`ScriptMessage`](#scriptmessage)

A parsed [ScriptMessage](#scriptmessage).

#### Returns

[`RxChangeRequest`](#rxchangerequest) \| `undefined`

The change-request body, or `undefined`.

#### Example

```ts
rxChangeRequest(parseScript(xml))?.medicationPrescribed?.description;
```

***

### rxChangeResponse()

> **rxChangeResponse**(`message`): [`RxChangeResponse`](#rxchangeresponse) \| `undefined`

Convenience accessor: the [RxChangeResponse](#rxchangeresponse) body, or `undefined`.

#### Parameters

##### message

[`ScriptMessage`](#scriptmessage)

A parsed [ScriptMessage](#scriptmessage).

#### Returns

[`RxChangeResponse`](#rxchangeresponse) \| `undefined`

The change-response body, or `undefined`.

#### Example

```ts
rxChangeResponse(parseScript(xml))?.outcome; // "approved" | "denied" | "validated" | …
```

***

### rxRenewalRequest()

> **rxRenewalRequest**(`message`): [`RxRenewalRequest`](#rxrenewalrequest) \| `undefined`

Convenience accessor: the [RxRenewalRequest](#rxrenewalrequest) body, or `undefined`.

#### Parameters

##### message

[`ScriptMessage`](#scriptmessage)

A parsed [ScriptMessage](#scriptmessage).

#### Returns

[`RxRenewalRequest`](#rxrenewalrequest) \| `undefined`

The renewal-request body, or `undefined`.

#### Example

```ts
rxRenewalRequest(parseScript(xml))?.medicationPrescribed?.description;
```

***

### rxRenewalResponse()

> **rxRenewalResponse**(`message`): [`RxRenewalResponse`](#rxrenewalresponse) \| `undefined`

Convenience accessor: the [RxRenewalResponse](#rxrenewalresponse) body, or `undefined`. Read
`.outcome` for the prescriber's decision: a denial never reads as an approval.

#### Parameters

##### message

[`ScriptMessage`](#scriptmessage)

A parsed [ScriptMessage](#scriptmessage).

#### Returns

[`RxRenewalResponse`](#rxrenewalresponse) \| `undefined`

The renewal-response body, or `undefined`.

#### Example

```ts
rxRenewalResponse(parseScript(xml))?.outcome; // "approved" | "denied" | …
```

***

### scriptPosition()

> **scriptPosition**(`path`): [`ScriptPosition`](#scriptposition)

Build a [ScriptPosition](#scriptposition) from an XPath-style location string.

#### Parameters

##### path

`string`

XPath-style location, e.g. `/Message/Header/To`.

#### Returns

[`ScriptPosition`](#scriptposition)

A frozen positional context.

#### Example

```ts
const pos = scriptPosition("/Message/Body/NewRx/Patient");
pos.path; // "/Message/Body/NewRx/Patient"
```

***

### scriptWarning()

> **scriptWarning**(`code`, `position`): [`NcpdpScriptWarning`](#ncpdpscriptwarning)

Construct a frozen [NcpdpScriptWarning](#ncpdpscriptwarning) from a code and a position.

There is deliberately **no value parameter**. That absence is the whole
safety property: a factory that accepts a value grows interpolation sites,
and every parser in this family that leaked patient data into a log line did
so through one.

#### Parameters

##### code

[`ScriptWarningCode`](#scriptwarningcode)

The stable warning code, which selects the message.

##### position

[`ScriptPosition`](#scriptposition)

XPath-style location of the condition.

#### Returns

[`NcpdpScriptWarning`](#ncpdpscriptwarning)

A frozen warning.

#### Example

```ts
scriptWarning(SCRIPT_WARNING_CODES.VERSION_ABSENT, scriptPosition("/Message"));
```

***

### serializeScript()

> **serializeScript**(`message`): `string`

Serialize a parsed [ScriptMessage](#scriptmessage) back to canonical NCPDP SCRIPT XML.
The conservative (emit) half of Postel's Law: it walks the model faithfully and
never warns. Only the **modeled** fields are emitted: SCRIPT is a lossy
structural read, so a value the parser does not surface cannot be reproduced;
this is the honest round-trip contract.

The output is **canonical**, not byte-identical to the input: namespace
prefixes and wrapper elements the parser flattens (e.g. `<HumanPatient>`) are
dropped, and indentation is normalized. Serializing is idempotent:
`serialize(parse(serialize(m)))` equals `serialize(m)`. Values are XML-escaped;
because the XXE-safe loader does not resolve entities, a value carrying a raw
`<`, `>`, or `&` survives only when it was entity-free to begin with (the
synthetic corpus is).

A message whose body is a transaction this library does not model
(`message.body.kind === "unsupported"`) is **refused**, not emitted: nothing
under such a transaction is modeled, so any document written for it would be a
well-formed one with the transaction body deleted. Branch on
`message.body.kind` before serializing, and relay the original bytes for a
transaction this library does not model.

#### Parameters

##### message

[`ScriptMessage`](#scriptmessage)

A parsed message from "./parse".parseScript.

#### Returns

`string`

The canonical SCRIPT XML string.

#### Throws

NcpdpScriptBuildError with
  "../common/errors".SCRIPT\_BUILD\_CODES.UNSUPPORTED\_TRANSACTION when the
  body is a transaction this library does not model. No string is returned.

#### Example

```ts
import { parseScript, serializeScript } from "@cosyte/ncpdp/script";
const xml = serializeScript(parseScript(raw));
parseScript(xml); // re-parses cleanly
```

***

### serializeTelecom()

> **serializeTelecom**(`transaction`): `string`

Serialize a [TelecomTransaction](#telecomtransaction) back to its canonical NCPDP
Telecommunication vD.0 wire form. The conservative (emit) half of Postel's Law:
it walks the model faithfully and never warns: a model produced by
"./parse".parseTelecom or "./builder".buildTelecomRequest is
trusted as valid by construction.

The output is **canonical**, not byte-identical to a quirky input: header
fields are re-padded to their fixed widths and segments are re-joined with
single FS/GS/RS control characters. Serializing is idempotent:
`serialize(parse(serialize(t)))` equals `serialize(t)`, which is the
round-trip contract this library guarantees (a normalizing serializer cannot
reproduce arbitrary whitespace or duplicate separators).

A request emits the 56-byte fixed header immediately followed by the framed
body; a response emits the fixed response header, a Group Separator, then the
RS-framed segment body.

**Emit is one transaction per transmission, and says so.** The reader decodes
every group-separated transaction a message carries, but multi-transaction emit
is not built: rather than write the first transaction and silently drop the
rest, a model carrying more than one decoded transaction is **refused** with
`NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT`. Serialize one transaction at a
time (each `transactions[n]` carries its own segments) if you need wire output
for a later transaction.

#### Parameters

##### transaction

[`TelecomTransaction`](#telecomtransaction)

A transmission from `parseTelecom` or `buildTelecomRequest`.

#### Returns

`string`

The canonical wire string.

#### Throws

NcpdpTelecomBuildError when the model carries more than one decoded
  transaction, which this serializer cannot express without dropping data.

#### Example

```ts
import { parseTelecom, serializeTelecom } from "@cosyte/ncpdp/telecom";
const wire = serializeTelecom(parseTelecom(raw));
parseTelecom(wire); // re-parses cleanly
```

***

### setDefaultProfile()

> **setDefaultProfile**(`profile`): `void`

Register a process-scoped default profile. `parseScript(raw)` /
`parseTelecom(raw)` (no explicit profile arg) consult `getDefaultProfile()`
and attach the returned profile to the result. Pass `null` (or `undefined`)
to clear.

The default is held once per entry point, because each entry point
(`@cosyte/ncpdp` and each subpath) is its own bundle. Only the package root
exports both this function and a parser, so import them together from
`@cosyte/ncpdp`. `@cosyte/ncpdp/script` and `@cosyte/ncpdp/telecom` do not
export this function, and a default set through `@cosyte/ncpdp/profiles`
reaches no parser. With a parser imported from a subpath, pass `{ profile }`
on each call instead.

Explicit args ALWAYS win: `parseTelecom(raw, { profile: myProfile })` uses
`myProfile` regardless of the default; `parseTelecom(raw, { profile: null })`
opts out of the default for a single call without changing the registered
default.

**Test hygiene:** the only mutable module-scoped state in the library. Tests
that call this MUST clean up in `afterEach` (`setDefaultProfile(null)`).

#### Parameters

##### profile

[`NcpdpProfile`](#ncpdpprofile) \| `null`

#### Returns

`void`

#### Example

```ts
import { setDefaultProfile, getDefaultProfile, parseTelecom, profiles } from "@cosyte/ncpdp";
setDefaultProfile(profiles.pbm);
const tx = parseTelecom(raw);
tx.profile?.name; // "pbm"
setDefaultProfile(null); // clear (or in test teardown)
```

***

### splitWithOffsets()

> **splitWithOffsets**(`s`, `sep`, `base`): `Part`[]

Split a string on a single-character separator, carrying each piece's absolute
byte offset. Empty pieces are retained (the caller decides whether to drop the
leading empty that a leading separator produces).

#### Parameters

##### s

`string`

The string to split.

##### sep

`string`

The single-character separator.

##### base

`number`

The absolute offset of `s[0]` in the original message.

#### Returns

`Part`[]

The pieces with their absolute offsets.

#### Example

```ts
splitWithOffsets("\x1cD7123", "\x1c", 56);
// [{ text: "", offset: 56 }, { text: "D7123", offset: 57 }]
```

***

### status()

> **status**(`message`): [`StatusBody`](#statusbody) \| `undefined`

Convenience accessor: the `<Status>` (positive-acknowledgment) body of a
message, or `undefined`.

#### Parameters

##### message

[`ScriptMessage`](#scriptmessage)

A parsed [ScriptMessage](#scriptmessage).

#### Returns

[`StatusBody`](#statusbody) \| `undefined`

The Status body, or `undefined` when the message is not a Status.

#### Example

```ts
status(parseScript(xml))?.code;
```

***

### telecomPosition()

> **telecomPosition**(`byteOffset`, `fieldId?`): [`TelecomPosition`](#telecomposition)

Build a [TelecomPosition](#telecomposition) from a byte offset and an optional field id.

#### Parameters

##### byteOffset

`number`

Zero-based byte offset into the raw message.

##### fieldId?

`string`

The 2-character field identifier in scope, if any.

#### Returns

[`TelecomPosition`](#telecomposition)

A frozen positional context.

#### Example

```ts
telecomPosition(56).byteOffset;          // 56
telecomPosition(72, "D7").fieldId;       // "D7"
```

***

### telecomQuantity()

> **telecomQuantity**(`source`): [`TelecomQuantity`](#telecomquantity)

Wrap a verbatim Quantity Dispensed value as a [TelecomQuantity](#telecomquantity), applying
the implied 3-place decimal string-wise when the value is all digits.

#### Parameters

##### source

`string`

The quantity exactly as it appeared on the wire.

#### Returns

[`TelecomQuantity`](#telecomquantity)

A frozen [TelecomQuantity](#telecomquantity).

#### Example

```ts
telecomQuantity("30000").impliedDecimal; // "30.000"
```

***

### telecomWarning()

> **telecomWarning**(`code`, `position`): [`NcpdpTelecomWarning`](#ncpdptelecomwarning)

Construct a frozen [NcpdpTelecomWarning](#ncpdptelecomwarning) from a code and a position.

There is deliberately **no value parameter**. That absence is the whole safety
property: a factory that accepts a value grows interpolation sites, and every
parser in this family that leaked patient data into a log line did so through
one.

#### Parameters

##### code

[`TelecomWarningCode`](#telecomwarningcode)

The stable warning code, which selects the message.

##### position

[`TelecomPosition`](#telecomposition)

Byte-offset location of the condition.

#### Returns

[`NcpdpTelecomWarning`](#ncpdptelecomwarning)

A frozen warning.

#### Example

```ts
telecomWarning(TELECOM_WARNING_CODES.UNKNOWN_SEGMENT, telecomPosition(56, "AM"));
```

***

### toDate()

> **toDate**(`value`, `options?`): `Date` \| `undefined`

Turn a parsed date into an absolute instant, ONLY when the caller supplies the
zone.

No wire form this package decodes carries a UTC offset, so the zone is never
determinate on its own: with no `assumeOffsetMinutes` the answer is
`undefined`. The host machine's timezone is never read and UTC is never
assumed. That is the point of the refusal rather than a limitation of it: a
date of birth resolved to a guessed zone is a day out in every
negative-offset zone, and nothing throws to say so.

The value's own precision is unchanged by the call. The time of day is filled
to midnight for instant construction only, and a later [toObject](#toobject) or
[toISO](#toiso) on the same value answers exactly what it answered before.

Returns `undefined` for `undefined`, for `null`, for a value stating no usable
components, for a value whose components do not name a real calendar day, for
a non-finite offset, and for an offset that pushes the instant outside the
range a `Date` can represent. Never throws, for any input, and never rolls an
impossible day over into the following month. Never an `Invalid Date` either:
a partial answer wearing the shape of an instant is the one shape a caller
cannot tell from a real one.

#### Parameters

##### value

[`DateValue`](#datevalue) \| `null` \| `undefined`

A parsed date from "./date".dateValue.

##### options?

[`ToDateOptions`](#todateoptions)

The zone to assume; see [ToDateOptions](#todateoptions).

#### Returns

`Date` \| `undefined`

The instant, or `undefined` when no determinate zone was supplied.

#### Example

```ts
toDate(dateValue("19880705"));                            // undefined: no zone
toDate(dateValue("19880705"), { assumeOffsetMinutes: 0 }); // 1988-07-05T00:00:00.000Z
```

***

### toISO()

> **toISO**(`value`): `string` \| `undefined`

Render a parsed date as ISO-8601, truncated to the precision it stated.

The one decoded wire form is a whole calendar day, so the rendering is always
`YYYY-MM-DD` and NOTHING is appended: the value carries no UTC offset, so no
`Z` is fabricated and the string is deliberately zone-less. A year below 1000
is zero-padded to four digits and stays the year it is.

Returns `undefined` for `undefined`, for `null`, for a value stating no
usable components at all, and for a value whose components do not name a real
calendar day: the string this returns always names a day that exists, so it
reads back as itself rather than being silently moved. Never throws, for any
input.

#### Parameters

##### value

[`DateValue`](#datevalue) \| `null` \| `undefined`

A parsed date from "./date".dateValue.

#### Returns

`string` \| `undefined`

The ISO-8601 rendering, or `undefined`.

#### Example

```ts
toISO(dateValue("19880705")); // "1988-07-05"
toISO(dateValue("00500101")); // "0050-01-01"
// Never "2024-02-30", which every ISO-8601 reader reads back as 1 March:
toISO({ source: "20240230", year: 2024, month: 2, day: 30 }); // undefined
```

***

### tokenizeBody()

> **tokenizeBody**(`body`, `base`, `warnings`): [`TelecomSegment`](#telecomsegment)[]

Tokenize the variable body of a Telecom transmission into the segments of its
**first** group-separated transaction, pushing that transaction's warnings into
the supplied sink.

This is the single-transaction view of [tokenizeTransactions](#tokenizetransactions), kept for
callers that hold one transaction's worth of body. A transmission may carry
more than one transaction, and this function reads only the first, so
`tokenizeTransactions` (or `parseTelecom`, which uses it) is the route that
reads them all.

It says **nothing** about the transactions it did not read: the sink receives
the first transaction's warnings and no others, and no warning is raised to
report the ones past it. Hand a multi-transaction body to this function and
the answer is a partial one that looks whole, so reach for
`tokenizeTransactions` whenever the body might carry more than one.

#### Parameters

##### body

`string`

The raw message body (the portion after the fixed header).

##### base

`number`

The absolute offset of `body[0]` in the raw message.

##### warnings

[`NcpdpTelecomWarning`](#ncpdptelecomwarning)[]

Sink that collects non-fatal warnings.

#### Returns

[`TelecomSegment`](#telecomsegment)[]

The decoded segments of the first transaction, in wire order.

#### Example

```ts
const warnings: NcpdpTelecomWarning[] = [];
const segs = tokenizeBody("\x1cAM07\x1cD2RX1", 56, warnings);
segs[0]?.segmentId; // "07"
```

***

### tokenizeTransactions()

> **tokenizeTransactions**(`body`, `base`): [`TelecomDecodedTransaction`](#telecomdecodedtransaction)[]

Tokenize the variable body of a Telecom transmission (everything after the
fixed header) into **every** group-separated transaction it carries, in wire
order. Within a transaction, segments are segment-separator delimited and
fields are field-separator delimited; the first field of each segment is the
Segment Identification (`AM`).

Each transaction is decoded independently, into its own segment list and its
own warning sink, so a malformed transaction cannot cost the transmission the
transactions that decoded around it. No maximum is enforced: this reader has
no citable authority for one, so it reports what it decoded and never refuses
a count (see "./warnings".TELECOM\_WARNING\_CODES.TRANSACTION\_COUNT\_MISMATCH).

#### Parameters

##### body

`string`

The raw message body (the portion after the fixed header).

##### base

`number`

The absolute offset of `body[0]` in the raw message.

#### Returns

[`TelecomDecodedTransaction`](#telecomdecodedtransaction)[]

One [TelecomDecodedTransaction](#telecomdecodedtransaction) per transaction, in wire order.

#### Example

```ts
import { tokenizeTransactions } from "@cosyte/ncpdp/telecom";
const decoded = tokenizeTransactions("AM07\x1cD2RX1\x1dAM04", 56);
decoded.length;                 // 2: both transactions decoded
decoded[1]?.segments[0]?.segmentId; // "04"
```

***

### toObject()

> **toObject**(`value`): [`DateParts`](#dateparts) \| `undefined`

Read the calendar components a parsed date stated, as a frozen plain object.

Returns `undefined` for `undefined`, for `null`, for a value stating no
usable components at all, and for a value whose components do not name a real
calendar day (February 30, month 13, day 0). Never throws, for any input.

#### Parameters

##### value

[`DateValue`](#datevalue) \| `null` \| `undefined`

A parsed date from "./date".dateValue.

#### Returns

[`DateParts`](#dateparts) \| `undefined`

The stated components, or `undefined`.

#### Example

```ts
toObject(dateValue("19880705")); // { year: 1988, month: 7, day: 5 }
toObject(undefined);             // undefined
// A hand-built value is bound by the same calendar rule as a wire string:
toObject({ source: "20240230", year: 2024, month: 2, day: 30 }); // undefined
```

***

### undecodedHeader()

> **undecodedHeader**(`versionStamp`): [`TelecomHeader`](#telecomheader)

A minimal header for a recognized-but-undecoded version (F6): the version
stamp is surfaced and every positional field is left empty, since the layout
differs from D.0 and decoding it here would misalign safety-critical fields.

#### Parameters

##### versionStamp

`string`

The recognized version stamp, e.g. `"F6"`.

#### Returns

[`TelecomHeader`](#telecomheader)

A frozen [TelecomHeader](#telecomheader) with only `versionRelease` populated.

#### Example

```ts
undecodedHeader("F6").versionRelease; // "F6"
```

***

### verify()

> **verify**(`message`): [`VerifyBody`](#verifybody) \| `undefined`

Convenience accessor: the `<Verify>` (verification-acknowledgment) body of a
message, or `undefined`.

#### Parameters

##### message

[`ScriptMessage`](#scriptmessage)

A parsed [ScriptMessage](#scriptmessage).

#### Returns

[`VerifyBody`](#verifybody) \| `undefined`

The Verify body, or `undefined` when the message is not a Verify.

#### Example

```ts
verify(parseScript(xml))?.code;
```

## References

### profiles

Re-exports [profiles](ncpdp/profiles.md#profiles)

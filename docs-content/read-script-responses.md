---
id: read-script-responses
title: Read a SCRIPT response
sidebar_label: Read a SCRIPT response
description: "Read a Status, Error, or Verify acknowledgment, match it to the request it answers, and never read an Error as a success."
---

# Read a SCRIPT response

Every SCRIPT transaction is answered with a `<Status>`, an `<Error>`, or a `<Verify>`. Read the
message with `parseScript`, branch on `msg.disposition`, and read the body with `status`, `error`,
or `verify`. Each accessor returns `undefined` unless the body is its own kind.

```ts runnable
import { error, parseScript, status } from "@cosyte/ncpdp/script";

const xml = `<Message version="2017071">
  <Header>
    <MessageID>SYNTH-MSG-0003</MessageID>
    <RelatesToMessageID>SYNTH-MSG-0002</RelatesToMessageID>
  </Header>
  <Body><Error>
    <Code>900</Code>
    <Description>Prescriber identifier could not be validated.</Description>
  </Error></Body>
</Message>`;

const msg = parseScript(xml);

msg.disposition; // => "error"
msg.correlatesTo; // => "SYNTH-MSG-0002"

error(msg)?.code; // => "900"
error(msg)?.description; // => "Prescriber identifier could not be validated."
status(msg); // => undefined
```

- **`disposition`** is `"success"` for a Status, `"error"` for an Error, `"verify"` for a Verify,
  and `undefined` for a message that is not a response. It is derived only from which body element
  is present, so an `<Error>` can never read as a success.
- **`correlatesTo`** is the `<RelatesToMessageID>` of the header, verbatim: the `MessageID` of the
  request this answers.
- **Codes and descriptions are verbatim.** `code`, `descriptionCode`, and `description` are read as
  they arrived. We ship no table of what a response code means.

## When a message carries more than one answer

A malformed message can carry two response bodies. The disposition then takes the most conservative
one, Error first, and the message is warned:

```ts runnable
import { parseScript } from "@cosyte/ncpdp/script";

const msg = parseScript(
  `<Message version="2017071"><Body><Status><Code>000</Code></Status><Error><Code>900</Code></Error></Body></Message>`,
);

msg.disposition; // => "error"
msg.warnings.map((w) => w.code); // => ["NCPDP_SCRIPT_RESPONSE_AMBIGUOUS_DISPOSITION"]
```

Reference: [`parseScript`](./api/@cosyte/ncpdp.md#parsescript),
[`status`](./api/@cosyte/ncpdp.md#status-1), [`error`](./api/@cosyte/ncpdp.md#error),
[`verify`](./api/@cosyte/ncpdp.md#verify), and
[`dispositionOf`](./api/@cosyte/ncpdp.md#dispositionof).

## Next

- [Read renewals, changes, and cancels](./read-renewals-changes-and-cancels.md): the lifecycle
  responses, which carry an approval or a denial rather than a Status.
- [Build and serialize messages](./build-and-serialize-messages.md): write a Status, Error, or Verify
  of your own with `buildScriptResponse`.
- [How the parser reads safely](./fail-safe-reading.md): the fail-safe rules this page relies on.

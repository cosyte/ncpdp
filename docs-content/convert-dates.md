---
id: convert-dates
title: Convert a date without inventing a timezone
sidebar_label: Convert dates
description: "Turn a CCYYMMDD date field into parts, an ISO string, or a JavaScript Date, with the timezone always supplied by you and never guessed."
---

# Convert a date without inventing a timezone

Parsed date fields are verbatim strings, and they stay that way. `dateValue` decodes one into a
value; `toObject`, `toISO`, and `toDate` read that value. The three names are the same in every
`@cosyte/*` parser, so a file that imports two parsers aliases them (`toISO as ncpdpToISO`) or
imports each package as a namespace.

```ts runnable
import { dateValue, toDate, toISO, toObject } from "@cosyte/ncpdp/common";

const dob = dateValue("19850722"); // Date of Birth (304-C4), CCYYMMDD

toObject(dob); // => { year: 1985, month: 7, day: 22 }
toISO(dob); // => "1985-07-22"

toDate(dob); // => undefined
toDate(dob, { assumeOffsetMinutes: 0 })?.toISOString(); // => "1985-07-22T00:00:00.000Z"
toDate(dob, { assumeOffsetMinutes: -300 })?.toISOString(); // => "1985-07-22T05:00:00.000Z"

dateValue("19880732"); // => undefined
dateValue("1985-07-22"); // => undefined

// A day the calendar does not have is refused on the value route too, not just the wire route.
const feb30 = { source: "20240230", year: 2024, month: 2, day: 30 };

toISO(feb30); // => undefined
toDate(feb30, { assumeOffsetMinutes: 0 }); // => undefined
```

- **`toDate` returns `undefined` unless you supply the zone.** No form decoded here carries a UTC
  offset, so the zone is never determinate on its own: the host machine's timezone is never read
  and UTC is never assumed. Pass `assumeOffsetMinutes` (an explicit `0` means "treat this naive
  value as UTC") or get nothing back. A date of birth resolved in a guessed zone lands on the
  previous day in every negative-offset zone, silently.
- **One wire form is decoded, `CCYYMMDD`,** the only date form this package declares: Date of
  Service (401-D1) and Date of Birth (304-C4). Other date-bearing fields (SCRIPT `<SentTime>`,
  `<DateOfBirth>`, and `<WrittenDate>`; Telecom 443-E8 and 530-FU) are carried verbatim with no form
  stated, so `dateValue` answers `undefined` for them rather than guessing one. The fields
  themselves are unchanged and still readable.
- **A day the calendar does not have is refused, never rolled over.** `DateValue` is an exported
  interface, so a value you build or spread yourself reaches the conversions without passing
  `dateValue`; it is held to the same leap-year rule, so both routes answer alike for the same eight
  digits. `toISO` never renders `2024-02-30`, which an ISO 8601 reader reads back as 1 March, and
  `toDate` never returns a day in the following month.
- **Nothing is rewritten and nothing is zero-filled.** `toObject` reports only the components the
  value stated, `toISO` truncates to that precision and appends no `Z`, and the parsed model still
  carries the wire string.

Reference: [`dateValue`](./api/@cosyte/ncpdp.md#datevalue-1),
[`toObject`](./api/@cosyte/ncpdp.md#toobject), [`toISO`](./api/@cosyte/ncpdp.md#toiso), and
[`toDate`](./api/@cosyte/ncpdp.md#todate).

## Next

- [Read a Telecom claim](./read-a-telecom-claim.md): where Date of Service and Date of Birth come
  from.
- [Telecom foundation and B1](./spec-notes-telecom.md): the header layout that positions Date of
  Service.

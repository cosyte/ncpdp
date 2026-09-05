---
"@cosyte/ncpdp": minor
---

Parsed NCPDP dates can now be read as calendar parts, as ISO-8601 or as an instant, through the same
three names every `@cosyte/*` parser uses, and none of them ever guesses a timezone.

`dateValue` decodes a wire date string into a value; `toObject`, `toISO` and `toDate` read that
value. `toObject` returns only the components the value stated, with a spec-native month of 1 to 12,
so `Object.keys()` recovers its precision and the result feeds `Temporal.PlainDate.from` or luxon's
`DateTime.fromObject` unchanged. `toISO` truncates to that precision and appends nothing. `toDate`
returns an absolute instant only when the zone is determinate: no form decoded here carries a UTC
offset, so without an `assumeOffsetMinutes` option the answer is `undefined`, the host machine's
timezone is never read and UTC is never assumed. Passing an explicit `0` means "treat this naive
value as UTC". The refusal is the feature: a date of birth resolved to a guessed zone lands on the
previous day in every negative-offset zone and nothing throws to say so.

One wire form is decoded, `CCYYMMDD`, and that boundary is deliberate. It is the only date form this
package declares, on Date of Service (401-D1) in the Transaction Header and on Date of Birth
(304-C4) in the Patient segment. Every other date-bearing or time-bearing field is carried verbatim
with no form stated for it, including the SCRIPT `SentTime`, `DateOfBirth` and `WrittenDate` values
and the Telecom Other Payer Date (443-E8) and Previous Date Of Fill (530-FU) values, so `dateValue`
answers `undefined` for those rather than decoding them from a document this package does not
redistribute or cite.

A day the calendar does not have is refused rather than rolled over, and on both routes into the
surface. `dateValue("20240230")` is `undefined`, and so is a `DateValue` a caller builds or spreads
carrying the same components: the conversions apply the same 4/100/400 leap rule the decoder
applies, so `toISO` never renders `2024-02-30`, which every ISO-8601 reader reads back as 1 March,
and `toDate` never rolls an impossible day into the following month. That matters most on the two
fields this package decodes, Date of Birth (304-C4) and Date of Service (401-D1), where a silent
one-day shift is the worst answer available.

Nothing existing moved. Every date-bearing field on every parsed structure is still the verbatim
string it was, the conversions are opt-in, seven names are added and none is changed or removed, and
no dependency of any kind was added.

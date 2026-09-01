---
id: conformance
title: "Conformance statement"
sidebar_label: Conformance
description: "What this package decodes on each wire format, the public section adopting it, when that adoption ends, and who has tested it."
---

# Conformance statement

**What `@cosyte/ncpdp` decodes, against which adopted version, and on what date that version
stops being the adopted one.** This page is the whole answer. It states, per wire format, the
version this package decodes, the section of public law that adopts that version, the date on
which that adoption ends, and whether any third party has tested this package.

It is also the only place in this repository where the decoded version set is written down as a
claim. Every other page defers to it, and `test/conformance-statement.test.ts` fails the build if
this page and the shipped constants disagree **in either direction**: a version the code decodes
and this page omits is a failure, and so is a version this page names and the code does not
decode.

Nothing here is a certification. Read [No third-party conformance record](#no-third-party-conformance-record)
before treating any of it as one.

## Why these facts are cited to regulation and not to the standard

The NCPDP Telecommunication Standard Implementation Guide and the NCPDP SCRIPT Standard
Implementation Guide are **purchased products**. This package holds no licence to reproduce them
and reproduces none of their prose, in code, in fixtures or here. Every version identifier and
every date below is therefore read out of United States federal regulation, which is public law
and can be cited freely:

- **45 CFR 170.205** for electronic prescribing (SCRIPT).
- **45 CFR 162.1102** for the retail pharmacy drug claim (Telecom `B1` / `B2` / `B3`).
- **45 CFR 162.1202** for the pharmacy eligibility inquiry (Telecom `E1`).

Sections are cited; standard prose is not quoted. Where a version this package decodes has no
public section adopting it, the row below reads `no public section found` rather than implying
one. Today no row needs that: every version this package decodes has a section.

## What is decoded, and until when

<!-- MACHINE-CHECKED. test/conformance-statement.test.ts derives the decoded set from the shipped
     constants (KNOWN_SCRIPT_VERSIONS, and the version stamps detectVersion classifies) and
     compares it against the rows below in both directions. Adding or retiring a decoded version
     without editing this table fails that test. Keep the six columns in this order:
     wire format | version | status | public section | adoption ends | third-party record. -->

| Wire format   | Version                                          | Status                  | Public section                                     | Adoption ends | Third-party record |
| ------------- | ------------------------------------------------ | ----------------------- | -------------------------------------------------- | ------------- | ------------------ |
| SCRIPT        | `2017071`                                        | decoded                 | 45 CFR 170.205(b)(1)                               | 2028-01-01    | none               |
| SCRIPT        | `2023011`                                        | decoded                 | 45 CFR 170.205(b)(2)                               | none stated   | none               |
| SCRIPT        | legacy dotted, for example `10.6`                | refused                 | not adopted by 45 CFR 170.205(b)                   | n/a           | none               |
| SCRIPT        | any other XML-era version, for example `2099001` | tolerated               | not adopted by 45 CFR 170.205(b)                   | n/a           | none               |
| Telecom       | `D0`                                             | decoded                 | 45 CFR 162.1102(b)(2)(i); 45 CFR 162.1202(b)(2)(i) | 2028-04-14    | none               |
| Telecom       | `F6`                                             | recognized, not decoded | 45 CFR 162.1102(e)(2)(i); 45 CFR 162.1202(d)(2)(i) | n/a           | none               |
| Telecom       | any other version stamp                          | refused                 | n/a                                                | n/a           | none               |
| Telecom Batch | `1.2` and `15`                                   | not decoded             | 45 CFR 162.1102(b)(2)(i); 45 CFR 162.1102(e)(2)(i) | n/a           | none               |

**Reading the status column.**

- **decoded**: the reader parses a message carrying this version against that version's field
  layout, and the modelled reads (`claim`, `adjudication`, `newRx`, the lifecycle and response
  projections) are available over it.
- **recognized, not decoded**: the stamp is identified where the reader looks for it, the parse
  succeeds, and no positional field is read. **This status is direction-dependent and the direction
  is not a detail**: `F6` is recognized in a request and refused in a response. See
  [F6: recognized in a request, refused in a response](#f6-recognized-in-a-request-refused-in-a-response).
- **tolerated**: the version string is present, is not one of the adopted versions above, and is
  not a pre-XML dotted version. The document is still parsed, against the same XML-era field model,
  and `NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED` is raised. Being lenient about an odd-but-present
  version string is not a claim that the field model is right for it, and nothing about that version
  is adopted by 45 CFR 170.205(b).
- **refused**: a typed fatal is thrown rather than a wrong field position returned.
  `NCPDP_SCRIPT_UNSUPPORTED_VERSION` for a pre-XML dotted SCRIPT version,
  `NCPDP_TELECOM_UNSUPPORTED_VERSION` for a Telecom stamp the reader does not recognize at the
  offset it read.
- **not decoded**: no implementation of that framing exists in this package at all. Batch is the
  only entry of this kind: `grep -ri batch src/` finds nothing, and that is deliberate rather than
  pending.

## The dates, and the sections that set them

- **SCRIPT `2017071` ends on 2028-01-01.** 45 CFR 170.205(b)(1) adopts that version and states
  that the Secretary's adoption of it expires on January 1, 2028. After that date the paragraph
  adopts `2023011` alone.
- **SCRIPT `2023011` has no stated end.** 45 CFR 170.205(b)(2) adopts it and sets no expiry, so
  this page records none rather than inventing one.
- **Telecom claims: 2027-08-14, then 2028-04-14.** 45 CFR 162.1102(c) makes the paragraph (b)(2)
  standards, which include D.0, the adopted retail pharmacy drug claim standards for the period
  from January 1, 2012 through August 14, 2027. That paragraph excepts one of them, the 1999
  Version 5.1 guide at (b)(2)(v)(A), which this package does not decode either. 45 CFR 162.1102(e)
  makes F6 and Batch 15 permissible alongside them from 2027-08-14 through 2028-04-14.
  45 CFR 162.1102(f) leaves only the paragraph (e)(2) standards adopted on and after 2028-04-14.
- **Telecom eligibility: the same two dates.** 45 CFR 162.1202(c), 45 CFR 162.1202(d) and
  45 CFR 162.1202(e) carry the same ladder for the `E1` eligibility inquiry, without that
  carve-out: D.0 through 2027-08-14, either option through 2028-04-14, and the paragraph (d)(2)
  standards alone on and after 2028-04-14.

**What that means for a consumer planning ahead.** The Telecom decode in this package has a dated
end, and it is not far off. D.0 is the expiring standard, not the standing one.

## F6: recognized in a request, refused in a response

A Telecom **request** transmission whose version stamp is `F6` is recognized and **not decoded**.
The F6 header widens the leading identification field, so reading it at D.0 offsets would misalign
safety-critical fields, and a wrong field position is a wrong dispense. The reader declines to do
that.

What a **request** carrying `F6` gets instead: the parse succeeds, `header.versionRelease` carries
the stamp, every other positional header field comes back empty, and the warning
`NCPDP_TELECOM_VF6_NOT_DECODED` is raised at the Version/Release position. **No transaction is
decoded**, and that is worth saying separately, because every group-separated transaction of a
decoded transmission is: on an `F6` request `decodedTransactionCount` is `0` and `transactions` is
empty however many transactions arrived on the wire, so the `segments` alias is empty with them.
Nothing is guessed and nothing is dropped; the original bytes are still yours to forward.

**An `F6` response transmission is refused today, not warned, and you should plan for that rather
than for a graceful degrade.** A response leads with its Version/Release at the first byte, where a
request leads with the routing identifier and carries the stamp further in. The reader treats a
transmission as a response only when that leading stamp is `D0`; anything else is read at the
request offsets, where a stamp sitting at the first byte is not visible. So a response stamped `F6`
raises the typed fatal `NCPDP_TELECOM_UNSUPPORTED_VERSION` and returns nothing to forward. That is
the same refusal the table gives any unrecognized stamp, and it is stated here because the response
leg is the one carrying adjudication money.

The gap is dated rather than open ended. 45 CFR 162.1102(e)(2)(i) names Version F6, January 2020
and Batch Version 15, October 2017, and 45 CFR 162.1102(f) leaves those two as the only adopted
retail pharmacy drug claim standards on and after **2028-04-14**. 45 CFR 162.1202(e) does the same
for the eligibility inquiry. From that date a claim on the wire is an F6 claim, and this package
does not decode it.

## No third-party conformance record

**For SCRIPT and for Telecom alike, no third party has tested this package.** There is no external
conformance record for either wire format. This section states that rather than leaving the
absence to be read as an endorsement, and two things that carry the word "certification" are worth
being precise about, because neither is a record about this software.

- **The NCPDP Certification Program certifies people, not systems.** It is an exam taken by an
  individual, and what it attests to is that individual. Someone who passes it earns a
  post-nominal designation for their own name and is sent an embossed certificate, a lapel pin
  and a congratulatory letter. No registry of certified organizations or certified systems is
  published (<https://www.ncpdp.org/Resources/NCPDP-Certification-Program-FAQs>). A search that
  finds the word "certification" here and stops has found the opposite of a conformance record.
- **The one software conformance instrument targets a version this package refuses.** ONC, NIST
  and NCPDP built an electronic conformance testing tool for the SCRIPT standard, and NCPDP took
  over its stewardship in August 2018. It tests SCRIPT v10.6
  (<https://www.healthit.gov/buzz-blog/health-it/a-new-home-for-the-electronic-prescribing-testing-tool>).
  A dotted legacy version such as `10.6` is exactly the shape this package refuses with a typed
  fatal, so even were the tool reachable it would test a version this library declines to parse.

## What stands in for an external oracle

There is no external oracle here, and these are the substitutes, stated so a reader can weigh them
rather than assume something stronger:

- A three-tier **synthetic** corpus: spec-clean, vendor-quirk, and round-trip goldens.
- The `@cosyte/test-utils` property invariants: lenient never-throw, round-trip, immutability and
  warning-code stability.
- A nightly amplified fuzz job over the Telecom byte tokenizer and the SCRIPT XML entity-expansion
  surface.
- Per-directory coverage gates.

There is deliberately **no differential corpus** against a third-party reference implementation,
and the reason is the licensing posture above rather than an oversight: such a corpus would
require redistributing NCPDP-derived material this package is not licensed to ship. The same
reasoning, and the rest of the do-not-over-trust list, is in
[KNOWN-LIMITATIONS.md](https://github.com/cosyte/ncpdp/blob/main/KNOWN-LIMITATIONS.md). Do not
assume byte-for-byte agreement with any specific vendor or switch implementation.

## When a decoded version is added or retired

This page is not maintained by remembering to maintain it. The decoded set in the table above is
compared, on every test run, against the constants the package actually ships:
`KNOWN_SCRIPT_VERSIONS` for SCRIPT and the version stamps `detectVersion` classifies for Telecom.
A change to either without a matching change here fails `test/conformance-statement.test.ts`, and
the failure names the version that disagrees.

What an `F6` message _does_ is derived the same way rather than described from memory: the test
parses one in each direction and requires this page to state the outcome it observed, per
direction. It also parses the same two-transaction body under each stamp and requires this page to
state how many transactions the `F6` request decoded, against a decoded control that shows the body
really carried more than one. A change that started decoding `F6` responses, that changed the code
they raise, or that started decoding an `F6` request's transactions, would red here until this page
said so.

The same test closes the citation set: a citation on this page that is not one of the three CFR
sections above, one of the two public URLs above, or a file in this repository fails it. It also
rejects the overclaim shapes this package must never make about itself. Each of those is proved by
a control in that test file, which is where they are enumerated, rather than written out here.

## Scope of this statement

Out of scope here, and named so the silence is not read as coverage:

- **Payer sheets, the External Code List, and reject-code vocabularies.** Those rest on documents
  this package cannot publicly read. What labels ship, and on what artifact, is in
  [KNOWN-LIMITATIONS.md](https://github.com/cosyte/ncpdp/blob/main/KNOWN-LIMITATIONS.md).
- **Any claim of certification, vendor parity or an external oracle.** See above.
- **Batch framing.** Named in the table as not decoded, and not added by this statement.

## Next

- [Troubleshooting and known limitations](./troubleshooting): the diagnostic codes the statuses above
  raise, and the rest of the do-not-over-trust list.
- [Telecom foundation and B1](./spec-notes-telecom): the layout the decoded stamp is read against.
- [Serializers and builders](./spec-notes-serialize-build): what emit writes back, and what it
  refuses to write.
- [Getting started](./intro): the package in one page, if you arrived here first.

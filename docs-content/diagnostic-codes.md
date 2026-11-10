---
id: diagnostic-codes
title: Diagnostic codes
sidebar_label: Diagnostic codes
description: "Every fatal, warning, and build code the package can raise, with what the reader or builder did when it raised it."
---

# Diagnostic codes

Every code below is a stable string exported from the package root in a frozen registry
(`SCRIPT_FATAL_CODES`, `SCRIPT_WARNING_CODES`, `SCRIPT_BUILD_CODES`, and the three `TELECOM_`
registries), each with its fixed message in the matching `_MESSAGES` registry. Renaming or removing
a code is a breaking change. A message never carries any part of the input.

- A **fatal** is thrown by a parser as `NcpdpScriptParseError` or `NcpdpTelecomParseError`, with the
  code on `.code`. Nothing is returned.
- A **warning** is collected on the result's `.warnings`, each with a `position`: an XPath for SCRIPT,
  a byte offset (and the field id, when there is one) for Telecom. The read went on.
- A **build code** is thrown by a builder or serializer as `NcpdpScriptBuildError` or
  `NcpdpTelecomBuildError`. Nothing is written.

## SCRIPT fatals

| Code                               | Thrown when                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `EMPTY_INPUT`                      | The input was empty or whitespace only.                                                                            |
| `NCPDP_SCRIPT_NOT_XML`             | The input did not parse as XML, or carried a `<!DOCTYPE>` or `<!ENTITY>` (the XXE boundary).                       |
| `NCPDP_SCRIPT_NO_MESSAGE_ROOT`     | The XML was well formed, but its root element is not `<Message>`.                                                  |
| `NCPDP_SCRIPT_UNSUPPORTED_VERSION` | The declared version predates the XML-era SCRIPT this package decodes ([Conformance statement](./conformance.md)). |

## Telecom fatals

| Code                                | Thrown when                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMPTY_INPUT`                       | The input was empty.                                                                                                                                                |
| `NCPDP_TELECOM_NO_HEADER`           | The transmission is too short to hold the fixed Transaction Header.                                                                                                 |
| `NCPDP_TELECOM_INVALID_FRAMING`     | A non-empty body carried no FS, GS, or RS framing bytes. A separator is never guessed.                                                                              |
| `NCPDP_TELECOM_UNSUPPORTED_VERSION` | The version stamp is not one this package recognizes at the offset it read ([Conformance statement](./conformance.md), which gives the outcome for each direction). |

## SCRIPT warnings

| Code                                          | What the reader did                                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NCPDP_SCRIPT_VERSION_ABSENT`                 | Found no version declared on the message and parsed it best-effort rather than refusing it.                                                        |
| `NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED`  | Read a version string it does not model, parsed the document against the same XML-era field model, and surfaced the string verbatim.               |
| `NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION`        | Met a transaction body it does not model and surfaced it as `unsupported`, naming the transaction only when its element name is one it recognizes. |
| `NCPDP_SCRIPT_MISSING_REQUIRED_ELEMENT`       | Left a required element of the detected transaction undefined rather than inventing a value to fill it.                                            |
| `NCPDP_SCRIPT_STRENGTH_CODED_AND_EXPLICIT`    | Found a coded drug and an explicit Strength together, surfaced both verbatim, and reconciled neither into a single answer.                         |
| `NCPDP_SCRIPT_RESPONSE_AMBIGUOUS_DISPOSITION` | Found more than one response body and reported the most conservative disposition, so a failure is never masked by a success beside it.             |
| `NCPDP_SCRIPT_LIFECYCLE_AMBIGUOUS_OUTCOME`    | Found more than one outcome on a lifecycle response and chose by fail-safe precedence, so a denial is never masked by an approval beside it.       |
| `NCPDP_SCRIPT_LIFECYCLE_OUTCOME_UNRECOGNIZED` | Found no recognized outcome on a lifecycle response and reported it as unknown rather than assuming an approval.                                   |
| `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY`           | Decoded a structured `<Sig>` into an additive, lossy view while the free-text `SigText` stayed authoritative and verbatim.                         |
| `NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE`             | Read a dose structure it could not resolve to one quantity and reported the dose as absent rather than guessing a number.                          |

## Telecom warnings

| Code                                       | What the reader did                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NCPDP_TELECOM_VF6_NOT_DECODED`            | Recognized the F6 stamp on a **request**, surfaced it on `header.versionRelease`, and read no positional field rather than read one at offsets it cannot trust. |
| `NCPDP_TELECOM_UNKNOWN_SEGMENT`            | Met a Segment Identification code it does not name, kept the segment and every field verbatim, and left only the paraphrased name absent.                       |
| `NCPDP_TELECOM_MALFORMED_FIELD`            | Met a field token too short to carry a 2-character identifier and kept it verbatim with an empty id rather than dropping the bytes.                             |
| `NCPDP_TELECOM_MISSING_SEGMENT_ID`         | Met a segment that did not begin with an `AM` field, kept its fields, and left the segment id empty because it could not be read where it belongs.              |
| `NCPDP_TELECOM_MALFORMED_SEGMENT_ID`       | Met an `AM` value that is not 2 characters, kept it in `segment.fields` verbatim, and did not promote it onto `segment.segmentId`.                              |
| `NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH` | Found that the declared Transaction Count and the number decoded disagree, kept every decoded transaction, and enforced no maximum.                             |
| `NCPDP_TELECOM_STATUS_CONFLICT`            | Found reject codes beside a status claiming payment and resolved the disposition to rejected, because a reject always wins.                                     |
| `NCPDP_TELECOM_UNKNOWN_REJECT_CODE`        | Kept a Reject Code it does not recognize verbatim, in wire order, with `known: false`, and dropped nothing.                                                     |
| `NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS`    | Kept a Transaction Response Status it does not model verbatim and read the disposition as unknown, never as paid.                                               |
| `NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH`    | Found that the declared ingredient count and the number decoded disagree, and kept every decoded ingredient.                                                    |
| `NCPDP_TELECOM_COB_COUNT_MISMATCH`         | Found that the declared other-payer count and the number of blocks decoded disagree, and kept every decoded block.                                              |
| `NCPDP_TELECOM_UNKNOWN_DUR_REASON`         | Kept a Reason For Service code it does not recognize verbatim and never dropped the interaction it belonged to.                                                 |

## Build codes

The builders refuse input that is invalid by construction, and the serializers refuse a model they
cannot write honestly. [Serializers and builders](./spec-notes-serialize-build.md) gives each rule
in full.

**SCRIPT** (`NcpdpScriptBuildError`):

| Code                                         | Refused because                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `NCPDP_SCRIPT_BUILD_MISSING_MEDICATION`      | A NewRx has no prescribed-medication description.                                                         |
| `NCPDP_SCRIPT_BUILD_MISSING_RESPONSE_CODE`   | A Status, Error, or Verify has no `<Code>`.                                                               |
| `NCPDP_SCRIPT_BUILD_INVALID_CHARACTER`       | A supplied value carries a control character that XML 1.0 does not allow.                                 |
| `NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION` | The message body is a transaction this library does not model; raised by the serializer and `toString()`. |

**Telecom** (`NcpdpTelecomBuildError`):

| Code                                             | Refused because                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `NCPDP_TELECOM_BUILD_MISSING_TRANSACTION_CODE`   | There is no Transaction Code (103-A3), so the request cannot route.                           |
| `NCPDP_TELECOM_BUILD_MISSING_SEGMENT_ID`         | A segment has no Segment Identification (111-AM) code.                                        |
| `NCPDP_TELECOM_BUILD_INVALID_SEGMENT_ID`         | A Segment Identification code is not exactly 2 characters.                                    |
| `NCPDP_TELECOM_BUILD_INVALID_FIELD_ID`           | A data field's id is not a 2-character identifier.                                            |
| `NCPDP_TELECOM_BUILD_EMBEDDED_CONTROL_CHARACTER` | A supplied value carries an FS, GS, or RS control character, which would corrupt the framing. |
| `NCPDP_TELECOM_BUILD_FIELD_TOO_LONG`             | A fixed-width header field is longer than its wire width.                                     |
| `NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT`     | The model carries more than one decoded transaction, and the serializer writes one.           |

Reference: the registries are in the [API reference](./api/@cosyte/ncpdp.md#script_warning_codes).

## Next

- [Troubleshooting](./troubleshooting.md): what to do when you see one of these codes.
- [How the parser reads safely](./fail-safe-reading.md): why most deviations are warnings.
- [Triage warnings with a profile](./triage-warnings-with-profiles.md): separate the warnings a
  partner's conventions predict from the ones to alert on.

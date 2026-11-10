/**
 * Public entry point for the `@cosyte/ncpdp` package.
 *
 * NCPDP is two structurally unrelated standards under one brand. They ship via
 * subpath exports: `@cosyte/ncpdp/script` (SCRIPT XML ePrescribing),
 * `@cosyte/ncpdp/telecom` (the Telecommunication claim standard),
 * `@cosyte/ncpdp/common` (shared vocabulary), and `@cosyte/ncpdp/profiles`
 * (trading-partner profiles).
 *
 * This root re-exports every export of the SCRIPT, common, and profiles
 * subpaths, and part of the Telecom one: `parseTelecom`, `claim`,
 * `serializeTelecom`, `buildTelecomRequest`, the request header, tokenizer, and
 * quantity helpers, and the Telecom codes and errors. The Telecom response
 * views (`adjudication` and the rest), the compound, COB, DUR, and
 * prior-authorization views, `telecomMoney`, and `fieldValues` are exported
 * from `@cosyte/ncpdp/telecom` only. Deep imports from the subpaths keep
 * Telecom-only or SCRIPT-only consumers lean.
 *
 * @packageDocumentation
 * @module @cosyte/ncpdp
 */

/**
 * Library version string, synced with `package.json#version` by the build.
 *
 * @example
 * ```ts
 * import { VERSION } from "@cosyte/ncpdp";
 * console.log(VERSION);
 * ```
 */
export const VERSION: string = "0.1.5";

export {
  parseScript,
  newRx,
  status,
  error,
  verify,
  rxRenewalRequest,
  rxRenewalResponse,
  rxChangeRequest,
  rxChangeResponse,
  cancelRx,
  cancelRxResponse,
  type ParseScriptOptions,
  ScriptMessage,
  type ScriptBody,
  type UnsupportedBody,
  serializeScript,
  buildNewRx,
  buildScriptResponse,
  type NewRxInput,
  type ScriptResponseInput,
  type ScriptHeaderInput,
  approvalOf,
  type ResponseOutcome,
  type ResponseApproval,
  type ResponseReason,
  type LifecycleRequest,
  type LifecycleResponse,
  type LifecycleRequestKind,
  type LifecycleResponseKind,
  type LifecycleRequestFields,
  type LifecycleResponseFields,
  type RxRenewalRequest,
  type RxChangeRequest,
  type CancelRx,
  type RxRenewalResponse,
  type RxChangeResponse,
  type CancelRxResponse,
  dispositionOf,
  type ResponseBody,
  type ResponseDisposition,
  type ResponseFields,
  type ResponseKind,
  type StatusBody,
  type ErrorBody,
  type VerifyBody,
  type ScriptHeader,
  type NewRx,
  type Patient,
  type Pharmacy,
  type Prescriber,
  type PartyIdentification,
  type ScriptName,
  type MedicationPrescribed,
  type DrugCoded,
  type Strength,
  type Quantity,
  extractStructuredSig,
  type StructuredSig,
  type SigField,
  type SigFieldProvenance,
  KNOWN_SCRIPT_VERSIONS,
  SCRIPT_TRANSACTION_NAMES,
  type KnownScriptVersion,
  type ScriptTransactionName,
  type VersionClassification,
  classifyVersion,
  type XmlElement,
} from "./script/index.js";

export {
  type ScriptPosition,
  scriptPosition,
  joinPath,
  SCRIPT_WARNING_CODES,
  SCRIPT_WARNING_MESSAGES,
  type ScriptWarningCode,
  type NcpdpScriptWarning,
  scriptWarning,
  SCRIPT_FATAL_CODES,
  SCRIPT_FATAL_MESSAGES,
  type ScriptFatalCode,
  NcpdpScriptParseError,
  SCRIPT_BUILD_CODES,
  SCRIPT_BUILD_MESSAGES,
  type ScriptBuildCode,
  NcpdpScriptBuildError,
  type DecimalValue,
  decimalValue,
  type DateValue,
  dateValue,
  type DateParts,
  type ToDateOptions,
  toObject,
  toISO,
  toDate,
  type NdcSegmentation,
  type NdcValue,
  ndcValue,
  type CodeSystem,
  type CodedValue,
  recognizeCodeSystem,
  codedValue,
  deepFreeze,
} from "./common/index.js";

export {
  parseTelecom,
  claim,
  serializeTelecom,
  buildTelecomRequest,
  type TelecomRequestInput,
  type TelecomHeaderInput,
  type TelecomSegmentInput,
  type TelecomFieldInput,
  type TelecomParseOptions,
  type TelecomTransaction,
  type TelecomClaim,
  type TelecomProductCode,
  type TelecomQuantity,
  impliedThreeDecimal,
  telecomQuantity,
  claimView,
  type TelecomHeader,
  type TelecomVersion,
  D0_HEADER_LENGTH,
  detectVersion,
  decodeD0Header,
  undecodedHeader,
  type TelecomField,
  type TelecomSegment,
  type TelecomDecodedTransaction,
  type TelecomDecodedTransmission,
  FIELD_SEPARATOR,
  GROUP_SEPARATOR,
  SEGMENT_SEPARATOR,
  SEGMENT_NAMES,
  SEGMENT_ID_LENGTH,
  FIELD_NAMES,
  SEGMENT_CODE_RANGES,
  SEGMENT_ABSENCES,
  type SegmentGroup,
  type SegmentAbsenceReason,
  type SegmentCodeRange,
  type SegmentAbsence,
  splitWithOffsets,
  tokenizeBody,
  tokenizeTransactions,
  tokenizeTransmission,
  findSegment,
  fieldValue,
  type TelecomPosition,
  telecomPosition,
  TELECOM_WARNING_CODES,
  TELECOM_WARNING_MESSAGES,
  type TelecomWarningCode,
  type NcpdpTelecomWarning,
  telecomWarning,
  TELECOM_FATAL_CODES,
  TELECOM_FATAL_MESSAGES,
  type TelecomFatalCode,
  NcpdpTelecomParseError,
  TELECOM_BUILD_CODES,
  TELECOM_BUILD_MESSAGES,
  type TelecomBuildCode,
  NcpdpTelecomBuildError,
} from "./telecom/index.js";

// Trading-partner / companion-guide profile system. NCPDP spans two
// unrelated standards, so built-ins are reached via the `profiles` namespace
// (`profiles.surescripts` for SCRIPT, `profiles.pbm` for Telecom), each grounded
// in a committed fixture that demonstrates it. Profiles are descriptive
// (attribution + `partitionWarnings`); they never alter the parse.
export {
  defineProfile,
  setDefaultProfile,
  getDefaultProfile,
  partitionWarnings,
  profiles,
  NcpdpProfileError,
  type NcpdpWarningPartition,
  type NcpdpProfile,
  type NcpdpProfileDescription,
  type NcpdpProfileEffect,
  type NcpdpProfileQuirk,
  type NcpdpProfileSpec,
  type NcpdpStandard,
  type NcpdpWarningCode,
} from "./profiles/index.js";

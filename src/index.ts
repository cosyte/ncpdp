/**
 * Public entry point for the `@cosyte/ncpdp` package.
 *
 * NCPDP is two structurally unrelated standards under one brand. They ship via
 * subpath exports: `@cosyte/ncpdp/script` (SCRIPT XML ePrescribing),
 * `@cosyte/ncpdp/telecom` (the Telecommunication claim standard), and
 * `@cosyte/ncpdp/common` (shared vocabulary).
 *
 * This root re-exports the implemented SCRIPT and Telecom surfaces plus the
 * shared common vocabulary for convenience; deep imports from the subpaths are
 * equivalent and keep Telecom-only or SCRIPT-only consumers lean.
 *
 * @packageDocumentation
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
export const VERSION = "0.0.0";

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
  type KnownScriptVersion,
  type VersionClassification,
  classifyVersion,
  type XmlElement,
} from "./script/index.js";

export {
  type ScriptPosition,
  scriptPosition,
  joinPath,
  SCRIPT_WARNING_CODES,
  type ScriptWarningCode,
  type NcpdpScriptWarning,
  scriptWarning,
  SCRIPT_FATAL_CODES,
  type ScriptFatalCode,
  NcpdpScriptParseError,
  SCRIPT_BUILD_CODES,
  type ScriptBuildCode,
  NcpdpScriptBuildError,
  type DecimalValue,
  decimalValue,
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
  PRODUCT_QUALIFIER_MEANINGS,
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
  FIELD_SEPARATOR,
  GROUP_SEPARATOR,
  SEGMENT_SEPARATOR,
  SEGMENT_NAMES,
  FIELD_NAMES,
  splitWithOffsets,
  tokenizeBody,
  findSegment,
  fieldValue,
  type TelecomPosition,
  telecomPosition,
  TELECOM_WARNING_CODES,
  type TelecomWarningCode,
  type NcpdpTelecomWarning,
  telecomWarning,
  TELECOM_FATAL_CODES,
  type TelecomFatalCode,
  NcpdpTelecomParseError,
  TELECOM_BUILD_CODES,
  type TelecomBuildCode,
  NcpdpTelecomBuildError,
} from "./telecom/index.js";

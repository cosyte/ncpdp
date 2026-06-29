/**
 * `@cosyte/ncpdp/telecom` — NCPDP Telecommunication-standard (vD.0) claim parsing.
 * This phase opens the zero-dep claim side: it validates the FS/GS/RS
 * control-character framing, decodes the fixed Transaction Header, tokenizes the
 * field-id-keyed variable segments, and lifts a B1/B2/B3 request view. Liberal on
 * parse (quirks become stable-coded warnings with byte-offset context); only
 * structurally unrecoverable input throws a Telecom fatal.
 *
 * @packageDocumentation
 */
export { parseTelecom, claim, type TelecomParseOptions, type TelecomTransaction } from "./parse.js";
export { serializeTelecom } from "./serialize.js";
export {
  buildTelecomRequest,
  type TelecomRequestInput,
  type TelecomHeaderInput,
  type TelecomSegmentInput,
  type TelecomFieldInput,
} from "./builder.js";
export {
  decodeResponseHeader,
  RESPONSE_HEADER_MIN_LENGTH,
  type TelecomResponseHeader,
} from "./response-header.js";
export { telecomMoney, type TelecomMoney } from "./money.js";
export {
  responseStatus,
  responsePricing,
  responseDur,
  adjudication,
  collectResponseWarnings,
  RESPONSE_STATUS_MEANINGS,
  REJECT_CODE_MEANINGS,
  DUR_REASON_MEANINGS,
  type Disposition,
  type TelecomRejectCode,
  type TelecomResponseStatus,
  type TelecomPricing,
  type TelecomDurAlert,
  type TelecomAdjudication,
} from "./response.js";
export {
  type TelecomClaim,
  type TelecomProductCode,
  type TelecomQuantity,
  PRODUCT_QUALIFIER_MEANINGS,
  impliedThreeDecimal,
  telecomQuantity,
  claimView,
} from "./claim.js";
export {
  compound,
  collectCompoundWarnings,
  type TelecomCompound,
  type TelecomCompoundIngredient,
} from "./compound.js";
export {
  cobOtherPayments,
  responseCob,
  collectCobWarnings,
  type TelecomOtherPayer,
  type TelecomOtherPayerAmount,
  type TelecomResponseOtherPayer,
} from "./cob.js";
export { requestDur, collectDurWarnings, type TelecomDurRequest } from "./dur.js";
export { priorAuthorization, type TelecomPriorAuthorization } from "./prior-auth.js";
export {
  type TelecomHeader,
  type TelecomVersion,
  D0_HEADER_LENGTH,
  detectVersion,
  decodeD0Header,
  undecodedHeader,
} from "./header.js";
export {
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
  fieldValues,
} from "./tokenize.js";
export { type TelecomPosition, telecomPosition } from "./position.js";
export {
  TELECOM_WARNING_CODES,
  type TelecomWarningCode,
  type NcpdpTelecomWarning,
  telecomWarning,
} from "./warnings.js";
export { TELECOM_FATAL_CODES, type TelecomFatalCode, NcpdpTelecomParseError } from "./errors.js";
export { TELECOM_BUILD_CODES, type TelecomBuildCode, NcpdpTelecomBuildError } from "./errors.js";

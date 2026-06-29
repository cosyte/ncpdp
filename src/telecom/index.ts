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
} from "./tokenize.js";
export { type TelecomPosition, telecomPosition } from "./position.js";
export {
  TELECOM_WARNING_CODES,
  type TelecomWarningCode,
  type NcpdpTelecomWarning,
  telecomWarning,
} from "./warnings.js";
export { TELECOM_FATAL_CODES, type TelecomFatalCode, NcpdpTelecomParseError } from "./errors.js";

/**
 * `@cosyte/ncpdp/common`: vocabulary shared across the NCPDP SCRIPT and Telecom
 * sides: positional context, warning/fatal registries, and value wrappers (NDC,
 * decimal, code systems, dates) that preserve wire values exactly, plus the
 * opt-in date conversions read over the last of those.
 *
 * @packageDocumentation
 */
export { type ScriptPosition, scriptPosition, joinPath } from "./position.js";
export {
  SCRIPT_WARNING_CODES,
  SCRIPT_WARNING_MESSAGES,
  type ScriptWarningCode,
  type NcpdpScriptWarning,
  scriptWarning,
} from "./warnings.js";
export {
  SCRIPT_FATAL_CODES,
  SCRIPT_FATAL_MESSAGES,
  type ScriptFatalCode,
  NcpdpScriptParseError,
} from "./errors.js";
export {
  SCRIPT_BUILD_CODES,
  SCRIPT_BUILD_MESSAGES,
  type ScriptBuildCode,
  NcpdpScriptBuildError,
} from "./errors.js";
export { type DecimalValue, decimalValue } from "./decimal.js";
export { type DateValue, dateValue } from "./date.js";
export { type DateParts, type ToDateOptions, toObject, toISO, toDate } from "./date-conversion.js";
export { type NdcSegmentation, type NdcValue, ndcValue } from "./ndc.js";
export {
  type CodeSystem,
  type CodedValue,
  recognizeCodeSystem,
  codedValue,
} from "./code-system.js";
export { deepFreeze } from "./freeze.js";

/**
 * `@cosyte/ncpdp/common` — vocabulary shared across the NCPDP SCRIPT and Telecom
 * sides: positional context, warning/fatal registries, and value wrappers (NDC,
 * decimal, code systems) that preserve wire values exactly.
 *
 * @packageDocumentation
 */
export { type ScriptPosition, scriptPosition, joinPath } from "./position.js";
export {
  SCRIPT_WARNING_CODES,
  type ScriptWarningCode,
  type NcpdpScriptWarning,
  scriptWarning,
} from "./warnings.js";
export { SCRIPT_FATAL_CODES, type ScriptFatalCode, NcpdpScriptParseError } from "./errors.js";
export { SCRIPT_BUILD_CODES, type ScriptBuildCode, NcpdpScriptBuildError } from "./errors.js";
export { type DecimalValue, decimalValue } from "./decimal.js";
export { type NdcSegmentation, type NdcValue, ndcValue } from "./ndc.js";
export {
  type CodeSystem,
  type CodedValue,
  recognizeCodeSystem,
  codedValue,
} from "./code-system.js";
export { deepFreeze } from "./freeze.js";

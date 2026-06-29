/**
 * `@cosyte/ncpdp/script` — NCPDP SCRIPT (XML ePrescribing) parsing. This phase
 * delivers a structural read of the NewRx transaction: routing header, patient,
 * pharmacy, prescriber, and prescribed medication. Liberal on parse (quirks
 * become stable-coded warnings with XPath context), with a hard XXE/entity
 * boundary at load time.
 *
 * @packageDocumentation
 */
export { parseScript, newRx, status, error, verify, type ParseScriptOptions } from "./parse.js";
export { ScriptMessage, type ScriptBody, type UnsupportedBody } from "./message.js";
export {
  dispositionOf,
  type ResponseBody,
  type ResponseDisposition,
  type ResponseFields,
  type ResponseKind,
  type StatusBody,
  type ErrorBody,
  type VerifyBody,
} from "./response.js";
export { type ScriptHeader } from "./header.js";
export {
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
} from "./newrx.js";
export {
  KNOWN_SCRIPT_VERSIONS,
  type KnownScriptVersion,
  type VersionClassification,
  classifyVersion,
} from "./versions.js";
export { type XmlElement } from "./xml-load.js";

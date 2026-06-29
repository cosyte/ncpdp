/**
 * Drug/clinical code systems recognized in NCPDP SCRIPT product codes. SCRIPT
 * carries a qualifier alongside each coded value; we map common qualifiers to a
 * normalized system and fall back to `"UNKNOWN"` rather than guessing.
 */
export type CodeSystem = "NDC" | "RXNORM" | "SNOMED" | "NCI" | "ICD10" | "UNKNOWN";

/**
 * A coded value: the raw code, its source qualifier, and the normalized system
 * we recognized from that qualifier. The original qualifier is always preserved
 * so a consumer can re-derive the mapping if our table lags the spec.
 */
export interface CodedValue {
  /** The code itself, verbatim. */
  readonly value: string;
  /** The source qualifier string that accompanied the code. */
  readonly qualifier: string;
  /** Normalized code system recognized from {@link qualifier}. */
  readonly system: CodeSystem;
}

const QUALIFIER_MAP: ReadonlyMap<string, CodeSystem> = new Map([
  // NDC
  ["ND", "NDC"],
  ["NDC", "NDC"],
  // RxNorm
  ["RXNORM", "RXNORM"],
  ["RXCUI", "RXNORM"],
  // SNOMED CT
  ["SNOMED", "SNOMED"],
  ["SCT", "SNOMED"],
  // NCI / NCIt
  ["NCI", "NCI"],
  // ICD-10
  ["ICD10", "ICD10"],
  ["ICD-10", "ICD10"],
]);

/**
 * Recognize a normalized {@link CodeSystem} from a SCRIPT code qualifier.
 * Matching is case-insensitive; unrecognized qualifiers yield `"UNKNOWN"` (a
 * lenient default, never a throw).
 *
 * @param qualifier - The qualifier string accompanying a coded value.
 * @returns The normalized code system.
 *
 * @example
 * ```ts
 * recognizeCodeSystem("ND");     // "NDC"
 * recognizeCodeSystem("RxCUI");  // "RXNORM"
 * recognizeCodeSystem("zzz");    // "UNKNOWN"
 * ```
 */
export function recognizeCodeSystem(qualifier: string): CodeSystem {
  return QUALIFIER_MAP.get(qualifier.trim().toUpperCase()) ?? "UNKNOWN";
}

/**
 * Build a frozen {@link CodedValue} from a raw code and qualifier, recognizing
 * the code system in the process.
 *
 * @param value - The code, verbatim.
 * @param qualifier - The accompanying qualifier string.
 * @returns A frozen {@link CodedValue}.
 *
 * @example
 * ```ts
 * codedValue("00002821501", "ND").system; // "NDC"
 * ```
 */
export function codedValue(value: string, qualifier: string): CodedValue {
  return Object.freeze({
    value,
    qualifier,
    system: recognizeCodeSystem(qualifier),
  });
}

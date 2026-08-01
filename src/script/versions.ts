/**
 * SCRIPT versions this parser explicitly supports. Both are XML-era releases
 * routed through Surescripts.
 *
 * The pair is grounded in US federal regulation, which is public law and
 * therefore the license-clean source for a version identifier (the standard
 * itself is paywalled). Two sections carry it:
 *
 * - **45 CFR 170.205(b)** adopts exactly these two SCRIPT Implementation Guide
 *   versions for electronic prescribing, at (b)(1) and (b)(2). It also states
 *   that the Secretary's adoption of `2017071` **expires on January 1, 2028**,
 *   after which `2023011` is the only SCRIPT version that paragraph adopts.
 * - **42 CFR 423.160** (Medicare Part D electronic prescribing) requires at
 *   (b)(1) that a prescription or prescription-related information comply with
 *   a standard in 45 CFR 170.205(b), and incorporates both guides by reference
 *   at (c)(2) and (c)(3).
 *
 * **Scope, because the list is narrower than it looks.** This is the set those
 * two sections adopt, not the set of SCRIPT versions NCPDP has ever published.
 * A version outside it may well be real; nothing public that this package can
 * cite would establish that, so it is not written down here. Narrowing the list
 * never refuses a message: a present-but-unrecognized stamp is still parsed
 * best-effort and reported as `tolerated`, per {@link classifyVersion}.
 *
 * @example
 * ```ts
 * import { KNOWN_SCRIPT_VERSIONS } from "@cosyte/ncpdp/script";
 * KNOWN_SCRIPT_VERSIONS.includes("2023011"); // true
 * ```
 */
// Provenance for NCPDP-SCRIPT-VERSIONS. Re-derived 2026-08-01, not copied from
// this list's previous contents, from two separately-retrieved publications of
// the CFR text. They are two independent RETRIEVALS, not two independent
// derivations: Cornell republishes the same underlying OFR/GPO data the eCFR
// serves, so their agreement rules out a transcription or fetch error on one
// side, and does not constitute two sources that established the fact apart
// from each other.
//   1. eCFR versioner API (ecfr.gov/api/versioner/v1/full/...), title 45 issue
//      date 2026-07-24 and title 42 issue date 2026-07-20, both "up to date as
//      of" 2026-07-30.
//   2. Cornell LII mirror (law.cornell.edu/cfr/text/45/170.205 and /42/423.160).
// Both agree: 45 CFR 170.205(b) names 2017071 and 2023011 and nothing else, and
// 42 CFR 423.160 contains exactly those two 7-digit tokens across the whole
// section. "2022011", which this list previously carried, appears in neither.
// The 42 CFR 423.160 source line reads [89 FR 51263, June 17, 2024, as amended
// by 89 FR 98565, Dec. 9, 2024].
//
// Asserting a version is ABSENT needs the same evidence as asserting it is
// present, so the absence above was measured by grepping the fetched section
// text for every /\b20\d{5}\b/ token, with a passing negative control (the same
// grep does find 2023011). If you touch this list, re-fetch. Do not edit it
// from memory: that is how it got wrong the first time.
export const KNOWN_SCRIPT_VERSIONS = ["2017071", "2023011"] as const;

/** Union of the explicitly-supported SCRIPT version literals. */
export type KnownScriptVersion = (typeof KNOWN_SCRIPT_VERSIONS)[number];

/**
 * SCRIPT transaction element names this parser will **name**, as opposed to
 * model. It is a closed vocabulary the library owns, not something read out of a
 * document, and it exists so that an unmodeled transaction can still be
 * identified without copying a sender-chosen element name onto the model or into
 * a diagnostic.
 *
 * The list is the transaction vocabulary published in **42 CFR 423.160**, the
 * federal e-prescribing standards rule, verbatim and in its order. That source is
 * public law, not the paywalled standard, which is why the names can be written
 * down here at all. Being grounded rather than invented matters: an earlier draft
 * of this list was written from memory and got three transfer names and the
 * recertification names wrong while omitting the whole prior-authorization and
 * REMS families, which would have silently stripped the identity off every ePA
 * message this library saw.
 *
 * **One assumption is worth stating**: the regulation lists transaction *names*
 * in prose, and this list is matched against XML element *local names*. Those are
 * the same artifact only insofar as the regulation transcribed the standard's
 * element names, which the shape of the names strongly suggests but which cannot
 * be confirmed against a public source, since the schemas are paywalled. If one
 * of them turns out not to be the element name, that transaction is surfaced
 * unnamed, which is the same fail-safe path a vendor extension takes.
 *
 * A transaction the standard defines but that regulation does not name is
 * surfaced as unmodeled and **unnamed**; so is a vendor extension. That is the
 * intended default, because the alternative (repeat whatever the element was
 * called) is what put document-derived bytes on a diagnostic surface. A consumer
 * that needs the element name reads the document it already holds.
 *
 * Note that the PHI gate cannot check this list: a closed set passes it by
 * construction. What keeps it safe is that it stays closed and stays sourced,
 * which is a property of review, not of a test.
 *
 * @example
 * ```ts
 * import { SCRIPT_TRANSACTION_NAMES } from "@cosyte/ncpdp/script";
 * SCRIPT_TRANSACTION_NAMES.includes("RxHistoryRequest"); // true
 * ```
 */
// Re-verified 2026-08-01 against the same fetched 42 CFR 423.160 text as
// KNOWN_SCRIPT_VERSIONS above: all 36 names below match (b)(1)(i)(A) through (Z)
// exactly and in order, expanding each "X and Y" subparagraph in place. Checked
// by extracting the names from the section text and comparing sequences, with a
// negative control (swapping two entries fails the comparison). Unchanged.
export const SCRIPT_TRANSACTION_NAMES = [
  "GetMessage",
  "Status",
  "Error",
  "RxChangeRequest",
  "RxChangeResponse",
  "RxRenewalRequest",
  "RxRenewalResponse",
  "Resupply",
  "Verify",
  "CancelRx",
  "CancelRxResponse",
  "RxFill",
  "DrugAdministration",
  "NewRxRequest",
  "NewRx",
  "NewRxResponseDenied",
  "RxTransferInitiationRequest",
  "RxTransfer",
  "RxTransferConfirm",
  "RxFillIndicatorChange",
  "Recertification",
  "REMSInitiationRequest",
  "REMSInitiationResponse",
  "REMSRequest",
  "REMSResponse",
  "RxHistoryRequest",
  "RxHistoryResponse",
  "PAInitiationRequest",
  "PAInitiationResponse",
  "PARequest",
  "PAResponse",
  "PAAppealRequest",
  "PAAppealResponse",
  "PACancelRequest",
  "PACancelResponse",
  "PANotification",
] as const;

/** Union of the SCRIPT transaction element names this parser will name. */
export type ScriptTransactionName = (typeof SCRIPT_TRANSACTION_NAMES)[number];

/** Membership set for {@link SCRIPT_TRANSACTION_NAMES}. */
export const SCRIPT_TRANSACTION_NAME_SET: ReadonlySet<string> = new Set(SCRIPT_TRANSACTION_NAMES);

/** Outcome of classifying a declared SCRIPT version string. */
export type VersionClassification =
  | { readonly kind: "known"; readonly version: KnownScriptVersion }
  | { readonly kind: "tolerated"; readonly version: string }
  | { readonly kind: "absent" }
  | { readonly kind: "unsupported"; readonly version: string };

const KNOWN_SET: ReadonlySet<string> = new Set(KNOWN_SCRIPT_VERSIONS);

// A legacy dotted major (e.g. "10.6", "8.1") predates XML SCRIPT and cannot be
// parsed as XML at all: that is a hard, testable unsupported-version path. Any
// other present-but-unrecognized version is tolerated, so no further shape test
// is needed.
const LEGACY_DOTTED_RE = /^\d{1,2}\.\d+$/;

/**
 * Classify a declared SCRIPT version string.
 *
 * - A known XML version → `known`.
 * - A legacy dotted major (pre-XML, e.g. `10.6`) → `unsupported` (fatal).
 * - Absent/blank → `absent` (parse best-effort + warn).
 * - Anything else present-but-unrecognized → `tolerated` (parse best-effort +
 *   warn), since refusing an odd-but-present version string would violate
 *   Postel's Law for a message that is still XML.
 *
 * @param raw - The version attribute value, or `undefined` when absent.
 * @returns The {@link VersionClassification}.
 *
 * @example
 * ```ts
 * classifyVersion("2017071"); // { kind: "known", version: "2017071" }
 * classifyVersion("2099001"); // { kind: "tolerated", version: "2099001" }
 * classifyVersion("10.6");    // { kind: "unsupported", version: "10.6" }
 * classifyVersion(undefined); // { kind: "absent" }
 * ```
 */
export function classifyVersion(raw: string | undefined): VersionClassification {
  if (raw === undefined) return { kind: "absent" };
  const v = raw.trim();
  if (v.length === 0) return { kind: "absent" };
  if (KNOWN_SET.has(v)) return { kind: "known", version: v as KnownScriptVersion };
  if (LEGACY_DOTTED_RE.test(v)) return { kind: "unsupported", version: v };
  return { kind: "tolerated", version: v };
}

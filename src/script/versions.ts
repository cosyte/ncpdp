/**
 * SCRIPT versions this parser explicitly supports. Both are XML-era releases
 * routed through Surescripts.
 *
 * @example
 * ```ts
 * import { KNOWN_SCRIPT_VERSIONS } from "@cosyte/ncpdp/script";
 * KNOWN_SCRIPT_VERSIONS.includes("2022011"); // true
 * ```
 */
export const KNOWN_SCRIPT_VERSIONS = ["2017071", "2022011"] as const;

/** Union of the explicitly-supported SCRIPT version literals. */
export type KnownScriptVersion = (typeof KNOWN_SCRIPT_VERSIONS)[number];

/**
 * SCRIPT transaction element names this parser will **name**, as opposed to
 * model. It is a closed vocabulary the library owns, not something read out of a
 * document, and it exists so that an unmodeled transaction can still be
 * identified without copying a sender-chosen element name onto the model or into
 * a diagnostic.
 *
 * Being incomplete is safe and intended: a real SCRIPT transaction that is not
 * listed here is surfaced as unmodeled and unnamed, and the consumer reads the
 * document it already holds. The reverse default (echo whatever the element was
 * called) is what put patient data on a diagnostic surface.
 *
 * @example
 * ```ts
 * import { SCRIPT_TRANSACTION_NAMES } from "@cosyte/ncpdp/script";
 * SCRIPT_TRANSACTION_NAMES.includes("RxHistoryRequest"); // true
 * ```
 */
export const SCRIPT_TRANSACTION_NAMES = [
  // Prescribing.
  "NewRx",
  "NewRxRequest",
  "NewRxResponseDenied",
  "RxRenewalRequest",
  "RxRenewalResponse",
  "RxChangeRequest",
  "RxChangeResponse",
  "CancelRx",
  "CancelRxResponse",
  "RxFill",
  // Transfer.
  "RxTransferRequest",
  "RxTransferResponse",
  "RxTransferConfirmation",
  // History.
  "RxHistoryRequest",
  "RxHistoryResponse",
  // Long-term and post-acute care.
  "Census",
  "Resupply",
  "DrugAdministration",
  "RecertificationRequest",
  "RecertificationResponse",
  // Infrastructure.
  "Status",
  "Error",
  "Verify",
  "GetMessage",
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

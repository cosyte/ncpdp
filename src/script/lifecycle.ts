import { joinPath, scriptPosition } from "../common/position.js";
import {
  scriptWarning,
  SCRIPT_WARNING_CODES,
  type NcpdpScriptWarning,
} from "../common/warnings.js";
import {
  extractMedicationPrescribed,
  extractPatient,
  extractPharmacy,
  extractPrescriber,
  type MedicationPrescribed,
  type Patient,
  type Pharmacy,
  type Prescriber,
} from "./newrx.js";
import { childText, firstChild } from "./nav.js";
import type { XmlElement } from "./xml-load.js";

/** The SCRIPT prescription-lifecycle **request** transactions this phase models. */
export type LifecycleRequestKind = "RxRenewalRequest" | "RxChangeRequest" | "CancelRx";

/** The SCRIPT prescription-lifecycle **response** transactions this phase models. */
export type LifecycleResponseKind = "RxRenewalResponse" | "RxChangeResponse" | "CancelRxResponse";

/**
 * The prescriber's decision on a lifecycle request, detected purely from the
 * `<Response>` choice element. The mapping is one-directional and fail-safe: a
 * `<Denied>` is **always** `"denied"` and is never read as an approval, and a
 * response with no recognized choice is `"unknown"` — never assumed approved.
 *
 * - `approved` — `<Approved>`: the request is granted as written.
 * - `approvedWithChanges` — `<ApprovedWithChanges>`: granted, but the prescriber
 *   altered the medication; the changed medication is carried in
 *   {@link LifecycleResponseFields.medicationPrescribed}.
 * - `denied` — `<Denied>`: the request is refused.
 * - `deniedNewToFollow` — `<DenyNewToFollow>` (renewal): denied, a new
 *   prescription will follow separately.
 * - `replace` — `<Replace>`: the prescriber is replacing the prescription.
 * - `validated` — `<Validated>` (change): the prescriber validated the request
 *   without approving or denying it.
 * - `unknown` — no recognized outcome choice was present.
 */
export type ResponseOutcome =
  | "approved"
  | "approvedWithChanges"
  | "denied"
  | "deniedNewToFollow"
  | "replace"
  | "validated"
  | "unknown";

/**
 * A coarse, **fail-safe** classification of a {@link ResponseOutcome} for
 * consumers that only need "did the prescriber say yes?". A denial is never
 * `"affirmative"`, and anything that is not a clean yes/no (including `unknown`)
 * is `"indeterminate"` so it is never mistaken for a grant.
 */
export type ResponseApproval = "affirmative" | "negative" | "indeterminate";

/**
 * Map a {@link ResponseOutcome} to its fail-safe {@link ResponseApproval}. Total
 * and one-directional: only an outright approval is `"affirmative"`; denials are
 * `"negative"`; everything else (`replace`/`validated`/`unknown`) is
 * `"indeterminate"`.
 *
 * @param outcome - The detected response outcome.
 * @returns The coarse approval classification.
 *
 * @example
 * ```ts
 * approvalOf("denied"); // "negative"
 * approvalOf("approvedWithChanges"); // "affirmative"
 * approvalOf("unknown"); // "indeterminate"
 * ```
 */
export function approvalOf(outcome: ResponseOutcome): ResponseApproval {
  switch (outcome) {
    case "approved":
    case "approvedWithChanges":
      return "affirmative";
    case "denied":
    case "deniedNewToFollow":
      return "negative";
    case "replace":
    case "validated":
    case "unknown":
      return "indeterminate";
  }
}

/**
 * The reason carried alongside a lifecycle response outcome. All fields are
 * surfaced **verbatim** — codes and free text are never reformatted, looked up,
 * or translated.
 */
export interface ResponseReason {
  /** Coded reason, verbatim (`<ReasonCode>`). */
  readonly code?: string;
  /** Reference number tying the reason to a request item, verbatim (`<ReferenceNumber>`). */
  readonly referenceNumber?: string;
  /** Free-text denial reason, verbatim (`<DenialReason>`). */
  readonly denialReason?: string;
  /** Free-text note, verbatim (`<Note>`). */
  readonly note?: string;
}

/** Fields shared by the lifecycle **request** transactions. */
export interface LifecycleRequestFields {
  /** Request reference number, verbatim (`<RequestReferenceNumber>`). */
  readonly requestReferenceNumber?: string;
  readonly patient?: Patient;
  readonly pharmacy?: Pharmacy;
  readonly prescriber?: Prescriber;
  /** The prescription this request concerns (`<MedicationPrescribed>`). */
  readonly medicationPrescribed?: MedicationPrescribed;
}

/** A pharmacy-initiated request to renew a prescription (`<RxRenewalRequest>`). */
export interface RxRenewalRequest extends LifecycleRequestFields {
  readonly kind: "RxRenewalRequest";
}

/** A pharmacy-initiated request to change a prescription (`<RxChangeRequest>`). */
export interface RxChangeRequest extends LifecycleRequestFields {
  readonly kind: "RxChangeRequest";
}

/** A prescriber-initiated request to retract a prescription (`<CancelRx>`). */
export interface CancelRx extends LifecycleRequestFields {
  readonly kind: "CancelRx";
}

/** A parsed SCRIPT prescription-lifecycle request body. */
export type LifecycleRequest = RxRenewalRequest | RxChangeRequest | CancelRx;

/** Fields shared by the lifecycle **response** transactions. */
export interface LifecycleResponseFields {
  /** Request reference number echoing the request, verbatim (`<RequestReferenceNumber>`). */
  readonly requestReferenceNumber?: string;
  /** The prescriber's decision, detected fail-safe from the `<Response>` choice. */
  readonly outcome: ResponseOutcome;
  /** The reason carried with the outcome, when present. */
  readonly reason?: ResponseReason;
  /**
   * The medication carried with the response. For an `approvedWithChanges`
   * outcome this is the **changed** medication and is the field a consumer must
   * read to dispense correctly.
   */
  readonly medicationPrescribed?: MedicationPrescribed;
}

/** A prescriber's answer to a renewal request (`<RxRenewalResponse>`). */
export interface RxRenewalResponse extends LifecycleResponseFields {
  readonly kind: "RxRenewalResponse";
}

/** A prescriber's answer to a change request (`<RxChangeResponse>`). */
export interface RxChangeResponse extends LifecycleResponseFields {
  readonly kind: "RxChangeResponse";
}

/** A pharmacy's confirmation/denial of a cancel request (`<CancelRxResponse>`). */
export interface CancelRxResponse extends LifecycleResponseFields {
  readonly kind: "CancelRxResponse";
}

/** A parsed SCRIPT prescription-lifecycle response body. */
export type LifecycleResponse = RxRenewalResponse | RxChangeResponse | CancelRxResponse;

const REQUEST_KINDS: readonly LifecycleRequestKind[] = [
  "RxRenewalRequest",
  "RxChangeRequest",
  "CancelRx",
];

const RESPONSE_KINDS: readonly LifecycleResponseKind[] = [
  "RxRenewalResponse",
  "RxChangeResponse",
  "CancelRxResponse",
];

/**
 * Outcome choice element names mapped to {@link ResponseOutcome}, in **fail-safe
 * precedence order**: denials first, so that if a malformed response carries
 * more than one choice, a denial is never masked by a co-present approval.
 */
const OUTCOME_ELEMENTS: readonly (readonly [string, ResponseOutcome])[] = [
  ["Denied", "denied"],
  ["DenyNewToFollow", "deniedNewToFollow"],
  ["ApprovedWithChanges", "approvedWithChanges"],
  ["Approved", "approved"],
  ["Validated", "validated"],
  ["Replace", "replace"],
];

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function assign<T, K extends keyof T>(target: Mutable<T>, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value;
}

/**
 * Detect and extract a SCRIPT lifecycle request or response body, or `undefined`
 * when the body is none of the six lifecycle transactions.
 *
 * @param bodyEl - The `<Body>` element (or the `<Message>` root when there is no
 *   `<Body>` wrapper).
 * @param bodyPath - XPath-style location of `bodyEl` (for warning context).
 * @param warnings - Sink that collects non-fatal warnings.
 * @returns The parsed lifecycle body, or `undefined`.
 *
 * @example
 * ```ts
 * const warnings: NcpdpScriptWarning[] = [];
 * const body = extractLifecycle(bodyEl, "/Message/Body", warnings);
 * body?.kind; // "RxRenewalRequest" | "RxRenewalResponse" | … | undefined
 * ```
 */
export function extractLifecycle(
  bodyEl: XmlElement,
  bodyPath: string,
  warnings: NcpdpScriptWarning[],
): LifecycleRequest | LifecycleResponse | undefined {
  for (const kind of REQUEST_KINDS) {
    const el = firstChild(bodyEl, kind);
    if (el !== undefined) {
      return extractRequest(el, kind, joinPath(bodyPath, kind), warnings);
    }
  }
  for (const kind of RESPONSE_KINDS) {
    const el = firstChild(bodyEl, kind);
    if (el !== undefined) {
      return extractResponse(el, kind, joinPath(bodyPath, kind), warnings);
    }
  }
  return undefined;
}

function extractRequest(
  el: XmlElement,
  kind: LifecycleRequestKind,
  path: string,
  warnings: NcpdpScriptWarning[],
): LifecycleRequest {
  const fields: Mutable<LifecycleRequestFields> = {};
  assign(fields, "requestReferenceNumber", childText(el, "RequestReferenceNumber"));
  assign(fields, "patient", extractPatient(el));
  assign(fields, "pharmacy", extractPharmacy(el));
  assign(fields, "prescriber", extractPrescriber(el));
  assign(
    fields,
    "medicationPrescribed",
    extractMedicationPrescribed(el, joinPath(path, "MedicationPrescribed"), warnings),
  );
  switch (kind) {
    case "RxRenewalRequest":
      return Object.freeze({ kind, ...fields });
    case "RxChangeRequest":
      return Object.freeze({ kind, ...fields });
    case "CancelRx":
      return Object.freeze({ kind, ...fields });
  }
}

function extractResponse(
  el: XmlElement,
  kind: LifecycleResponseKind,
  path: string,
  warnings: NcpdpScriptWarning[],
): LifecycleResponse {
  const responseEl = firstChild(el, "Response") ?? el;
  const responsePath = responseEl === el ? path : joinPath(path, "Response");
  const { outcome, outcomeEl } = detectOutcome(responseEl, responsePath, warnings);

  const fields: Mutable<LifecycleResponseFields> = { outcome };
  assign(fields, "requestReferenceNumber", childText(el, "RequestReferenceNumber"));
  assign(fields, "reason", extractReason(outcomeEl));
  assign(
    fields,
    "medicationPrescribed",
    extractResponseMedication(el, path, responsePath, outcomeEl, warnings),
  );
  switch (kind) {
    case "RxRenewalResponse":
      return Object.freeze({ kind, ...fields });
    case "RxChangeResponse":
      return Object.freeze({ kind, ...fields });
    case "CancelRxResponse":
      return Object.freeze({ kind, ...fields });
  }
}

/**
 * Locate the medication carried by a response. SCRIPT places it as a sibling of
 * `<Response>` in the common shape, but a real-world variant nests the changed
 * medication **inside** the winning outcome element (e.g.
 * `<ApprovedWithChanges><MedicationPrescribed>`). Reading only the sibling would
 * silently drop the changed drug on an `approvedWithChanges` outcome — exactly the
 * value a consumer must dispense — so the outcome element is checked as a fallback.
 */
function extractResponseMedication(
  el: XmlElement,
  path: string,
  responsePath: string,
  outcomeEl: XmlElement | undefined,
  warnings: NcpdpScriptWarning[],
): MedicationPrescribed | undefined {
  const sibling = extractMedicationPrescribed(el, joinPath(path, "MedicationPrescribed"), warnings);
  if (sibling !== undefined || outcomeEl === undefined) return sibling;
  return extractMedicationPrescribed(
    outcomeEl,
    joinPath(joinPath(responsePath, outcomeEl.name), "MedicationPrescribed"),
    warnings,
  );
}

function detectOutcome(
  responseEl: XmlElement,
  path: string,
  warnings: NcpdpScriptWarning[],
): { outcome: ResponseOutcome; outcomeEl: XmlElement | undefined } {
  const present = OUTCOME_ELEMENTS.map(([name, outcome]) => ({
    name,
    outcome,
    el: firstChild(responseEl, name),
  })).filter(
    (c): c is { name: string; outcome: ResponseOutcome; el: XmlElement } => c.el !== undefined,
  );

  const first = present[0];
  if (first === undefined) {
    warnings.push(
      scriptWarning(
        SCRIPT_WARNING_CODES.LIFECYCLE_OUTCOME_UNRECOGNIZED,
        "SCRIPT lifecycle response carried no recognized outcome; surfaced as unknown rather than approved.",
        scriptPosition(path),
      ),
    );
    return { outcome: "unknown", outcomeEl: undefined };
  }

  if (present.length > 1) {
    warnings.push(
      scriptWarning(
        SCRIPT_WARNING_CODES.LIFECYCLE_AMBIGUOUS_OUTCOME,
        `Multiple SCRIPT response outcomes present (${present.map((c) => c.name).join(", ")}); reporting by fail-safe precedence (a denial is never masked by a co-present approval).`,
        scriptPosition(path),
      ),
    );
  }

  return { outcome: first.outcome, outcomeEl: first.el };
}

function extractReason(outcomeEl: XmlElement | undefined): ResponseReason | undefined {
  if (outcomeEl === undefined) return undefined;
  const out: Mutable<ResponseReason> = {};
  assign(out, "code", childText(outcomeEl, "ReasonCode"));
  assign(out, "referenceNumber", childText(outcomeEl, "ReferenceNumber"));
  assign(out, "denialReason", childText(outcomeEl, "DenialReason"));
  assign(out, "note", childText(outcomeEl, "Note"));
  return Object.keys(out).length === 0 ? undefined : Object.freeze(out);
}

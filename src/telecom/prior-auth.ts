/**
 * NCPDP Telecommunication vD.0 Prior Authorization segment (segment id `12`).
 *
 * Scope here is **presence, not adjudication**: this surfaces that a Prior
 * Authorization segment was sent and lifts the submitted PA type and number
 * verbatim. It deliberately makes **no** determination about whether prior
 * authorization is required, approved, or valid — that is a payer adjudication
 * decision, never inferred by a parser. Surfacing the segment lets a consumer
 * route on "PA was supplied" without the library implying an outcome.
 */

import { findSegment, fieldValue } from "./tokenize.js";
import type { TelecomTransaction } from "./parse.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Prior Authorization segment id (12). */
const PRIOR_AUTH_SEGMENT = "12";

/** Prior Authorization Type Code (461-EU), verbatim. */
const F_PA_TYPE = "EU";
/** Prior Authorization Number Submitted (462-EV), verbatim. */
const F_PA_NUMBER = "EV";

/**
 * The Prior Authorization (12) presence view. `present` is always `true` when
 * this object exists (the accessor returns `undefined` when the segment is
 * absent), so a consumer can branch on presence without inspecting the optional
 * fields. The type and number are surfaced verbatim; no approval is implied.
 */
export interface TelecomPriorAuthorization {
  /** Always `true` — the Prior Authorization segment was present. */
  readonly present: true;
  /** Prior Authorization Type Code (461-EU), verbatim, when present. */
  readonly typeCode?: string;
  /** Prior Authorization Number Submitted (462-EV), verbatim, when present. */
  readonly numberSubmitted?: string;
}

/**
 * Build the Prior Authorization presence view over a parsed Telecom transaction.
 * Returns `undefined` when no Prior Authorization (12) segment is present;
 * otherwise a {@link TelecomPriorAuthorization} with `present: true` and the
 * submitted type/number verbatim. Surfaces presence only — never adjudicates.
 *
 * @param transaction - A transaction from {@link parseTelecom}.
 * @returns The PA presence view, or `undefined` when no PA segment is present.
 *
 * @example
 * ```ts
 * const pa = priorAuthorization(parseTelecom(rawClaim));
 * if (pa) {
 *   pa.numberSubmitted; // the submitted PA number, verbatim (no approval implied)
 * }
 * ```
 */
export function priorAuthorization(
  transaction: TelecomTransaction,
): TelecomPriorAuthorization | undefined {
  const seg = findSegment(transaction.segments, PRIOR_AUTH_SEGMENT);
  if (seg === undefined) return undefined;

  const out: Mutable<TelecomPriorAuthorization> = { present: true };
  const type = fieldValue(seg, F_PA_TYPE);
  if (type !== undefined) out.typeCode = type;
  const number = fieldValue(seg, F_PA_NUMBER);
  if (number !== undefined) out.numberSubmitted = number;
  return Object.freeze(out);
}

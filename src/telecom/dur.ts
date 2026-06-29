/**
 * NCPDP Telecommunication vD.0 **request-side** DUR/PPS segment (segment id `08`).
 *
 * Where the response DUR/PPS segment (24, in `response.ts`) carries the alerts a
 * payer returns, the request DUR/PPS segment carries the pharmacist's drug-
 * utilization-review interaction: the Reason For Service that prompted review, the
 * Professional Service performed, and the Result Of Service. The segment repeats
 * one set of these per interaction; this surfaces **every** interaction in wire
 * order — none collapsed.
 *
 * Codes are surfaced verbatim. Reason-For-Service descriptions reuse the shared
 * {@link DUR_REASON_MEANINGS} map; Professional-Service and Result-Of-Service
 * descriptions are deliberately **bring-your-own** (we ship the codes, not
 * NCPDP-copyrighted descriptive prose for those code lists).
 */

import { telecomPosition } from "./position.js";
import { findSegment, type TelecomSegment } from "./tokenize.js";
import { DUR_REASON_MEANINGS } from "./response.js";
import { telecomWarning, TELECOM_WARNING_CODES, type NcpdpTelecomWarning } from "./warnings.js";
import type { TelecomTransaction } from "./parse.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Request DUR/PPS segment id (08). */
const DUR_SEGMENT = "08";

/** Reason For Service Code (439-E4) — the interaction type; begins an occurrence. */
const F_REASON = "E4";
/** Professional Service Code (440-E5) — the intervention performed. */
const F_PROFESSIONAL_SERVICE = "E5";
/** Result Of Service Code (441-E6) — the outcome. */
const F_RESULT = "E6";
/** DUR/PPS Level Of Effort (474-8E), verbatim. */
const F_LEVEL_OF_EFFORT = "8E";
/** DUR Co-Agent ID Qualifier (475-J9), verbatim. */
const F_COAGENT_QUALIFIER = "J9";
/** DUR Co-Agent ID (476-H7), verbatim. */
const F_COAGENT_ID = "H7";

/**
 * One DUR/PPS interaction from the **request** segment (08): the reason that
 * prompted review and the pharmacist's professional service and result. Reason
 * carries a description when recognized; professional-service and result codes
 * are verbatim only (description bring-your-own).
 */
export interface TelecomDurRequest {
  /** Reason For Service Code (439-E4), verbatim, when present. */
  readonly reasonForServiceCode?: string;
  /** True when {@link reasonForServiceCode} is in {@link DUR_REASON_MEANINGS}. */
  readonly reasonKnown: boolean;
  /** Short paraphrased reason description, when known. */
  readonly reasonDescription?: string;
  /** Professional Service Code (440-E5), verbatim, when present. */
  readonly professionalServiceCode?: string;
  /** Result Of Service Code (441-E6), verbatim, when present. */
  readonly resultOfServiceCode?: string;
  /** DUR/PPS Level Of Effort (474-8E), verbatim, when present. */
  readonly levelOfEffort?: string;
  /** DUR Co-Agent ID Qualifier (475-J9), verbatim, when present. */
  readonly coAgentIdQualifier?: string;
  /** DUR Co-Agent ID (476-H7), verbatim, when present. */
  readonly coAgentId?: string;
}

/**
 * Read every DUR/PPS interaction from the **request** segment (08). Splits at each
 * Reason For Service (439-E4) so a multi-interaction segment surfaces one entry
 * per interaction; an interaction without a reason code (a bare professional
 * service) is still surfaced. Returns an empty array when no segment 08 is present.
 *
 * @param transaction - A transaction from {@link parseTelecom}.
 * @returns Every request-side DUR/PPS interaction, in wire order.
 *
 * @example
 * ```ts
 * const dur = requestDur(parseTelecom(rawClaimWithDur));
 * dur[0]?.reasonForServiceCode;  // e.g. "DD"
 * dur[0]?.professionalServiceCode; // verbatim (description BYO)
 * ```
 */
export function requestDur(transaction: TelecomTransaction): readonly TelecomDurRequest[] {
  const seg = findSegment(transaction.segments, DUR_SEGMENT);
  if (seg === undefined) return Object.freeze([]);

  const entries: TelecomDurRequest[] = [];
  let current: Mutable<TelecomDurRequest> | undefined;

  const flush = (): void => {
    if (current !== undefined) {
      const reason = current.reasonForServiceCode;
      const description = reason === undefined ? undefined : DUR_REASON_MEANINGS.get(reason);
      current.reasonKnown = description !== undefined;
      if (description !== undefined) current.reasonDescription = description;
      entries.push(Object.freeze(current));
    }
  };

  for (const field of seg.fields) {
    const startsNew = field.id === F_REASON && current?.reasonForServiceCode !== undefined;
    if (startsNew || current === undefined) {
      flush();
      current = { reasonKnown: false };
    }
    switch (field.id) {
      case F_REASON:
        current.reasonForServiceCode = field.value;
        break;
      case F_PROFESSIONAL_SERVICE:
        current.professionalServiceCode = field.value;
        break;
      case F_RESULT:
        current.resultOfServiceCode = field.value;
        break;
      case F_LEVEL_OF_EFFORT:
        current.levelOfEffort = field.value;
        break;
      case F_COAGENT_QUALIFIER:
        current.coAgentIdQualifier = field.value;
        break;
      case F_COAGENT_ID:
        current.coAgentId = field.value;
        break;
      default:
        break;
    }
  }
  flush();
  return Object.freeze(entries);
}

/**
 * Emit a warning for each request DUR/PPS interaction whose Reason For Service
 * code is unrecognized — preserved verbatim, never dropped. Called on the request
 * path so the signal lives on `transaction.warnings`.
 *
 * @param segments - The decoded request segments.
 * @param warnings - The parse warning sink.
 *
 * @example
 * ```ts
 * const warnings: NcpdpTelecomWarning[] = [];
 * collectDurWarnings(transaction.segments, warnings);
 * ```
 */
export function collectDurWarnings(
  segments: readonly TelecomSegment[],
  warnings: NcpdpTelecomWarning[],
): void {
  const seg = findSegment(segments, DUR_SEGMENT);
  if (seg === undefined) return;
  for (const field of seg.fields) {
    if (field.id === F_REASON && field.value !== "" && !DUR_REASON_MEANINGS.has(field.value)) {
      warnings.push(
        telecomWarning(
          TELECOM_WARNING_CODES.UNKNOWN_DUR_REASON,
          "Request DUR/PPS Reason For Service code is not recognized this phase; preserved verbatim, never dropped.",
          telecomPosition(seg.byteOffset, F_REASON),
        ),
      );
    }
  }
}

import { scriptPosition } from "../common/position.js";
import {
  scriptWarning,
  SCRIPT_WARNING_CODES,
  type NcpdpScriptWarning,
} from "../common/warnings.js";
import { childText } from "./nav.js";
import type { XmlElement } from "./xml-load.js";

/**
 * How a SCRIPT response transaction dispositions the message it answers:
 * `success` (a `<Status>`), `error` (an `<Error>`), or `verify` (a `<Verify>`).
 * Derived purely from the response body kind so that an `Error` can **never** be
 * read as a success.
 */
export type ResponseDisposition = "success" | "error" | "verify";

/** The three SCRIPT response-transaction element names this phase models. */
export type ResponseKind = "Status" | "Error" | "Verify";

/**
 * Fields shared by the SCRIPT response transactions. All are optional because a
 * real-world sender may omit them; every value is surfaced **verbatim** — codes
 * and descriptions are never reformatted, looked up, or translated.
 */
export interface ResponseFields {
  /** Primary response code, verbatim (`<Code>`). */
  readonly code?: string;
  /** Secondary description code, verbatim (`<DescriptionCode>`). */
  readonly descriptionCode?: string;
  /** Free-text description, verbatim (`<Description>`). */
  readonly description?: string;
}

/** A SCRIPT `<Status>` — a positive acknowledgment of a prior transaction. */
export interface StatusBody extends ResponseFields {
  readonly kind: "Status";
}

/**
 * A SCRIPT `<Error>` — a negative acknowledgment. Its {@link ResponseFields.code}
 * and description are surfaced verbatim and it always dispositions as
 * `"error"` — it is never coerced to a success.
 */
export interface ErrorBody extends ResponseFields {
  readonly kind: "Error";
}

/** A SCRIPT `<Verify>` — a prescriber's verification acknowledgment. */
export interface VerifyBody extends ResponseFields {
  readonly kind: "Verify";
}

/** A parsed SCRIPT response transaction body. */
export type ResponseBody = StatusBody | ErrorBody | VerifyBody;

/**
 * Map a response body kind to its disposition. The mapping is total and
 * one-directional: an {@link ErrorBody} is **always** `"error"`.
 *
 * @param kind - The response body kind.
 * @returns The disposition.
 *
 * @example
 * ```ts
 * dispositionOf("Error"); // "error"
 * ```
 */
export function dispositionOf(kind: ResponseKind): ResponseDisposition {
  switch (kind) {
    case "Status":
      return "success";
    case "Error":
      return "error";
    case "Verify":
      return "verify";
  }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function assign<T, K extends keyof T>(target: Mutable<T>, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value;
}

/**
 * Extract a {@link ResponseBody} from its `<Status>` / `<Error>` / `<Verify>`
 * element. Lenient: a missing `<Code>` is surfaced as a
 * {@link "../common/warnings".SCRIPT_WARNING_CODES.MISSING_REQUIRED_ELEMENT}
 * warning rather than a throw, and the body is still returned so the disposition
 * is never lost.
 *
 * @param el - The response transaction element.
 * @param kind - Which response transaction `el` is.
 * @param path - XPath-style location of `el` (for warning context).
 * @param warnings - Sink that collects non-fatal warnings.
 * @returns A frozen {@link ResponseBody}.
 *
 * @example
 * ```ts
 * const warnings: NcpdpScriptWarning[] = [];
 * const body = extractResponse(errorEl, "Error", "/Message/Body/Error", warnings);
 * body.code; // verbatim
 * ```
 */
export function extractResponse(
  el: XmlElement,
  kind: ResponseKind,
  path: string,
  warnings: NcpdpScriptWarning[],
): ResponseBody {
  const fields: Mutable<ResponseFields> = {};
  assign(fields, "code", childText(el, "Code"));
  assign(fields, "descriptionCode", childText(el, "DescriptionCode"));
  assign(fields, "description", childText(el, "Description"));

  if (fields.code === undefined) {
    warnings.push(
      scriptWarning(
        SCRIPT_WARNING_CODES.MISSING_REQUIRED_ELEMENT,
        `SCRIPT <${kind}> response is missing a <Code>; disposition surfaced without it.`,
        scriptPosition(path),
      ),
    );
  }

  switch (kind) {
    case "Status":
      return Object.freeze({ kind: "Status", ...fields });
    case "Error":
      return Object.freeze({ kind: "Error", ...fields });
    case "Verify":
      return Object.freeze({ kind: "Verify", ...fields });
  }
}

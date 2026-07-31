import { NcpdpScriptParseError, SCRIPT_FATAL_CODES } from "../common/errors.js";
import { joinPath, scriptPosition } from "../common/position.js";
import {
  scriptWarning,
  SCRIPT_WARNING_CODES,
  type NcpdpScriptWarning,
} from "../common/warnings.js";
import { extractHeader, readVersion } from "./header.js";
import {
  extractLifecycle,
  type CancelRx,
  type CancelRxResponse,
  type RxChangeRequest,
  type RxChangeResponse,
  type RxRenewalRequest,
  type RxRenewalResponse,
} from "./lifecycle.js";
import { ScriptMessage, type ScriptBody } from "./message.js";
import { extractNewRx, type NewRx } from "./newrx.js";
import { firstChild } from "./nav.js";
import {
  extractResponse,
  type ErrorBody,
  type ResponseBody,
  type ResponseKind,
  type StatusBody,
  type VerifyBody,
} from "./response.js";
import { classifyVersion, SCRIPT_TRANSACTION_NAME_SET } from "./versions.js";
import { loadScriptXml, type XmlElement } from "./xml-load.js";
import { resolveProfile } from "../profiles/resolve.js";
import type { NcpdpProfile } from "../profiles/types.js";

/** Options for {@link parseScript}. */
export interface ParseScriptOptions {
  /**
   * Trading-partner profile to attach to the result for attribution (and
   * `partitionWarnings`). An explicit profile ALWAYS wins over any
   * process-scoped default; pass `null` to opt out of the default for this one
   * call; omit (or `undefined`) to consult `getDefaultProfile()`. v1 profiles
   * are DESCRIPTIVE: the profile is surfaced as `msg.profile` but does NOT
   * alter the lenient parse.
   */
  readonly profile?: NcpdpProfile | null;
}

/**
 * Parse a raw NCPDP SCRIPT XML string into an immutable {@link ScriptMessage}.
 *
 * Liberal on input (Postel's Law): recoverable anomalies become warnings with
 * stable codes and XPath context. Fatal only for unrecoverable structure:
 * empty input, non-XML / entity-bearing input, a non-`<Message>` root, or a
 * pre-XML legacy SCRIPT version.
 *
 * @param raw - The raw SCRIPT XML.
 * @param options - Optional {@link ParseScriptOptions}.
 * @returns The parsed {@link ScriptMessage}.
 * @throws {NcpdpScriptParseError} On unrecoverable structural problems.
 *
 * @example
 * ```ts
 * const msg = parseScript("<Message version='2017071'>…</Message>");
 * msg.asNewRx()?.medication?.description;
 * ```
 */
export function parseScript(raw: string, options?: ParseScriptOptions): ScriptMessage {
  const root = loadScriptXml(raw);
  if (root.name !== "Message") {
    throw new NcpdpScriptParseError(SCRIPT_FATAL_CODES.NO_MESSAGE_ROOT, {
      position: scriptPosition("/"),
    });
  }

  const warnings: NcpdpScriptWarning[] = [];
  classifyAndCheckVersion(root, warnings);

  const header = extractHeader(root);
  const body = extractBody(root, warnings);
  const profile = resolveProfile(options?.profile);

  return new ScriptMessage({
    header,
    body,
    warnings,
    ...(profile !== undefined ? { profile } : {}),
  });
}

/**
 * Convenience accessor: the {@link NewRx} body of a message, or `undefined`.
 *
 * @param message - A parsed {@link ScriptMessage}.
 * @returns The NewRx body, or `undefined` when the message is another transaction.
 *
 * @example
 * ```ts
 * const rx = newRx(parseScript(xml));
 * rx?.patient?.name?.lastName;
 * ```
 */
export function newRx(message: ScriptMessage): NewRx | undefined {
  return message.asNewRx();
}

/**
 * Convenience accessor: the `<Status>` (positive-acknowledgment) body of a
 * message, or `undefined`.
 *
 * @param message - A parsed {@link ScriptMessage}.
 * @returns The Status body, or `undefined` when the message is not a Status.
 *
 * @example
 * ```ts
 * status(parseScript(xml))?.code;
 * ```
 */
export function status(message: ScriptMessage): StatusBody | undefined {
  return message.asStatus();
}

/**
 * Convenience accessor: the `<Error>` (negative-acknowledgment) body of a
 * message, or `undefined`. An Error is never read as a success.
 *
 * @param message - A parsed {@link ScriptMessage}.
 * @returns The Error body, or `undefined` when the message is not an Error.
 *
 * @example
 * ```ts
 * error(parseScript(xml))?.code;
 * ```
 */
export function error(message: ScriptMessage): ErrorBody | undefined {
  return message.asError();
}

/**
 * Convenience accessor: the `<Verify>` (verification-acknowledgment) body of a
 * message, or `undefined`.
 *
 * @param message - A parsed {@link ScriptMessage}.
 * @returns The Verify body, or `undefined` when the message is not a Verify.
 *
 * @example
 * ```ts
 * verify(parseScript(xml))?.code;
 * ```
 */
export function verify(message: ScriptMessage): VerifyBody | undefined {
  return message.asVerify();
}

/**
 * Convenience accessor: the {@link RxRenewalRequest} body, or `undefined`.
 *
 * @param message - A parsed {@link ScriptMessage}.
 * @returns The renewal-request body, or `undefined`.
 *
 * @example
 * ```ts
 * rxRenewalRequest(parseScript(xml))?.medicationPrescribed?.description;
 * ```
 */
export function rxRenewalRequest(message: ScriptMessage): RxRenewalRequest | undefined {
  return message.body.kind === "RxRenewalRequest" ? message.body : undefined;
}

/**
 * Convenience accessor: the {@link RxRenewalResponse} body, or `undefined`. Read
 * `.outcome` for the prescriber's decision: a denial never reads as an approval.
 *
 * @param message - A parsed {@link ScriptMessage}.
 * @returns The renewal-response body, or `undefined`.
 *
 * @example
 * ```ts
 * rxRenewalResponse(parseScript(xml))?.outcome; // "approved" | "denied" | …
 * ```
 */
export function rxRenewalResponse(message: ScriptMessage): RxRenewalResponse | undefined {
  return message.body.kind === "RxRenewalResponse" ? message.body : undefined;
}

/**
 * Convenience accessor: the {@link RxChangeRequest} body, or `undefined`.
 *
 * @param message - A parsed {@link ScriptMessage}.
 * @returns The change-request body, or `undefined`.
 *
 * @example
 * ```ts
 * rxChangeRequest(parseScript(xml))?.medicationPrescribed?.description;
 * ```
 */
export function rxChangeRequest(message: ScriptMessage): RxChangeRequest | undefined {
  return message.body.kind === "RxChangeRequest" ? message.body : undefined;
}

/**
 * Convenience accessor: the {@link RxChangeResponse} body, or `undefined`.
 *
 * @param message - A parsed {@link ScriptMessage}.
 * @returns The change-response body, or `undefined`.
 *
 * @example
 * ```ts
 * rxChangeResponse(parseScript(xml))?.outcome; // "approved" | "denied" | "validated" | …
 * ```
 */
export function rxChangeResponse(message: ScriptMessage): RxChangeResponse | undefined {
  return message.body.kind === "RxChangeResponse" ? message.body : undefined;
}

/**
 * Convenience accessor: the {@link CancelRx} body, or `undefined`.
 *
 * @param message - A parsed {@link ScriptMessage}.
 * @returns The cancel body, or `undefined`.
 *
 * @example
 * ```ts
 * cancelRx(parseScript(xml))?.medicationPrescribed?.description;
 * ```
 */
export function cancelRx(message: ScriptMessage): CancelRx | undefined {
  return message.body.kind === "CancelRx" ? message.body : undefined;
}

/**
 * Convenience accessor: the {@link CancelRxResponse} body, or `undefined`.
 *
 * @param message - A parsed {@link ScriptMessage}.
 * @returns The cancel-response body, or `undefined`.
 *
 * @example
 * ```ts
 * cancelRxResponse(parseScript(xml))?.outcome; // "approved" | "denied" | …
 * ```
 */
export function cancelRxResponse(message: ScriptMessage): CancelRxResponse | undefined {
  return message.body.kind === "CancelRxResponse" ? message.body : undefined;
}

function classifyAndCheckVersion(root: XmlElement, warnings: NcpdpScriptWarning[]): void {
  const classification = classifyVersion(readVersion(root));
  const pos = scriptPosition("/Message");
  switch (classification.kind) {
    case "known":
      return;
    case "absent":
      warnings.push(scriptWarning(SCRIPT_WARNING_CODES.VERSION_ABSENT, pos));
      return;
    case "tolerated":
      warnings.push(scriptWarning(SCRIPT_WARNING_CODES.UNSUPPORTED_VERSION_TOLERATED, pos));
      return;
    case "unsupported":
      throw new NcpdpScriptParseError(SCRIPT_FATAL_CODES.UNSUPPORTED_VERSION, { position: pos });
  }
}

function extractBody(root: XmlElement, warnings: NcpdpScriptWarning[]): ScriptBody {
  const bodyEl = firstChild(root, "Body") ?? root;
  const bodyPath = bodyEl === root ? "/Message" : "/Message/Body";

  const newRxEl = firstChild(bodyEl, "NewRx");
  if (newRxEl !== undefined) {
    return extractNewRx(newRxEl, joinPath(bodyPath, "NewRx"), warnings);
  }

  const lifecycle = extractLifecycle(bodyEl, bodyPath, warnings);
  if (lifecycle !== undefined) {
    return lifecycle;
  }

  const response = extractResponseBody(bodyEl, bodyPath, warnings);
  if (response !== undefined) {
    return response;
  }

  const transaction = detectTransactionName(bodyEl);
  warnings.push(
    scriptWarning(
      SCRIPT_WARNING_CODES.UNSUPPORTED_TRANSACTION,
      // The path stops at the body. Descending one more step would put a
      // sender-chosen element name into `position.path`, which is the same leak
      // as putting it in the message, one field along.
      scriptPosition(bodyPath),
    ),
  );
  return transaction === undefined ? { kind: "unsupported" } : { kind: "unsupported", transaction };
}

/**
 * Response transaction names, in **fail-safe precedence order**: `Error` first,
 * so that a co-present `Status` can never mask a failure (see
 * {@link "../common/warnings".SCRIPT_WARNING_CODES.RESPONSE_AMBIGUOUS_DISPOSITION}).
 */
const RESPONSE_KINDS: readonly ResponseKind[] = ["Error", "Status", "Verify"];

/**
 * Detect and extract a `<Status>`/`<Error>`/`<Verify>` response body, or
 * `undefined` when the body is none of them. When more than one is present
 * (a malformed message), warns and reports the most conservative disposition
 * by {@link RESPONSE_KINDS} order.
 */
function extractResponseBody(
  bodyEl: XmlElement,
  bodyPath: string,
  warnings: NcpdpScriptWarning[],
): ResponseBody | undefined {
  const present = RESPONSE_KINDS.filter((kind) => firstChild(bodyEl, kind) !== undefined);
  const kind = present[0];
  if (kind === undefined) return undefined;

  if (present.length > 1) {
    warnings.push(
      scriptWarning(SCRIPT_WARNING_CODES.RESPONSE_AMBIGUOUS_DISPOSITION, scriptPosition(bodyPath)),
    );
  }

  const el = firstChild(bodyEl, kind);
  if (el === undefined) return undefined;
  return extractResponse(el, kind, joinPath(bodyPath, kind), warnings);
}

/** First non-`Header` child element name under the body, else `"unknown"`. */
/**
 * Name the unmodeled transaction, but only from a closed set this parser owns.
 *
 * A SCRIPT `<Body>` child is a name the sender chose, and copying it onto the
 * model hands every downstream package an unbounded string to interpolate: that
 * is exactly how a sibling parser bounded its warning messages, went green, and
 * still leaked through a consumer that read its model. So a name is surfaced
 * only when it is one of the SCRIPT transactions in
 * {@link SCRIPT_TRANSACTION_NAMES}; anything else yields `undefined`, and the
 * consumer locates it from the warning's position and the document it holds.
 *
 * The set is deliberately allowed to be incomplete: an unlisted-but-real SCRIPT
 * transaction is surfaced as unnamed, which costs a consumer a lookup. The
 * failure the other way costs a patient identifier in a log line.
 */
function detectTransactionName(bodyEl: XmlElement): string | undefined {
  const name = bodyEl.children.find((c) => c.name !== "Header")?.name;
  return name !== undefined && SCRIPT_TRANSACTION_NAME_SET.has(name) ? name : undefined;
}

import { NcpdpScriptParseError, SCRIPT_FATAL_CODES } from "../common/errors.js";
import { joinPath, scriptPosition } from "../common/position.js";
import {
  scriptWarning,
  SCRIPT_WARNING_CODES,
  type NcpdpScriptWarning,
} from "../common/warnings.js";
import { extractHeader, readVersion } from "./header.js";
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
import { classifyVersion } from "./versions.js";
import { loadScriptXml, type XmlElement } from "./xml-load.js";

/** Options for {@link parseScript}. Reserved for future tolerance toggles. */
export interface ParseScriptOptions {
  /** Placeholder for future strictness controls; ignored in this phase. */
  readonly _reserved?: never;
}

/**
 * Parse a raw NCPDP SCRIPT XML string into an immutable {@link ScriptMessage}.
 *
 * Liberal on input (Postel's Law): recoverable anomalies become warnings with
 * stable codes and XPath context. Fatal only for unrecoverable structure —
 * empty input, non-XML / entity-bearing input, a non-`<Message>` root, or a
 * pre-XML legacy SCRIPT version.
 *
 * @param raw - The raw SCRIPT XML.
 * @param _options - Reserved options (ignored in this phase).
 * @returns The parsed {@link ScriptMessage}.
 * @throws {NcpdpScriptParseError} On unrecoverable structural problems.
 *
 * @example
 * ```ts
 * const msg = parseScript("<Message version='2017071'>…</Message>");
 * msg.asNewRx()?.medication?.description;
 * ```
 */
export function parseScript(raw: string, _options?: ParseScriptOptions): ScriptMessage {
  const root = loadScriptXml(raw);
  if (root.name !== "Message") {
    throw new NcpdpScriptParseError(
      SCRIPT_FATAL_CODES.NO_MESSAGE_ROOT,
      `SCRIPT root element is <${root.name}>, expected <Message>.`,
      { position: scriptPosition(`/${root.name}`) },
    );
  }

  const warnings: NcpdpScriptWarning[] = [];
  classifyAndCheckVersion(root, warnings);

  const header = extractHeader(root);
  const body = extractBody(root, warnings);

  return new ScriptMessage({ header, body, warnings });
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

function classifyAndCheckVersion(root: XmlElement, warnings: NcpdpScriptWarning[]): void {
  const classification = classifyVersion(readVersion(root));
  const pos = scriptPosition("/Message");
  switch (classification.kind) {
    case "known":
      return;
    case "absent":
      warnings.push(
        scriptWarning(
          SCRIPT_WARNING_CODES.VERSION_ABSENT,
          "No SCRIPT version declared; parsed best-effort.",
          pos,
        ),
      );
      return;
    case "tolerated":
      warnings.push(
        scriptWarning(
          SCRIPT_WARNING_CODES.UNSUPPORTED_VERSION_TOLERATED,
          "SCRIPT version is not explicitly supported; parsed best-effort.",
          pos,
        ),
      );
      return;
    case "unsupported":
      throw new NcpdpScriptParseError(
        SCRIPT_FATAL_CODES.UNSUPPORTED_VERSION,
        "SCRIPT version predates the XML SCRIPT standard and is unsupported.",
        { position: pos },
      );
  }
}

function extractBody(root: XmlElement, warnings: NcpdpScriptWarning[]): ScriptBody {
  const bodyEl = firstChild(root, "Body") ?? root;
  const bodyPath = bodyEl === root ? "/Message" : "/Message/Body";

  const newRxEl = firstChild(bodyEl, "NewRx");
  if (newRxEl !== undefined) {
    return extractNewRx(newRxEl, joinPath(bodyPath, "NewRx"), warnings);
  }

  const response = extractResponseBody(bodyEl, bodyPath, warnings);
  if (response !== undefined) {
    return response;
  }

  const transaction = detectTransactionName(bodyEl);
  warnings.push(
    scriptWarning(
      SCRIPT_WARNING_CODES.UNSUPPORTED_TRANSACTION,
      `SCRIPT transaction <${transaction}> is not modeled in this phase; surfaced as unsupported.`,
      scriptPosition(joinPath(bodyPath, transaction)),
    ),
  );
  return { kind: "unsupported", transaction };
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
      scriptWarning(
        SCRIPT_WARNING_CODES.RESPONSE_AMBIGUOUS_DISPOSITION,
        `Multiple SCRIPT response transactions present (${present.join(", ")}); reporting the most conservative disposition.`,
        scriptPosition(bodyPath),
      ),
    );
  }

  const el = firstChild(bodyEl, kind);
  if (el === undefined) return undefined;
  return extractResponse(el, kind, joinPath(bodyPath, kind), warnings);
}

/** First non-`Header` child element name under the body, else `"unknown"`. */
function detectTransactionName(bodyEl: XmlElement): string {
  return bodyEl.children.find((c) => c.name !== "Header")?.name ?? "unknown";
}

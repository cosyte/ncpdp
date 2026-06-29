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

/** First non-`Header` child element name under the body, else `"unknown"`. */
function detectTransactionName(bodyEl: XmlElement): string {
  return bodyEl.children.find((c) => c.name !== "Header")?.name ?? "unknown";
}

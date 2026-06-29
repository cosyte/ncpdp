import { XMLParser } from "fast-xml-parser";
import { NcpdpScriptParseError, SCRIPT_FATAL_CODES } from "../common/errors.js";

/**
 * A namespace-stripped, immutable view of an XML element. This is the only XML
 * shape the rest of the SCRIPT parser sees — the `fast-xml-parser` output is
 * transformed into this tree at load time so downstream code never depends on
 * the parser's representation.
 */
export interface XmlElement {
  /** Local element name, namespace prefix stripped (e.g. `Message`). */
  readonly name: string;
  /** Attributes, prefix-stripped, in document order. */
  readonly attrs: Readonly<Record<string, string>>;
  /** Child elements, in document order. */
  readonly children: readonly XmlElement[];
  /** Concatenated direct text content, verbatim (not trimmed). */
  readonly text: string;
}

// Refuse any DOCTYPE/ENTITY declaration outright: this is the XXE / billion-laughs
// boundary. fast-xml-parser does not resolve entities, but we reject the input
// before it ever reaches the parser so malicious payloads cannot be smuggled in.
const FORBIDDEN_DECL_RE = /<!(?:DOCTYPE|ENTITY)\b/i;

const PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  ignoreDeclaration: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false,
  htmlEntities: false,
});

/**
 * Parse raw SCRIPT XML into an {@link XmlElement} tree, safely.
 *
 * Empty input throws `EMPTY_INPUT`; a forbidden DOCTYPE/ENTITY or malformed XML
 * throws `NCPDP_SCRIPT_NOT_XML`. On success the single root element is returned.
 *
 * @param raw - The raw SCRIPT XML text.
 * @returns The root {@link XmlElement}.
 * @throws {NcpdpScriptParseError} On empty, non-XML, or entity-bearing input.
 *
 * @example
 * ```ts
 * const root = loadScriptXml("<Message><Header/></Message>");
 * root.name; // "Message"
 * ```
 */
export function loadScriptXml(raw: string): XmlElement {
  if (raw.trim().length === 0) {
    throw new NcpdpScriptParseError(SCRIPT_FATAL_CODES.EMPTY_INPUT, "SCRIPT input is empty.");
  }
  if (FORBIDDEN_DECL_RE.test(raw)) {
    throw new NcpdpScriptParseError(
      SCRIPT_FATAL_CODES.NOT_XML,
      "SCRIPT input contains a DOCTYPE/ENTITY declaration, which is refused.",
      { snippet: raw },
    );
  }

  let parsed: unknown;
  try {
    parsed = PARSER.parse(raw);
  } catch {
    throw new NcpdpScriptParseError(
      SCRIPT_FATAL_CODES.NOT_XML,
      "SCRIPT input is not well-formed XML.",
      { snippet: raw },
    );
  }

  const roots = toElements(parsed);
  const root = roots[0];
  if (root === undefined) {
    throw new NcpdpScriptParseError(
      SCRIPT_FATAL_CODES.NOT_XML,
      "SCRIPT input has no XML element.",
      { snippet: raw },
    );
  }
  return root;
}

function stripNs(name: string): string {
  const colon = name.lastIndexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
}

/**
 * Transform one level of `fast-xml-parser`'s `preserveOrder` output into
 * {@link XmlElement} nodes. Each node in that format is an object with exactly
 * one tag key plus an optional `:@` attribute bag; text nodes use the `#text`
 * key.
 */
function toElements(nodes: unknown): XmlElement[] {
  if (!Array.isArray(nodes)) return [];
  const out: XmlElement[] = [];
  for (const node of nodes) {
    if (node === null || typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    const tagKey = Object.keys(record).find((k) => k !== ":@" && k !== "#text");
    if (tagKey === undefined) continue;

    const childNodes = record[tagKey];
    const attrs = readAttrs(record[":@"]);
    const children = toElements(childNodes);
    const text = readText(childNodes);

    out.push(
      Object.freeze({
        name: stripNs(tagKey),
        attrs,
        children: Object.freeze(children),
        text,
      }),
    );
  }
  return out;
}

function readAttrs(bag: unknown): Readonly<Record<string, string>> {
  const attrs: Record<string, string> = {};
  if (bag !== null && typeof bag === "object") {
    for (const [key, value] of Object.entries(bag as Record<string, unknown>)) {
      if (key.startsWith("@_")) {
        attrs[stripNs(key.slice(2))] = String(value);
      }
    }
  }
  return Object.freeze(attrs);
}

function readText(childNodes: unknown): string {
  if (!Array.isArray(childNodes)) return "";
  let text = "";
  for (const child of childNodes) {
    if (
      child !== null &&
      typeof child === "object" &&
      "#text" in (child as Record<string, unknown>)
    ) {
      text += String((child as Record<string, unknown>)["#text"]);
    }
  }
  return text;
}

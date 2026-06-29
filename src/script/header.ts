import { childText, firstChild } from "./nav.js";
import type { XmlElement } from "./xml-load.js";

/**
 * The SCRIPT `<Header>` fields useful for routing and correlation. Every field
 * is optional because real-world senders omit some; absence is `undefined`, not
 * an error (Postel's Law).
 */
export interface ScriptHeader {
  /** Declared SCRIPT version (root `version`/`Version`, or `<Header><Version>`). */
  readonly version?: string;
  /** Destination identifier (`<To>`). */
  readonly to?: string;
  /** Source identifier (`<From>`). */
  readonly from?: string;
  /** Unique message identifier (`<MessageID>`). */
  readonly messageId?: string;
  /** Correlated prior message identifier (`<RelatesToMessageID>`). */
  readonly relatesToMessageId?: string;
  /** Sender timestamp, verbatim (`<SentTime>`). */
  readonly sentTime?: string;
  /** Prescriber order number (`<PrescriberOrderNumber>`), when present. */
  readonly prescriberOrderNumber?: string;
}

/**
 * Read the declared SCRIPT version: prefer a root `version`/`Version` attribute
 * (the XML-era convention), falling back to a `<Header><Version>` element.
 *
 * @param message - The root `<Message>` element.
 * @returns The version string, or `undefined`.
 *
 * @example
 * ```ts
 * readVersion(messageEl); // "2017071" | undefined
 * ```
 */
export function readVersion(message: XmlElement): string | undefined {
  const attr = message.attrs["version"] ?? message.attrs["Version"];
  if (attr !== undefined && attr.trim().length > 0) return attr.trim();
  const header = firstChild(message, "Header");
  return header === undefined ? undefined : childText(header, "Version");
}

/**
 * Extract the {@link ScriptHeader} from a root `<Message>` element. Missing
 * fields are simply left `undefined`.
 *
 * @param message - The root `<Message>` element.
 * @returns A frozen {@link ScriptHeader}.
 *
 * @example
 * ```ts
 * const header = extractHeader(messageEl);
 * header.messageId; // "abc-123" | undefined
 * ```
 */
export function extractHeader(message: XmlElement): ScriptHeader {
  const header = firstChild(message, "Header");
  const out: Mutable<ScriptHeader> = {};

  const version = readVersion(message);
  if (version !== undefined) out.version = version;

  if (header !== undefined) {
    assignIfPresent(out, "to", childText(header, "To"));
    assignIfPresent(out, "from", childText(header, "From"));
    assignIfPresent(out, "messageId", childText(header, "MessageID"));
    assignIfPresent(out, "relatesToMessageId", childText(header, "RelatesToMessageID"));
    assignIfPresent(out, "sentTime", childText(header, "SentTime"));
    assignIfPresent(out, "prescriberOrderNumber", childText(header, "PrescriberOrderNumber"));
  }

  return Object.freeze(out);
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function assignIfPresent<T, K extends keyof T>(
  target: Mutable<T>,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) target[key] = value;
}

import { NcpdpScriptParseError, SCRIPT_FATAL_CODES } from "../common/errors.js";

/**
 * A namespace-stripped, immutable view of an XML element. This is the only XML
 * shape the rest of the SCRIPT parser sees.
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
// boundary. The reader below resolves no entity and never reads a document type
// declaration (it refuses any `<!D` markup too), but the input is rejected before
// it is read so a malicious payload cannot be smuggled in.
const FORBIDDEN_DECL_RE = /<!(?:DOCTYPE|ENTITY)\b/i;

/**
 * The deepest element nesting the reader accepts: an element opened while this
 * many are already open beneath the document refuses the input. A bound on the
 * reader's own stack, so a hostile document cannot make it grow without limit.
 */
const MAX_NESTED = 100;

/**
 * Element names that would reach a JavaScript object's own machinery. One of the
 * first three refuses the document; one of the rest is read with a `__` prefix,
 * so no element is ever named after a method every object has.
 */
const CRITICAL_NAMES: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
const GUARDED_NAMES: ReadonlySet<string> = new Set([
  "hasOwnProperty",
  "toString",
  "valueOf",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

/** The one attribute bag every element without attributes shares. */
const NO_ATTRS: Readonly<Record<string, string>> = Object.freeze({});

/** A malformed document: caught by {@link loadScriptXml} and refused as `NOT_XML`. */
class NotXml extends Error {}

function guardName(name: string): string {
  if (CRITICAL_NAMES.has(name)) throw new NotXml();
  return GUARDED_NAMES.has(name) ? `__${name}` : name;
}

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
    throw new NcpdpScriptParseError(SCRIPT_FATAL_CODES.EMPTY_INPUT);
  }
  if (FORBIDDEN_DECL_RE.test(raw)) {
    throw new NcpdpScriptParseError(SCRIPT_FATAL_CODES.NOT_XML);
  }

  let root: XmlElement | undefined;
  try {
    root = readXml(raw);
  } catch (error) {
    /* v8 ignore next -- the reader throws only NotXml; anything else is a defect, not malformed input */
    if (!(error instanceof NotXml)) throw error;
    throw new NcpdpScriptParseError(SCRIPT_FATAL_CODES.NOT_XML);
  }
  if (root === undefined) {
    throw new NcpdpScriptParseError(SCRIPT_FATAL_CODES.NOT_XML);
  }
  return root;
}

function stripNs(name: string): string {
  const colon = name.lastIndexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
}

/** An element while it is open: its text and children still grow. Frozen when it closes. */
interface OpenElement {
  name: string;
  attrs: Readonly<Record<string, string>>;
  children: XmlElement[];
  text: string;
}

/** The children of every element that has none, shared until a first child arrives. */
const NO_CHILDREN: XmlElement[] = Object.freeze([]) as unknown as XmlElement[];

/** The tag of the document node, and of any element that carries the same name. */
const DOCUMENT_TAG = "!xml";

function freeze(el: OpenElement | undefined): void {
  if (el === undefined) return;
  Object.freeze(el.children);
  Object.freeze(el);
}

const WHITESPACE_RE = /\s/;
const ATTR_RE = /([^\s=]+)\s*(=\s*(['"])([\s\S]*?)\3)?/g;

/**
 * Whether a closing tag's text, from `from` to `to`, could name one of the
 * critical names once trimmed. Read without slicing: only a run that starts,
 * after ASCII spaces, with `_`, `c` or `p` (or with any other whitespace) is
 * sliced and checked.
 */
function mayBeCritical(xml: string, from: number, to: number): boolean {
  let k = from;
  while (k < to) {
    const code = xml.charCodeAt(k);
    if (code !== 32 && code !== 10 && code !== 9) break;
    k++;
  }
  if (to - k < 9) return false;
  const code = xml.charCodeAt(k);
  return (
    code === 95 || code === 99 || code === 112 || code > 127 || WHITESPACE_RE.test(xml.charAt(k))
  );
}

/**
 * Read a document into its first top-level element.
 *
 * A single pass over the text with no intermediate tree: each element's text is
 * sliced out of the document, never built a character at a time, so a large
 * text value costs its own bytes and no more. The reader is lenient in the same
 * places and strict in the same places as the XML parser this package used
 * before it, which the output-equivalence corpus and a differential property
 * test hold it to:
 *
 * - carriage returns are read as line feeds (`\r\n` and a lone `\r` both);
 * - an element's text is every character data run directly inside it, CDATA
 *   content included, comments and processing instructions left out; text that
 *   is never followed by markup is dropped, and so is text directly ahead of a
 *   tag at the document level;
 * - a closing tag closes the element open at that point, whatever name it
 *   carries, and an element never closed is kept as read so far;
 * - entity references are kept verbatim, never resolved;
 * - an attribute is read only with a quoted value, the last of a repeated name
 *   winning in the place of the first;
 * - an element named `:@`, and a self-closing one named `#text`, is not read,
 *   nor is anything under it; `<?>` reads as an empty element with no name;
 * - an unterminated tag, comment, CDATA section or processing instruction, a
 *   `<!D` declaration, nesting deeper than {@link MAX_NESTED}, and an element
 *   named after an object's prototype machinery refuse the document.
 */
class XmlReader {
  private readonly xml: string;
  /** The open elements' parents, outermost first, with the tag each was opened by. */
  private readonly els: (OpenElement | undefined)[] = [];
  private readonly tags: string[] = [];
  /** The element text goes to, or undefined at the document level or under one not read. */
  private el: OpenElement | undefined = undefined;
  private tag: string = DOCUMENT_TAG;
  /** Whether the current node is read: the document, or an element that is. */
  private reading = true;
  private first: XmlElement | undefined = undefined;
  /** Text read since the last tag: the runs before any comment, then the run from `textStart`. */
  private pending = "";
  private textStart = 0;
  /** The text of the last tag {@link scanTag} read, and the index of its closing `>`. */
  private tagData = "";
  private tagEnd = 0;

  public constructor(raw: string) {
    this.xml = raw.includes("\r") ? raw.replace(/\r\n?/g, "\n") : raw;
  }

  public read(): XmlElement | undefined {
    const xml = this.xml;
    let i = xml.indexOf("<");
    while (i !== -1) {
      const c1 = xml.charCodeAt(i + 1);
      if (c1 === 47) {
        // A closing tag: `</name>`.
        const end = xml.indexOf(">", i);
        if (end === -1) throw new NotXml();
        if (mayBeCritical(xml, i + 2, end)) guardName(xml.substring(i + 2, end).trim());
        this.flush(i);
        freeze(this.el);
        this.pop();
        i = end;
      } else if (c1 === 63) {
        // A processing instruction (the XML declaration among them): never an element.
        if (!this.scanTag(i + 1, true)) throw new NotXml();
        this.flush(i);
        // `<?>` closes on its own `?`: it names no target and reads as an empty element.
        if (this.tagData === "" && this.reading) {
          const el: OpenElement = { name: "", attrs: NO_ATTRS, children: NO_CHILDREN, text: "" };
          this.attach(el);
          freeze(el);
        }
        i = this.tagEnd;
      } else if (c1 === 33 && xml.charCodeAt(i + 2) === 45 && xml.charCodeAt(i + 3) === 45) {
        // A comment: the text on either side of it runs on as one.
        const end = xml.indexOf("-->", i + 4);
        if (end === -1) throw new NotXml();
        if (i > this.textStart) this.pending += xml.slice(this.textStart, i);
        this.textStart = end + 3;
        i = xml.indexOf("<", this.textStart);
        continue;
      } else if (c1 === 33 && xml.charCodeAt(i + 2) === 68) {
        // `<!D`: a document type declaration, which this reader never reads.
        throw new NotXml();
      } else if (c1 === 33 && xml.charCodeAt(i + 2) === 91) {
        // A CDATA section: its content is text, verbatim.
        const end = xml.indexOf("]]>", i);
        if (end === -1) throw new NotXml();
        this.flush(i);
        const content = xml.substring(i + 9, end);
        if (content.length > 0 && this.el !== undefined) this.el.text += content;
        i = end + 2;
      } else {
        this.openTag(i);
        i = this.tagEnd;
      }
      this.textStart = i + 1;
      i = xml.indexOf("<", this.textStart);
    }
    // Every element still open is kept as read so far, innermost first.
    freeze(this.el);
    for (let k = this.els.length - 1; k >= 0; k--) freeze(this.els[k]);
    return this.first;
  }

  /** Close the current node: its parent becomes current, or the document when none is open. */
  private pop(): void {
    if (this.els.length === 0) {
      this.el = undefined;
      this.tag = DOCUMENT_TAG;
      this.reading = true;
      return;
    }
    this.el = this.els.pop();
    this.tag = this.tags.pop() as string;
    this.reading = this.el !== undefined || (this.tag === DOCUMENT_TAG && this.els.length === 0);
  }

  /** Give the text read since the last tag, up to `upTo`, to the current element. */
  private flush(upTo: number): void {
    const run = upTo > this.textStart ? this.xml.slice(this.textStart, upTo) : "";
    const text = this.pending === "" ? run : this.pending + run;
    this.pending = "";
    if (text.length > 0 && this.el !== undefined) this.el.text += text;
  }

  /** Put a new element under the current one, or make it the root. */
  private attach(el: OpenElement): void {
    const parent = this.el;
    if (parent !== undefined) {
      if (parent.children === NO_CHILDREN) parent.children = [el];
      else parent.children.push(el);
    } else {
      // Only the document level reads an element with no parent element.
      this.first ??= el as XmlElement;
    }
  }

  /**
   * Read an opening or self-closing tag at `at`, attach its element and, for an
   * opening tag, make it the current element.
   */
  private openTag(at: number): void {
    if (!this.scanTag(at + 1, false)) throw new NotXml();
    const data = this.tagData;
    const space = data.search(WHITESPACE_RE);
    let name = guardName(space === -1 ? data : data.slice(0, space));
    let rest = space === -1 ? data : data.slice(space + 1).trimStart();
    if (name === "#text") throw new NotXml();
    // Text before a child tag belongs to its parent, but not at the document level.
    if (this.tag !== DOCUMENT_TAG) this.flush(at);
    else this.pending = "";

    let selfClosing = false;
    let hasAttrs = true;
    if (rest.length > 0 && rest.charCodeAt(rest.length - 1) === 47) {
      selfClosing = true;
      if (name.endsWith("/")) {
        name = name.slice(0, -1);
        rest = name;
      } else {
        rest = rest.slice(0, -1);
      }
      hasAttrs = name !== rest;
    }
    const attrs = name !== rest && hasAttrs ? readAttrs(rest) : NO_ATTRS;

    if (selfClosing) name = guardName(name);
    else if (this.els.length > MAX_NESTED) throw new NotXml();
    // Two names are never read as an element: `:@`, and `#text` (which only a
    // self-closing tag can carry). Nothing under an element that is not read is
    // read either.
    const el: OpenElement | undefined =
      name === ":@" || name === "#text" || !this.reading
        ? undefined
        : { name: stripNs(name), attrs, children: NO_CHILDREN, text: "" };
    if (el !== undefined) this.attach(el);
    if (selfClosing) {
      freeze(el);
      return;
    }
    this.els.push(this.el);
    this.tags.push(this.tag);
    this.el = el;
    this.tag = name;
    this.reading = el !== undefined;
  }

  /**
   * Read the text of a tag from `from` (just past its `<`) up to its closing `>`
   * (or `?>` for a processing instruction), skipping any `>` inside a quoted
   * value; a tab outside quotes reads as a space. Leaves the text in `tagData`
   * and the index of the closing `>` in `tagEnd`. False when the tag never closes.
   */
  private scanTag(from: number, pi: boolean): boolean {
    const xml = this.xml;
    const len = xml.length;
    let quote = 0;
    let data = "";
    let start = from;
    for (let k = from; k < len; k++) {
      const code = xml.charCodeAt(k);
      if (quote !== 0) {
        if (code === quote) quote = 0;
      } else if (code === 34 || code === 39) {
        quote = code;
      } else if (pi ? code === 63 && xml.charCodeAt(k + 1) === 62 : code === 62) {
        this.tagData = start === from ? xml.slice(from, k) : data + xml.slice(start, k);
        this.tagEnd = pi ? k + 1 : k;
        return true;
      } else if (code === 9) {
        data += `${xml.slice(start, k)} `;
        start = k + 1;
      }
    }
    return false;
  }
}

function readXml(raw: string): XmlElement | undefined {
  return new XmlReader(raw).read();
}

/**
 * The attributes of a tag: each name with a quoted value, the prefix stripped,
 * in the order each name was first seen, the last value of a repeated one kept.
 */
function readAttrs(text: string): Readonly<Record<string, string>> {
  // Keyed by the raw name first, as the wire carries it, then by the stripped name.
  const raw = new Map<string, string>();
  ATTR_RE.lastIndex = 0;
  for (let m = ATTR_RE.exec(text); m !== null; m = ATTR_RE.exec(text)) {
    const value = m[4];
    if (value !== undefined) raw.set(m[1] as string, value);
  }
  if (raw.size === 0) return NO_ATTRS;
  const attrs: Record<string, string> = {};
  for (const [name, value] of raw) attrs[stripNs(name)] = value;
  return Object.freeze(attrs);
}

/**
 * The output-equivalence corpus: synthetic SCRIPT and Telecom messages and builder inputs, and the
 * functions that record everything a caller can observe of the library on each one.
 *
 * `test/output-equivalence.test.ts` holds the library to the digests in
 * `test/fixtures/equivalence/output-digests.json`, which were captured from the source before the
 * allocation and import work on the Telecom tokenizer and views, the SCRIPT XML loader and the
 * writers. A change that moves one observable byte (a parsed field, a warning, its order or
 * position, a typed read, a built or serialized text, an error's class, code or message, or whether
 * a returned object is frozen) changes a digest.
 *
 * Every message is synthetic: this package's own fixtures, the benchmark shapes at small sizes,
 * messages written here for the paths the work touches (a note that carries markup, CDATA, a
 * comment, a processing instruction or a stray `<`; repeated segments and fields; transmission-level
 * segments that a transaction's own repeat), and mutants of all of those drawn on a fixed seed.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  KIB,
  b1Batch,
  b1Claim,
  b1Request,
  b1Wide,
  medicationHistory,
  newRx,
  newRxInput,
  noteNewRx,
  noteNewRxInput,
} from "../../bench/shapes.mjs";
import {
  adjudication,
  buildNewRx,
  buildScriptResponse,
  buildTelecomRequest,
  cancelRx,
  cancelRxResponse,
  claim,
  claimView,
  cobOtherPayments,
  collectCobWarnings,
  collectCompoundWarnings,
  collectDurWarnings,
  collectResponseWarnings,
  compound,
  error as scriptError,
  extractStructuredSig,
  fieldValue,
  fieldValues,
  findSegment,
  newRx as scriptNewRx,
  parseScript,
  parseTelecom,
  partitionWarnings,
  priorAuthorization,
  profiles,
  requestDur,
  responseCob,
  responseDur,
  responsePricing,
  responseStatus,
  rxChangeRequest,
  rxChangeResponse,
  rxRenewalRequest,
  rxRenewalResponse,
  serializeScript,
  serializeTelecom,
  splitWithOffsets,
  status as scriptStatus,
  tokenizeBody,
  tokenizeTransactions,
  tokenizeTransmission,
  verify as scriptVerify,
  type NcpdpScriptWarning,
  type NcpdpTelecomWarning,
  type NewRxInput,
  type ScriptMessage,
  type ScriptResponseInput,
  type TelecomRequestInput,
  type TelecomSegment,
  type TelecomTransaction,
  type XmlElement,
} from "../../src/index.js";
import { loadScriptXml } from "../../src/script/xml-load.js";
import {
  FS,
  GS,
  RS,
  buildResponseTransmission,
  buildTransmission,
  syntheticB1,
  syntheticCompoundClaim,
  syntheticMultiTransactionRequest,
  syntheticMultiTransactionRequestMalformedSecond,
  syntheticMultiTransactionResponse,
  syntheticNineTransactionRequest,
  syntheticSecondaryClaim,
} from "./build-telecom.js";

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Recording what a caller can observe.
// ---------------------------------------------------------------------------

/**
 * Write `value` as deterministic text: every own enumerable key in its order, whether each object
 * and array is frozen, an error by its class, code and message. Key order is kept, not sorted,
 * because it is observable through `JSON.stringify` and `Object.keys`.
 */
export function record(value: unknown): string {
  const out: string[] = [];
  write(value, out, 0);
  return out.join("");
}

function write(value: unknown, out: string[], depth: number): void {
  if (depth > 400) throw new Error("record: nested past 400 levels");
  if (value === undefined) {
    out.push("u");
    return;
  }
  if (value === null) {
    out.push("n");
    return;
  }
  switch (typeof value) {
    case "string":
      out.push(JSON.stringify(value));
      return;
    case "number":
      out.push(`#${Object.is(value, -0) ? "-0" : String(value)}`);
      return;
    case "boolean":
      out.push(value ? "T" : "F");
      return;
    case "bigint":
      out.push(`${String(value)}n`);
      return;
    case "function":
      out.push("fn");
      return;
    case "symbol":
      out.push("sym");
      return;
    default:
      break;
  }
  if (value instanceof Error) {
    out.push(`err(${value.constructor.name},${JSON.stringify(value.message)},`);
    writeObject(value as unknown as Record<string, unknown>, out, depth);
    out.push(")");
    return;
  }
  if (Array.isArray(value)) {
    out.push(Object.isFrozen(value) ? "[F" : "[M");
    for (const item of value as readonly unknown[]) {
      out.push(",");
      write(item, out, depth + 1);
    }
    out.push("]");
    return;
  }
  if (value instanceof Map) {
    out.push("map{");
    for (const [k, v] of value as Map<unknown, unknown>) {
      write(k, out, depth + 1);
      out.push("=>");
      write(v, out, depth + 1);
      out.push(";");
    }
    out.push("}");
    return;
  }
  if (value instanceof Set) {
    out.push("set{");
    for (const v of value as Set<unknown>) {
      write(v, out, depth + 1);
      out.push(";");
    }
    out.push("}");
    return;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  const kind =
    proto === Object.prototype || proto === null
      ? ""
      : `${String((proto as { constructor?: { name?: unknown } }).constructor?.name)}`;
  out.push(`${kind}{${Object.isFrozen(value) ? "F" : "M"}`);
  writeObject(value as Record<string, unknown>, out, depth);
  out.push("}");
}

function writeObject(value: Record<string, unknown>, out: string[], depth: number): void {
  for (const key of Object.keys(value)) {
    out.push(`,${JSON.stringify(key)}:`);
    write(value[key], out, depth + 1);
  }
}

/** Run `fn` and record its result, or the error it threw. */
function attempt(fn: () => unknown): string {
  try {
    return `ok:${record(fn())}`;
  } catch (error) {
    return `throw:${record(error)}`;
  }
}

/** A recorder that collects lines for one input and hashes them. */
class Observation {
  private readonly hash = createHash("sha256");
  private lines = 0;

  public add(label: string, text: string): void {
    this.hash.update(label);
    this.hash.update("\u0000");
    this.hash.update(text);
    this.hash.update("\u0001");
    this.lines += 1;
  }

  public digest(): string {
    return `${this.hash.digest("hex")}:${String(this.lines)}`;
  }
}

// ---------------------------------------------------------------------------
// What is observed of a SCRIPT message.
// ---------------------------------------------------------------------------

/** Every element named `name` under `el`, in document order. */
function descendants(el: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  if (el.name === name) out.push(el);
  for (const child of el.children) descendants(child, name, out);
  return out;
}

/** Every typed read of a parsed SCRIPT message. */
function observeMessage(obs: Observation, label: string, message: ScriptMessage): void {
  obs.add(`${label}:message`, record(message));
  obs.add(
    `${label}:asNewRx`,
    attempt(() => message.asNewRx()),
  );
  obs.add(
    `${label}:asStatus`,
    attempt(() => message.asStatus()),
  );
  obs.add(
    `${label}:asError`,
    attempt(() => message.asError()),
  );
  obs.add(
    `${label}:asVerify`,
    attempt(() => message.asVerify()),
  );
  obs.add(
    `${label}:asLifecycleRequest`,
    attempt(() => message.asLifecycleRequest()),
  );
  obs.add(
    `${label}:asLifecycleResponse`,
    attempt(() => message.asLifecycleResponse()),
  );
  obs.add(
    `${label}:disposition`,
    attempt(() => message.disposition),
  );
  obs.add(
    `${label}:correlatesTo`,
    attempt(() => message.correlatesTo),
  );
  const free = [
    scriptNewRx,
    scriptStatus,
    scriptError,
    scriptVerify,
    rxRenewalRequest,
    rxRenewalResponse,
    rxChangeRequest,
    rxChangeResponse,
    cancelRx,
    cancelRxResponse,
  ];
  obs.add(`${label}:free`, free.map((fn) => attempt(() => fn(message))).join("|"));
  obs.add(
    `${label}:toString`,
    attempt(() => message.toString()),
  );
  obs.add(
    `${label}:serialize`,
    attempt(() => serializeScript(message)),
  );
  obs.add(
    `${label}:partition`,
    attempt(() => partitionWarnings(message.warnings, profiles.surescripts)),
  );
}

/** Everything observable of one SCRIPT input. */
export function observeScript(raw: string): string {
  const obs = new Observation();
  // The loaded tree is not public, but every typed read is drawn from it: holding it to the base
  // catches a difference no extractor happens to read.
  obs.add(
    "tree",
    attempt(() => loadScriptXml(raw)),
  );
  let parsed: ScriptMessage | undefined;
  obs.add(
    "parse",
    attempt(() => {
      parsed = parseScript(raw);
      return parsed.warnings;
    }),
  );
  if (parsed !== undefined) {
    observeMessage(obs, "plain", parsed);
    const message = parsed;
    const reparsed = attempt(() => observeScriptText(serializeScript(message)));
    obs.add("reparse", reparsed);
  }
  obs.add(
    "profiled",
    attempt(() => record(parseScript(raw, { profile: profiles.surescripts }))),
  );
  obs.add(
    "unprofiled",
    attempt(() => record(parseScript(raw, { profile: null }))),
  );
  // The structured sig reader, on every MedicationPrescribed the loader found.
  const sigs = attempt(() => {
    const root = loadScriptXml(raw);
    return descendants(root, "MedicationPrescribed").map((el, i) => {
      const warnings: NcpdpScriptWarning[] = [];
      const sig = extractStructuredSig(el, `/m/${String(i)}`, warnings);
      return [sig, warnings];
    });
  });
  obs.add("sigs", sigs);
  return obs.digest();
}

/** The typed reads of a message parsed from text, as one record. */
function observeScriptText(raw: string): string {
  const message = parseScript(raw);
  return `${record(message)}|${attempt(() => message.asNewRx())}|${attempt(() => message.disposition)}`;
}

// ---------------------------------------------------------------------------
// What is observed of a Telecom transmission.
// ---------------------------------------------------------------------------

/** Every view of one transaction index. */
function observeIndex(transaction: TelecomTransaction, index: number): string {
  return [
    attempt(() => claim(transaction, index)),
    attempt(() => requestDur(transaction, index)),
    attempt(() => compound(transaction, index)),
    attempt(() => cobOtherPayments(transaction, index)),
    attempt(() => priorAuthorization(transaction, index)),
    attempt(() => responseStatus(transaction, index)),
    attempt(() => responsePricing(transaction, index)),
    attempt(() => responseDur(transaction, index)),
    attempt(() => adjudication(transaction, index)),
    attempt(() => responseCob(transaction, index)),
  ].join("|");
}

/** The segment readers over one segment list, for every id it carries and some it does not. */
function observeSegments(segments: readonly TelecomSegment[]): string {
  const segmentIds = new Set<string>(["", "99", "07"]);
  const fieldIds = new Set<string>(["", "ZZ", "D7", "AM"]);
  for (const seg of segments) {
    segmentIds.add(seg.segmentId);
    for (const field of seg.fields) fieldIds.add(field.id);
  }
  const read: string[] = [];
  for (const id of segmentIds) {
    const seg = findSegment(segments, id);
    read.push(record(seg?.byteOffset));
    for (const fieldId of fieldIds) {
      read.push(attempt(() => fieldValue(seg, fieldId)));
      read.push(attempt(() => fieldValues(seg, fieldId)));
    }
  }
  for (const code of ["B1", "B2", "B3", "E1", ""]) {
    read.push(attempt(() => claimView(code, segments)));
  }
  const sinks = [
    collectCompoundWarnings,
    collectCobWarnings,
    collectDurWarnings,
    collectResponseWarnings,
  ];
  for (const collect of sinks) {
    const warnings: NcpdpTelecomWarning[] = [];
    read.push(attempt(() => collect(segments, warnings)));
    read.push(record(warnings));
  }
  return read.join("|");
}

/** Every view and reader of a parsed or built transmission. */
function observeTransmission(obs: Observation, label: string, t: TelecomTransaction): void {
  obs.add(`${label}:model`, record(t));
  const views: string[] = [];
  for (let index = -1; index <= t.transactions.length + 1; index++) {
    views.push(observeIndex(t, index));
  }
  views.push(attempt(() => claim(t)));
  obs.add(`${label}:views`, views.join("\n"));
  obs.add(`${label}:segments`, observeSegments(t.segments));
  obs.add(`${label}:shared`, observeSegments(t.transmissionSegments));
  t.transactions.forEach((entry, i) => {
    obs.add(`${label}:own:${String(i)}`, observeSegments(entry.segments));
  });
  obs.add(
    `${label}:serialize`,
    attempt(() => serializeTelecom(t)),
  );
  obs.add(
    `${label}:partition`,
    attempt(() => partitionWarnings(t.warnings, profiles.pbm)),
  );
}

/** Everything observable of one Telecom input. */
export function observeTelecom(raw: string): string {
  const obs = new Observation();
  let parsed: TelecomTransaction | undefined;
  obs.add(
    "parse",
    attempt(() => {
      parsed = parseTelecom(raw);
      return parsed.kind;
    }),
  );
  if (parsed !== undefined) observeTransmission(obs, "plain", parsed);
  obs.add(
    "buffer",
    attempt(() => record(parseTelecom(Buffer.from(raw, "latin1")))),
  );
  obs.add(
    "profiled",
    attempt(() => record(parseTelecom(raw, { profile: profiles.pbm }))),
  );
  const body = raw.length > 56 ? raw.slice(56) : raw;
  obs.add(
    "tokenizeTransmission",
    attempt(() => tokenizeTransmission(body, 56)),
  );
  obs.add(
    "tokenizeTransactions",
    attempt(() => tokenizeTransactions(body, 56)),
  );
  const sink: NcpdpTelecomWarning[] = [];
  obs.add("tokenizeBody", `${attempt(() => tokenizeBody(body, 56, sink))}|${record(sink)}`);
  obs.add(
    "split",
    [FS, GS, RS].map((sep) => attempt(() => splitWithOffsets(raw, sep, 3))).join("|"),
  );
  return obs.digest();
}

// ---------------------------------------------------------------------------
// Builds.
// ---------------------------------------------------------------------------

/** Everything observable of a NewRx build. */
export function observeNewRxBuild(input: NewRxInput): string {
  const obs = new Observation();
  let built: ScriptMessage | undefined;
  obs.add(
    "build",
    attempt(() => {
      built = buildNewRx(input);
      return built.header;
    }),
  );
  if (built !== undefined) observeMessage(obs, "built", built);
  return obs.digest();
}

/** Everything observable of a SCRIPT response build. */
export function observeResponseBuild(input: ScriptResponseInput): string {
  const obs = new Observation();
  let built: ScriptMessage | undefined;
  obs.add(
    "build",
    attempt(() => {
      built = buildScriptResponse(input);
      return built.header;
    }),
  );
  if (built !== undefined) observeMessage(obs, "built", built);
  return obs.digest();
}

/** Everything observable of a Telecom request build. */
export function observeTelecomBuild(input: TelecomRequestInput): string {
  const obs = new Observation();
  let built: TelecomTransaction | undefined;
  obs.add(
    "build",
    attempt(() => {
      built = buildTelecomRequest(input);
      return built.kind;
    }),
  );
  if (built !== undefined) {
    observeTransmission(obs, "built", built);
    const text = attempt(() => serializeTelecom(built as TelecomTransaction));
    obs.add("text", text);
  }
  return obs.digest();
}

// ---------------------------------------------------------------------------
// The corpus.
// ---------------------------------------------------------------------------

/** A fixed linear congruential sequence, so every run draws the same mutants. */
function lcg(seed: number): () => number {
  let state = (seed * 2654435761 + 1) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** `count` mutants of `text`: a cut, a doubled run, or an inserted fragment from `pool`. */
function mutants(text: string, count: number, seed: number, pool: readonly string[]): string[] {
  const next = lcg(seed);
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    let s = text;
    const edits = 1 + Math.floor(next() * 3);
    for (let e = 0; e < edits; e++) {
      const at = Math.floor(next() * (s.length + 1));
      const kind = Math.floor(next() * 3);
      if (kind === 0) {
        const len = 1 + Math.floor(next() * 12);
        s = s.slice(0, at) + s.slice(at + len);
      } else if (kind === 1) {
        const len = 1 + Math.floor(next() * 24);
        s = s.slice(0, at + len) + s.slice(at, at + len) + s.slice(at + len);
      } else {
        const piece = pool[Math.floor(next() * pool.length)] ?? "";
        s = s.slice(0, at) + piece + s.slice(at);
      }
    }
    out.push(s);
  }
  return out;
}

const XML_POOL = [
  "<",
  ">",
  "</",
  "/>",
  "&",
  "&amp;",
  "&lt;",
  "&#60;",
  "<![CDATA[x<y]]>",
  "<!-- c -->",
  "<?pi data?>",
  "\r\n",
  "\r",
  "\t",
  " ",
  '"',
  "'",
  "=",
  "<Note>",
  "</Note>",
  "<Note/>",
  "<x:Note>",
  "</Body>",
  "<Extra a='1'>t</Extra>",
  "é",
  "😀",
];

const TELECOM_POOL = [
  FS,
  GS,
  RS,
  "AM",
  "AM07",
  "AM0",
  "D7",
  "FB",
  "4C",
  "TE",
  "E4",
  "\r\n",
  " ",
  "x",
];

export interface CorpusInput {
  readonly label: string;
  readonly text: string;
}

function scriptFixtures(): CorpusInput[] {
  const dir = join(here, "..", "fixtures", "script");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".xml"))
    .sort()
    .map((f) => ({ label: `fixture:${f}`, text: readFileSync(join(dir, f), "utf8") }));
}

function telecomFixtures(): CorpusInput[] {
  const dir = join(here, "..", "fixtures", "telecom");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ncpdp"))
    .sort()
    .map((f) => ({ label: `fixture:${f}`, text: readFileSync(join(dir, f), "utf8") }));
}

/** A NewRx from the bench shape with its note element replaced by `note`. */
function withNote(i: number, note: string): string {
  return newRx(i).replace(/<Note>[^<]*<\/Note>/, note);
}

/** Note shapes for the paths the large-text work touches. */
function noteCases(): CorpusInput[] {
  const notes: Record<string, string> = {
    plain: "<Note>plain text</Note>",
    empty: "<Note></Note>",
    selfClosing: "<Note/>",
    selfClosingSpaced: "<Note />",
    attrs: '<Note lang="en" a:b="c">with attrs</Note>',
    spaces: "<Note>   padded   </Note>",
    newlines: "<Note>\n line one\r\n line two\r line three\n</Note>",
    entities: "<Note>a &amp; b &lt; c &gt; d &quot;e&quot; &#38; &#x3C; &unknown;</Note>",
    gt: "<Note>a > b</Note>",
    cdata: "<Note><![CDATA[a <b> & c]]></Note>",
    cdataMixed: "<Note>before<![CDATA[ in ]]>after</Note>",
    comment: "<Note>before<!-- a comment -->after</Note>",
    commentOnly: "<Note><!-- only --></Note>",
    pi: "<Note>before<?pi x?>after</Note>",
    child: "<Note>before<B>bold</B>after</Note>",
    nested: "<Note><Note>inner</Note>outer</Note>",
    selfChild: "<Note>a<Br/>b</Note>",
    strayLt: "<Note>a < b</Note>",
    mismatched: "<Note>text</Other>",
    unclosed: "<Note>never closed",
    closeSpaced: "<Note>spaced close</Note >",
    namespaced: "<s:Note>prefixed</s:Note>",
    namespacedMixed: "<s:Note>prefixed</Note>",
    twoNotes: "<Note>first</Note><Note>second</Note>",
    unicode: "<Note>café 😀  nbsp</Note>",
    tab: "<Note>\ttabbed\t</Note>",
    longLine: `<Note>${"QUJD".repeat(4096)}</Note>`,
    longWrapped: `<Note>${"QUJDREVG\n".repeat(2048)}</Note>`,
    longWithLt: `<Note>${"QUJD".repeat(2048)}<B/>${"QUJD".repeat(2048)}</Note>`,
    noteInAttr: '<Note a="</Note>">attr closes</Note>',
    noteCaseVariant: "<note>lower</note>",
    lifecycleNote: "<Note>x</Note>",
  };
  const out: CorpusInput[] = [];
  let i = 0;
  for (const [name, note] of Object.entries(notes)) {
    out.push({ label: `note:${name}`, text: withNote(i % 8, note) });
    i++;
  }
  return out;
}

/** XML shapes the loader reads before and around the root. */
function xmlEdgeCases(): CorpusInput[] {
  const base = newRx(3);
  const cases: Record<string, string> = {
    empty: "",
    blank: "  \n\t ",
    notXml: "just text",
    noRoot: '<?xml version="1.0"?>',
    doctype: '<!DOCTYPE Message [<!ENTITY a "b">]><Message/>',
    entityDecl: '<!ENTITY a "b"><Message/>',
    otherRoot: "<Other/>",
    rootOnly: "<Message/>",
    rootNs:
      '<ns:Message xmlns:ns="u" version="2017071"><ns:Body><ns:NewRx/></ns:Body></ns:Message>',
    stylesheet: `<?xml-stylesheet href="a"?>${base}`,
    bom: `﻿${base}`,
    crlf: base.replace(/\n/g, "\r\n"),
    cr: base.replace(/\n/g, "\r"),
    tabs: base.replace(/ {2}/g, "\t"),
    trailing: `${base}<Trailing/>`,
    twoRoots: `${base}${base}`,
    truncated: base.slice(0, Math.floor(base.length / 2)),
    deep: `<Message version="2017071"><Body>${"<A>".repeat(200)}x${"</A>".repeat(200)}</Body></Message>`,
    attrsOdd: '<Message version=\'2017071\' a = "1" b c="&amp;"><Body/></Message>',
    duplicateAttr: '<Message version="2017071" version="2"><Body/></Message>',
    protoName: "<Message><__proto__>x</__proto__></Message>",
    textRoot: "text<Message/>",
  };
  return Object.entries(cases).map(([name, text]) => ({ label: `xml:${name}`, text }));
}

/** Every SCRIPT input of the corpus, in a fixed order. */
export function scriptInputs(): CorpusInput[] {
  const seeds: CorpusInput[] = [...scriptFixtures()];
  for (let i = 0; i < 8; i++) seeds.push({ label: `shape:newRx:${String(i)}`, text: newRx(i) });
  for (let i = 0; i < 2; i++) {
    seeds.push({
      label: `shape:history:${String(i)}`,
      text: medicationHistory(i, 3 + i),
    });
  }
  seeds.push({ label: "shape:note:1KiB", text: noteNewRx(0, KIB) });
  seeds.push({ label: "shape:note:8KiB", text: noteNewRx(1, 8 * KIB) });
  seeds.push({ label: "shape:note:70KiB", text: noteNewRx(2, 70 * KIB) });
  const out: CorpusInput[] = [...seeds, ...noteCases(), ...xmlEdgeCases()];
  seeds.slice(0, 40).forEach((seed, s) => {
    mutants(seed.text, 12, 1000 + s, XML_POOL).forEach((text, m) => {
      out.push({ label: `mutant:${seed.label}:${String(m)}`, text });
    });
  });
  noteCases().forEach((seed, s) => {
    mutants(seed.text, 3, 5000 + s, XML_POOL).forEach((text, m) => {
      out.push({ label: `mutant:${seed.label}:${String(m)}`, text });
    });
  });
  return out;
}

/** Telecom shapes for the paths the view and tokenizer work touches. */
function telecomCases(): CorpusInput[] {
  const header = { transactionCode: "B1" };
  const cases: Record<string, string> = {
    empty: "",
    blank: "   ",
    short: "123456D0B1",
    noFraming: `${"0".repeat(6)}D0B1${"X".repeat(60)}`,
    headerOnly: syntheticB1().slice(0, 56),
    response: buildResponseTransmission({}, [
      { id: "20", fields: [["F4", "message"]] },
      {
        id: "21",
        fields: [
          ["AN", "R"],
          ["FA", "2"],
          ["FB", "70"],
          ["FB", "88"],
        ],
      },
    ]),
    // A transaction's own segment and a shared one with the same id: the own one wins.
    sharedAndOwn: buildTransmission(
      header,
      [
        [
          { id: "04", fields: [["C2", "OWNCARD"]] },
          { id: "07", fields: [["D7", "11111111111"]] },
        ],
        [{ id: "07", fields: [["D7", "22222222222"]] }],
      ],
      [
        {
          id: "04",
          fields: [
            ["C2", "SHAREDCARD"],
            ["C1", "SHAREDGROUP"],
          ],
        },
        { id: "01", fields: [["C4", "19700101"]] },
      ],
    ),
    // Repeated segments and fields: the first wins for a single read, every one for a list.
    repeats: buildTransmission(header, [
      [
        {
          id: "07",
          fields: [
            ["D7", "first"],
            ["D7", "second"],
            ["E7", ""],
            ["E7", "30000"],
            ["D5", "x"],
          ],
        },
        { id: "07", fields: [["D7", "other segment"]] },
        { id: "03", fields: [["DB", ""]] },
      ],
    ]),
    // An empty field value, a field with no value, and a lone character.
    emptyFields: buildTransmission(header, [
      [
        {
          id: "07",
          fields: [
            ["D2", ""],
            ["E1", ""],
          ],
        },
      ],
    ]).concat(`${FS}D${FS}${FS}D7`),
    missingAm: `${syntheticB1().slice(0, 56)}${GS}D7123${FS}E703${RS}AM07${FS}D2RX`,
    malformedAm: `${syntheticB1().slice(0, 56)}${GS}AM0712${FS}D7123`,
    unknownSegment: `${syntheticB1().slice(0, 56)}${GS}AM99${FS}D7123${RS}AM07${FS}D2RX`,
    lotsOfSeparators: `${syntheticB1().slice(0, 56)}${GS}${GS}${RS}${RS}${FS}${FS}AM07${FS}${FS}D2RX${RS}${GS}`,
    leadingFs: `${syntheticB1().slice(0, 56)}${FS}AM07${FS}D2RX`,
    durRequest: buildTransmission(header, [
      [
        {
          id: "08",
          fields: [
            ["E4", "DD"],
            ["E5", "M0"],
            ["E6", "1B"],
            ["E4", "ZZ"],
            ["8E", "11"],
            ["J9", "01"],
            ["H7", "12345"],
            ["E4", ""],
          ],
        },
      ],
    ]),
    priorAuth: buildTransmission(header, [
      [
        {
          id: "12",
          fields: [
            ["EU", "1"],
            ["EV", "PA123"],
          ],
        },
      ],
    ]),
  };
  return Object.entries(cases).map(([name, text]) => ({ label: `telecom:${name}`, text }));
}

/** Every Telecom input of the corpus, in a fixed order. */
export function telecomInputs(): CorpusInput[] {
  const seeds: CorpusInput[] = [
    ...telecomFixtures(),
    { label: "helper:b1", text: syntheticB1() },
    { label: "helper:compound", text: syntheticCompoundClaim() },
    { label: "helper:secondary", text: syntheticSecondaryClaim() },
    { label: "helper:multi", text: syntheticMultiTransactionRequest() },
    { label: "helper:multiMalformed", text: syntheticMultiTransactionRequestMalformedSecond() },
    { label: "helper:multiResponse", text: syntheticMultiTransactionResponse() },
    { label: "helper:nine", text: syntheticNineTransactionRequest() },
  ];
  for (let i = 0; i < 8; i++) seeds.push({ label: `shape:b1:${String(i)}`, text: b1Claim(i) });
  b1Batch(8, 3).forEach((text, i) => seeds.push({ label: `shape:batch:${String(i)}`, text }));
  seeds.push({ label: "shape:wide", text: b1Wide(1, 12) });
  const cases = telecomCases();
  const out: CorpusInput[] = [...seeds, ...cases];
  [...seeds, ...cases].forEach((seed, s) => {
    mutants(seed.text, 10, 2000 + s, TELECOM_POOL).forEach((text, m) => {
      out.push({ label: `mutant:${seed.label}:${String(m)}`, text });
    });
  });
  return out;
}

export interface CorpusBuild<T> {
  readonly label: string;
  readonly input: T;
}

/** Every NewRx builder input of the corpus. */
export function newRxBuilds(): CorpusBuild<NewRxInput>[] {
  const out: CorpusBuild<NewRxInput>[] = [];
  for (let i = 0; i < 8; i++) out.push({ label: `newRx:${String(i)}`, input: newRxInput(i) });
  out.push({ label: "note:1KiB", input: noteNewRxInput(0, KIB) });
  out.push({ label: "note:70KiB", input: noteNewRxInput(1, 70 * KIB) });
  const notes: Record<string, string> = {
    markup: "a <b> & c > d \"e\" 'f'",
    entities: "&amp; &lt; &#60;",
    control: "bad\u0001char",
    controlLate: `${"ok ".repeat(5000)}\u0008`,
    tabNewline: "\ttab\nnewline\r\n",
    unicode: "café 😀",
    lone: "\ud800 lone surrogate",
    nonChar: "￾",
    empty: "",
    spaces: "   ",
    long: "<&>".repeat(20000),
  };
  for (const [name, note] of Object.entries(notes)) {
    out.push({ label: `noteText:${name}`, input: newRxInput(name.length, note) });
  }
  const base = newRxInput(2);
  out.push({
    label: "noDescription",
    input: { ...base, medication: { ...base.medication, description: "" } },
  });
  out.push({ label: "minimal", input: { medication: { description: "Synthetic drug" } } });
  out.push({
    label: "controlInHeader",
    input: { ...base, header: { ...base.header, messageId: "id\u0002" } },
  });
  return out;
}

/** Every SCRIPT response builder input of the corpus. */
export function responseBuilds(): CorpusBuild<ScriptResponseInput>[] {
  return [
    { label: "status", input: { kind: "Status", code: "010", header: { version: "2017071" } } },
    {
      label: "error",
      input: { kind: "Error", code: "900", description: "rejected <&>", descriptionCode: "1" },
    },
    { label: "verify", input: { kind: "Verify", code: "000" } },
    { label: "noCode", input: { kind: "Status", code: "" } },
    { label: "control", input: { kind: "Error", code: "900", description: "x\u0001" } },
  ];
}

/** Every Telecom builder input of the corpus. */
export function telecomBuilds(): CorpusBuild<TelecomRequestInput>[] {
  const out: CorpusBuild<TelecomRequestInput>[] = [];
  for (let i = 0; i < 8; i++) out.push({ label: `b1:${String(i)}`, input: b1Request(i) });
  const base = b1Request(1);
  const segment = base.segments[0];
  const variants: Record<string, TelecomRequestInput> = {
    noCode: { ...base, header: { ...base.header, transactionCode: " " } },
    longBin: { ...base, header: { ...base.header, binNumber: "1234567" } },
    controlValue: {
      ...base,
      segments: [{ segmentId: "07", fields: [{ id: "D7", value: `a${FS}b` }] }],
    },
    badSegmentId: { ...base, segments: [{ segmentId: "7", fields: [] }] },
    badFieldId: { ...base, segments: [{ segmentId: "07", fields: [{ id: "D", value: "1" }] }] },
    noSegments: { ...base, segments: [] },
    repeated: {
      ...base,
      segments: [
        ...(segment === undefined ? [] : [segment]),
        {
          segmentId: "07",
          fields: [
            { id: "D7", value: "x" },
            { id: "D7", value: "y" },
          ],
        },
      ],
    },
  };
  for (const [name, input] of Object.entries(variants)) out.push({ label: name, input });
  return out;
}

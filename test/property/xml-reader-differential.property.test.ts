/**
 * The SCRIPT XML reader against the parser it replaced.
 *
 * The package read SCRIPT XML with `fast-xml-parser` until its own reader took over, so that a
 * large text value costs its own bytes and the package loads with no runtime dependency. The
 * reader promises the same tree for every input: the same elements, attributes and text, the same
 * leniency on malformed markup, and a refusal wherever the old loader refused. The old loader is
 * kept, as it was, in `test/_helpers/reference-xml-load.ts`, on `fast-xml-parser` as a dev
 * dependency; this test draws markup soup biased toward every branch of both (tags, quoted and
 * unquoted attributes, tabs, carriage returns, CDATA, comments, processing instructions, stray and
 * mismatched closing tags, names an object's prototype owns, deep nesting) and holds the two to the
 * same recorded tree or the same refusal.
 *
 * One input differs on purpose: a `<!D` declaration that the DOCTYPE pre-scan does not catch (a
 * `<!DOCTYPE` run straight into a name, such as `<!DOCTYPEx>`). The old loader read it as a
 * document type declaration; the reader refuses every one. The generator below never draws `<!D`,
 * and `test/script/xml-load.test.ts` pins the refusal.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { amplified, fuzzTimeout } from "../_helpers/fuzz-config.js";
import { record } from "../_helpers/output-corpus.js";
import { loadScriptXml as referenceLoad } from "../_helpers/reference-xml-load.js";
import { loadScriptXml } from "../../src/script/xml-load.js";

/** The recorded tree, or the class and code of the refusal. */
function outcome(load: (raw: string) => unknown, raw: string): string {
  try {
    return `ok:${record(load(raw))}`;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return `throw:${(error as Error).constructor.name}:${String(code)}`;
  }
}

const NAMES = [
  "Message",
  "Body",
  "NewRx",
  "Note",
  "a",
  "ns:Note",
  "x:y:z",
  "",
  ":@",
  "!xml",
  "#text",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "constructor",
  "__proto__",
  "prototype",
  "1",
  "?x",
  "!x",
  "Note/",
  "a\tb",
];

const name = fc.constantFrom(...NAMES);
const quote = fc.constantFrom('"', "'");
const space = fc.constantFrom(" ", "\t", "\n", "\r\n", "\r", "", "  ", " ");
const textPiece = fc.constantFrom(
  "text",
  " ",
  "\n",
  "\r\n",
  "\r",
  "\t",
  "&amp;",
  "&lt;",
  "&#60;",
  ">",
  '"',
  "'",
  "=",
  "/",
  "]]>",
  "-->",
  "?>",
  "café",
  "😀",
  "QUJDREVG",
);
const text = fc.array(textPiece, { maxLength: 4 }).map((parts) => parts.join(""));

const attrValue = fc
  .array(fc.constantFrom("v", " ", "\t", ">", "/", "=", "'", '"', "&amp;", "<", "x:y"), {
    maxLength: 4,
  })
  .map((parts) => parts.join(""));

const attribute = fc.oneof(
  fc
    .tuple(name, space, space, quote, attrValue)
    .map(([n, s1, s2, q, v]) => `${n}${s1}=${s2}${q}${v.replaceAll(q, "")}${q}`),
  fc.tuple(name, attrValue).map(([n, v]) => `${n}=${v}`),
  name,
  fc.tuple(quote, attrValue).map(([q, v]) => `${q}${v}`),
);

const attributes = fc
  .array(fc.tuple(space, attribute), { maxLength: 3 })
  .map((list) => list.map(([s, a]) => `${s === "" ? " " : s}${a}`).join(""));

/** One markup token: the parts a document is drawn from. */
const token = fc.oneof(
  { weight: 6, arbitrary: fc.tuple(name, attributes, space).map(([n, a, s]) => `<${n}${a}${s}>`) },
  { weight: 2, arbitrary: fc.tuple(name, attributes, space).map(([n, a, s]) => `<${n}${a}${s}/>`) },
  { weight: 6, arbitrary: fc.tuple(name, space).map(([n, s]) => `</${n}${s}>`) },
  { weight: 5, arbitrary: text },
  { weight: 1, arbitrary: text.map((t) => `<![CDATA[${t}]]>`) },
  { weight: 1, arbitrary: text.map((t) => `<!--${t}-->`) },
  { weight: 1, arbitrary: fc.tuple(name, attributes).map(([n, a]) => `<?${n}${a}?>`) },
  { weight: 1, arbitrary: fc.constant('<?xml version="1.0"?>') },
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      "<",
      "</",
      "<!",
      "<![",
      "<!-",
      "<?",
      ">",
      "<!x>",
      "<![X[y]]>",
      "<![]]>",
      "<!-->",
    ),
  },
);

/** A document: tokens, sometimes wrapped in a root, never carrying a `<!D` declaration. */
const documentText = fc
  .tuple(fc.boolean(), fc.array(token, { maxLength: 30 }))
  .map(([wrap, tokens]) => {
    const inner = tokens.join("");
    return wrap ? `<Message version="2017071">${inner}</Message>` : inner;
  })
  .filter((doc) => !/<!D/.test(doc));

/** Deep nesting around the reader's bound. */
const deepText = fc
  .tuple(fc.integer({ min: 95, max: 106 }), fc.integer({ min: 0, max: 106 }), text)
  .map(([open, closed, t]) => `${"<a>".repeat(open)}${t}${"</a>".repeat(closed)}`);

/** Character soup over the characters markup is made of. */
const soupText = fc
  .array(
    fc.constantFrom(
      ..."<>/!?-[]CDATa:#@\"'= \t\r\n&;x".split(""),
      "<![CDATA[",
      "]]>",
      "<!--",
      "-->",
    ),
    { maxLength: 40 },
  )
  .map((chars) => chars.join(""))
  .filter((doc) => !/<!D/.test(doc));

describe("the SCRIPT XML reader reads every document as the parser it replaced", () => {
  it(
    "draws character soup and gets the same tree or the same refusal",
    () => {
      fc.assert(
        fc.property(soupText, (doc) => {
          expect(outcome(loadScriptXml, doc)).toBe(outcome(referenceLoad, doc));
        }),
        amplified(4000),
      );
    },
    fuzzTimeout(120_000),
  );

  it(
    "draws markup soup and gets the same tree or the same refusal",
    () => {
      fc.assert(
        fc.property(documentText, (doc) => {
          expect(outcome(loadScriptXml, doc)).toBe(outcome(referenceLoad, doc));
        }),
        amplified(4000),
      );
    },
    fuzzTimeout(120_000),
  );

  it(
    "nests around the depth bound and gets the same tree or the same refusal",
    () => {
      fc.assert(
        fc.property(deepText, (doc) => {
          expect(outcome(loadScriptXml, doc)).toBe(outcome(referenceLoad, doc));
        }),
        amplified(200),
      );
    },
    fuzzTimeout(60_000),
  );
});

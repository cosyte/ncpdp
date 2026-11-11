/**
 * The SCRIPT XML reader, branch by branch.
 *
 * `test/property/xml-reader-differential.property.test.ts` holds the reader to the parser it
 * replaced on drawn input; this file pins each rule on a fixed input, so every branch is covered
 * whatever a run draws, and pins the one rule that changed on purpose: every `<!D` declaration is
 * refused.
 */

import { describe, expect, it } from "vitest";

import { NcpdpScriptParseError, SCRIPT_FATAL_CODES } from "../../src/index.js";
import { loadScriptXml, type XmlElement } from "../../src/script/xml-load.js";

function notXml(raw: string): void {
  try {
    loadScriptXml(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(NcpdpScriptParseError);
    expect((error as NcpdpScriptParseError).code).toBe(SCRIPT_FATAL_CODES.NOT_XML);
    return;
  }
  throw new Error("expected NOT_XML");
}

/** The tree as plain data: name, attributes, text and children. */
function shape(el: XmlElement): unknown {
  return { name: el.name, attrs: { ...el.attrs }, text: el.text, children: el.children.map(shape) };
}

describe("the SCRIPT XML reader", () => {
  it("reads elements, attributes, text and namespaces", () => {
    const root = loadScriptXml(
      '<?xml version="1.0"?>\n<m:Message a:version="1" plain=\'x\' bare novalue=>t<Child/>u<Leaf\tk="v">w</Leaf></m:Message>',
    );
    expect(shape(root)).toEqual({
      name: "Message",
      attrs: { version: "1", plain: "x" },
      text: "tu",
      children: [
        { name: "Child", attrs: {}, text: "", children: [] },
        { name: "Leaf", attrs: { k: "v" }, text: "w", children: [] },
      ],
    });
    expect(Object.isFrozen(root)).toBe(true);
    expect(Object.isFrozen(root.children)).toBe(true);
    expect(Object.isFrozen(root.attrs)).toBe(true);
  });

  it("keeps a repeated attribute's last value in its first place, prefixes merged", () => {
    const root = loadScriptXml('<M a="1" b="2" x:a="3"/>');
    expect(Object.entries(root.attrs)).toEqual([
      ["a", "3"],
      ["b", "2"],
    ]);
    expect(loadScriptXml('<M b="1" b="2"/>').attrs).toEqual({ b: "2" });
  });

  it("reads a quoted '>' and a tab inside a tag", () => {
    const root = loadScriptXml('<M\ta="x>y"\t/>');
    expect(root.attrs).toEqual({ a: "x>y" });
  });

  it("reads carriage returns as line feeds", () => {
    expect(loadScriptXml("<M>a\r\nb\rc</M>").text).toBe("a\nb\nc");
  });

  it("joins text around comments, processing instructions and CDATA", () => {
    expect(loadScriptXml("<M>a<!-- c -->b<?pi x?>c<![CDATA[<d>]]>e<![CDATA[]]></M>").text).toBe(
      "abc<d>e",
    );
  });

  it("drops text at the document level and text never followed by markup", () => {
    const root = loadScriptXml("lead<M>in</M>tail");
    expect(root.text).toBe("in");
    expect(loadScriptXml("<M>never closed").text).toBe("");
  });

  it("closes the open element at any closing tag, and keeps an unclosed one", () => {
    const root = loadScriptXml("</Stray><M><A>x</B>y<C>z");
    expect(shape(root)).toEqual({
      name: "M",
      attrs: {},
      text: "y",
      children: [
        { name: "A", attrs: {}, text: "x", children: [] },
        { name: "C", attrs: {}, text: "", children: [] },
      ],
    });
    expect(Object.isFrozen(root.children[1])).toBe(true);
  });

  it("reads the first top-level element as the root", () => {
    expect(loadScriptXml("<A/><B/>").name).toBe("A");
    expect(loadScriptXml("<A></A><B/>").name).toBe("A");
  });

  it("does not read an element named ':@' or a self-closing one named '#text', nor under them", () => {
    const root = loadScriptXml("<M>a<:@ k='v'><In/>b</:@><#text/>c</M>");
    expect(root.children).toEqual([]);
    expect(root.text).toBe("ac");
    notXml("<:@><M/></:@>");
    notXml("<#text>x</#text>");
  });

  it("keeps text ahead of a child out of an element named '!xml'", () => {
    const root = loadScriptXml("<!xml>a<B/>b</!xml>");
    expect(root.name).toBe("!xml");
    expect(root.text).toBe("b");
  });

  it("reads '<?>' as an empty element with no name", () => {
    const root = loadScriptXml("<M><?></M>");
    expect(shape(root.children[0] as XmlElement)).toEqual({
      name: "",
      attrs: {},
      text: "",
      children: [],
    });
    expect(loadScriptXml("<?><M/>").name).toBe("");
    expect(loadScriptXml("<:@><?></:@><M/>").name).toBe("M");
  });

  it("guards element names an object's prototype owns", () => {
    expect(loadScriptXml("<toString/>").name).toBe("__toString");
    expect(loadScriptXml("<valueOf>x</valueOf>").name).toBe("__valueOf");
    notXml("<__proto__/>");
    notXml("<constructor>x</constructor>");
    notXml("<M></prototype>");
    notXml("<M></\vprototype>");
    notXml("<M></ prototype >");
    notXml("<M></ prototype>");
    expect(loadScriptXml("<M></__proto__x>").name).toBe("M");
    expect(loadScriptXml("<M></Prototype>").name).toBe("M");
    expect(loadScriptXml("<M></p>").name).toBe("M");
    expect(loadScriptXml("<M></éprototypes>").name).toBe("M");
  });

  it("refuses unterminated markup", () => {
    notXml("<M");
    notXml("<M></M");
    notXml("<M><!-- never</M>");
    notXml("<M><![CDATA[ never</M>");
    notXml('<?xml version="1.0"<M/>');
    notXml("<M a='never>");
  });

  it("refuses every <!D declaration, the DOCTYPE run into a name included", () => {
    notXml("<!DOCTYPEMessage><Message/>");
    notXml("<!Dx><Message/>");
    notXml("<Message><!D></Message>");
  });

  it("refuses nesting deeper than the bound and accepts it at the bound", () => {
    expect(loadScriptXml("<a>".repeat(101)).name).toBe("a");
    notXml("<a>".repeat(102));
  });

  it("refuses a document with no element", () => {
    notXml("just text");
    notXml("<!-- only a comment -->");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fences, importSpecifiers, installSpecifiers, section } from "./_helpers/first-use.js";

/**
 * What a reader copies first has to reach THIS package: the install command both first-use
 * documents print must name `package.json` `name`, and every specifier either first-use example
 * imports must be a subpath the `exports` map publishes. A mismatch names both strings.
 */
const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  name: string;
  exports: Record<string, unknown>;
};

/** A package specifier to the `exports` key it resolves through, or `undefined` for another package. */
function exportsKey(specifier: string): string | undefined {
  if (specifier === pkg.name) return ".";
  if (specifier.startsWith(`${pkg.name}/`)) return `./${specifier.slice(pkg.name.length + 1)}`;
  return undefined;
}

describe("the documented install specifier", () => {
  for (const doc of ["docs-content/installation.md", "README.md"]) {
    it(`AC-NP7: every install command in ${doc} names package.json name`, () => {
      const specs = installSpecifiers(readFileSync(join(root, doc), "utf8"));
      expect(specs.length, `${doc} prints no install command`).toBeGreaterThan(0);
      for (const spec of specs) {
        expect(spec, `${doc} installs "${spec}", package.json name is "${pkg.name}"`).toBe(
          pkg.name,
        );
      }
    });
  }

  it("AC-NP7: a specifier that is not the package name is read as the name it prints", () => {
    expect(
      installSpecifiers("npm install @cosyte/ncpdq\n`pnpm add -D @cosyte/ncpdp@0.0.1`"),
    ).toEqual(["@cosyte/ncpdq", "@cosyte/ncpdp"]);
  });
});

describe("the first-use examples import only published subpaths", () => {
  const firstUse = [
    [
      "docs-content/quickstart.md",
      fences(readFileSync(join(root, "docs-content", "quickstart.md"), "utf8"))[0],
    ],
    ["README.md", fences(section(readFileSync(join(root, "README.md"), "utf8"), "## Usage"))[0]],
  ] as const;

  for (const [doc, fence] of firstUse) {
    it(`AC-NP3: every package import in the first example of ${doc} is in the exports map`, () => {
      const ours = importSpecifiers(fence?.body ?? "").filter((s) => exportsKey(s) !== undefined);
      expect(
        ours.length,
        `${doc}: the first example imports nothing from ${pkg.name}`,
      ).toBeGreaterThan(0);
      for (const spec of ours) {
        expect(Object.keys(pkg.exports), `${doc} imports "${spec}"`).toContain(exportsKey(spec));
      }
    });
  }

  it("AC-NP3: an import of an unpublished subpath resolves to a key the map does not carry", () => {
    const key = exportsKey(
      importSpecifiers('import { x } from "@cosyte/ncpdp/internal";')[0] ?? "",
    );
    expect(key).toBe("./internal");
    expect(Object.keys(pkg.exports)).not.toContain(key);
  });

  it("AC-NP7: every install command form a reader may copy is read, inline code included", () => {
    const forms = [
      "pnpm i @cosyte/ncpdq",
      "pnpm install @cosyte/ncpdq",
      "npm add @cosyte/ncpdq",
      "deno add npm:@cosyte/ncpdq",
      "run `npm install @cosyte/ncpdq` first",
      "then run npm install @cosyte/ncpdq.",
    ];
    for (const form of forms) expect(installSpecifiers(form), form).toEqual(["@cosyte/ncpdq"]);
    expect(installSpecifiers("pnpm install\npnpm install --frozen-lockfile")).toEqual([]);
    expect(
      installSpecifiers("pnpm add file:../ncpdp\nnpm install git+https://x.test/ncpdp.git"),
    ).toEqual([]);
  });
});

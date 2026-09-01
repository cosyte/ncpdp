#!/usr/bin/env tsx
/**
 * scripts/public-surface.ts: what this package publishes, enumerated from the compiler.
 *
 * WHY THIS EXISTS. `0.1.0` is a semantic claim: the public API is settled and is stable enough to
 * depend on. A claim like that is worth exactly as much as the thing that enforces it, and until
 * this file there was nothing. Every export could be removed, renamed, or quietly added between
 * releases and every gate in the repo stayed green: `tsc` type-checks the code that is there,
 * `attw` checks that the declarations RESOLVE, the unit suites import the handful of names they
 * happen to use, and none of them holds an opinion about the SET.
 *
 * ENUMERATED FROM THE TYPE CHECKER, NOT FROM `import * as ns`, AND THAT IS THE WHOLE POINT. A
 * namespace import sees VALUES ONLY: types are erased before anything runs. This package's surface
 * is majority types (interfaces, unions, aliases), so a runtime enumeration would record a
 * fraction of it and then report a confident OK over the rest. `checker.getExportsOfModule()`
 * returns both, which is the only way "a value or type was removed" can be a question this repo
 * can answer.
 *
 * KIND IS RECORDED ALONGSIDE THE NAME, because a name surviving is not the surface surviving.
 * `export const X` becoming `export type X` keeps the name and breaks every consumer that called
 * it, and a record of bare names cannot see the difference. `value+type` is the normal shape for a
 * class or an enum, which are both at once.
 *
 * ALIASES ARE RESOLVED BEFORE THE FLAGS ARE READ. Every one of these entry points is a barrel of
 * `export { ... } from "./x.js"`, so the symbol the module hands back is an ALIAS, whose own flags
 * describe the re-export rather than the thing re-exported. Reading them unresolved records every
 * single export as an alias and the kind axis goes uniformly blind while still printing a kind.
 *
 * THIS FILE ONLY MEASURES. The comparison, and the decision about what a difference means, is in
 * `test/public-surface.test.ts`; the recorded surface it compares against is
 * `test/public-surface.json`, regenerated deliberately by `pnpm surface:record`. Regenerating is
 * meant to be easy and meant to be VISIBLE: the point was never to make the surface immovable, it
 * is to make it impossible to move without a reviewer seeing the exports move in the diff.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The published entry points, keyed by the specifier a consumer writes.
 *
 * These are the subpaths `package.json#exports` offers a consumer, minus `./package.json`, which
 * is the manifest itself and has no TypeScript surface. `test/public-surface.test.ts` checks this
 * table against that field in both directions, so a subpath added to the manifest without being
 * added here fails rather than going unrecorded.
 */
export const ENTRY_POINTS: Readonly<Record<string, string>> = {
  "@cosyte/ncpdp": "src/index.ts",
  "@cosyte/ncpdp/script": "src/script/index.ts",
  "@cosyte/ncpdp/telecom": "src/telecom/index.ts",
  "@cosyte/ncpdp/common": "src/common/index.ts",
  "@cosyte/ncpdp/profiles": "src/profiles/index.ts",
};

/** What a name is in the type system. A class or an enum is both at once. */
export type ExportKind = "value" | "type" | "value+type" | "unknown";

/** One published name and what it is. */
export interface SurfaceEntry {
  readonly name: string;
  readonly kind: ExportKind;
}

/** The whole published surface: entry-point specifier to its sorted export list. */
export type Surface = Readonly<Record<string, readonly SurfaceEntry[]>>;

/**
 * A refusal is not a failure. A failure means the surface moved; a refusal means this file could
 * not see the surface at all, and reporting either an OK or a tidy list of differences from an
 * enumeration that did not complete is worse than both.
 */
export class SurfaceRefusal extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SurfaceRefusal";
  }
}

/**
 * Resolve an alias to the thing it re-exports, then read what kind of thing that is.
 *
 * AN ALIAS THAT RESOLVES TO NOTHING IS `unknown`, NOT A KIND. When a barrel re-exports a name its
 * target no longer has, the checker hands back its unknown symbol, which carries flags of its own:
 * measured here, it reads as a plain `value`. Recording that would describe a re-export pointing at
 * nothing as an ordinary function, which is worse than recording no answer, so the no-declarations
 * case is reported as `unknown` and the comparison in `test/public-surface.test.ts` reds on it as a
 * kind change.
 */
function kindOf(checker: ts.TypeChecker, symbol: ts.Symbol): ExportKind {
  let resolved = symbol;
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    try {
      resolved = checker.getAliasedSymbol(symbol);
    } catch {
      // An alias that cannot be resolved is reported as it stands rather than dropped.
      return "unknown";
    }
  }
  if (resolved.declarations === undefined || resolved.declarations.length === 0) return "unknown";
  const isValue = (resolved.flags & ts.SymbolFlags.Value) !== 0;
  const isType = (resolved.flags & ts.SymbolFlags.Type) !== 0;
  if (isValue && isType) return "value+type";
  if (isValue) return "value";
  if (isType) return "type";
  return "unknown";
}

/**
 * Enumerate every published entry point's exports, values and types alike.
 *
 * The program is built from this repo's own `tsconfig.json` so the surface is measured under the
 * settings the package is actually compiled with, rather than under a second set of options
 * maintained here that could drift away from them.
 */
export function readPublicSurface(): Surface {
  // Wrapped rather than passed as method references: `ts.sys`'s members are unbound methods, and
  // handing one to a callback parameter is the shape that silently loses `this`.
  const fileExists = (path: string): boolean => ts.sys.fileExists(path);
  const readFile = (path: string): string | undefined => ts.sys.readFile(path);

  const configPath = ts.findConfigFile(ROOT, fileExists, "tsconfig.json");
  if (configPath === undefined) throw new SurfaceRefusal(`no tsconfig.json found under ${ROOT}`);

  const raw = ts.readConfigFile(configPath, readFile);
  if (raw.error !== undefined) {
    throw new SurfaceRefusal(
      `cannot read ${configPath}: ${ts.flattenDiagnosticMessageText(raw.error.messageText, " ")}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, ROOT);
  if (parsed.errors.length > 0) {
    throw new SurfaceRefusal(
      `cannot resolve ${configPath}: ` +
        parsed.errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, " ")).join("; "),
    );
  }

  const files: string[] = [];
  for (const [specifier, rel] of Object.entries(ENTRY_POINTS)) {
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) {
      throw new SurfaceRefusal(
        `entry point ${specifier} names ${rel}, which does not exist. An entry point that cannot ` +
          `be read is not an empty surface: refusing rather than recording one.`,
      );
    }
    files.push(abs);
  }

  const program = ts.createProgram(files, { ...parsed.options, noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();

  const surface: Record<string, readonly SurfaceEntry[]> = {};
  for (const [specifier, rel] of Object.entries(ENTRY_POINTS)) {
    const sourceFile = program.getSourceFile(resolve(ROOT, rel));
    if (sourceFile === undefined) {
      throw new SurfaceRefusal(`${rel} is not in the program, so ${specifier} was never read`);
    }
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol === undefined) {
      throw new SurfaceRefusal(
        `${rel} has no module symbol, so ${specifier} could not be enumerated. A file with no ` +
          `top-level export is not a module; that is a refusal here, not an empty surface.`,
      );
    }
    surface[specifier] = checker
      .getExportsOfModule(moduleSymbol)
      .map((symbol) => ({ name: symbol.getName(), kind: kindOf(checker, symbol) }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  return surface;
}

/** Serialise a surface the way `test/public-surface.json` stores it: stable, sorted, diffable. */
export function serializeSurface(surface: Surface): string {
  const ordered: Record<string, readonly SurfaceEntry[]> = {};
  for (const specifier of Object.keys(ENTRY_POINTS)) {
    const entries = surface[specifier];
    if (entries !== undefined) ordered[specifier] = entries;
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

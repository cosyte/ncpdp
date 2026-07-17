import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { beforeAll } from "vitest";

import { docSnippetSuite } from "@cosyte/vitest-config/snippets";

/**
 * Doc/code-agreement gate. Every ```` ```ts runnable ```` block in `docs-content/` is extracted,
 * compiled, and executed, and its inline `// =>` assertions are checked — so a documented example
 * can never silently drift from the shipped code (the documentation analog of the parser conformance
 * runners). Blocks tagged ` ```ts runnable throws ` must throw; plain ` ```ts ` blocks are
 * illustrative and are not executed.
 *
 * NCPDP ships two structurally unrelated standards under four subpaths, so a snippet imports the
 * exact subpath a consumer would (`@cosyte/ncpdp`, `/script`, `/telecom`, `/common`, `/profiles`).
 * The runnable blocks stay on the deterministic, in-process readers/serializers — `parseScript`,
 * `parseTelecom`, `claim`, and friends; nothing here opens a socket or reads a real feed.
 *
 * Snippets resolve against the **built** artifacts, not the source tree, so they exercise exactly
 * what an installer loads (self-contained bundles, no internal `.js`→`.ts` resolution). The shared CI
 * gate runs `test` before `build`, so we provision `dist/` on demand here rather than assuming order.
 */
const root = join(import.meta.dirname, "..");

/** Map each published subpath to its built ESM entry. */
const SUBPATHS: Record<string, string> = {
  "@cosyte/ncpdp": join(root, "dist", "index.mjs"),
  "@cosyte/ncpdp/script": join(root, "dist", "script", "index.mjs"),
  "@cosyte/ncpdp/telecom": join(root, "dist", "telecom", "index.mjs"),
  "@cosyte/ncpdp/common": join(root, "dist", "common", "index.mjs"),
  "@cosyte/ncpdp/profiles": join(root, "dist", "profiles", "index.mjs"),
};

beforeAll(() => {
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}, 120_000);

docSnippetSuite({
  docsDir: join(root, "docs-content"),
  resolve: (specifier) => SUBPATHS[specifier],
});

---
id: installation
title: Installation
sidebar_label: Installation
description: "Install the package, meet the prerequisites and the one runtime dependency, and confirm it resolves from ESM or CommonJS."
---

# Installation

`@cosyte/ncpdp` is a TypeScript NCPDP toolkit for Node.js. It ships dual **ESM and CJS** builds with
per-condition type declarations, so it works from either module system without configuration, and it
exposes its two standards as separate subpaths so a Telecom-only or SCRIPT-only consumer never loads
the other.

## Prerequisites

- **Node.js 22 or later.**
- A package manager: `pnpm`, `npm`, or `yarn`.
- **No runtime dependency.** Both sides use the Node.js standard library only. The **SCRIPT** side
  (XML) is read by our own reader, which refuses a document type declaration or an entity
  declaration before it is read and resolves no entity (the XXE boundary). We add no runtime
  dependency without review.

## Install

```bash
npm install @cosyte/ncpdp
```

## Check that it works

Parse the smallest valid SCRIPT message and read its version back:

```ts runnable
import { parseScript } from "@cosyte/ncpdp/script";

const msg = parseScript('<Message version="2017071"><Header /><Body /></Message>');

msg.header.version; // => "2017071"
Array.isArray(msg.warnings); // => true
```

If that runs and returns, the install is good. The package also exports its own version string:

```ts runnable
import { VERSION } from "@cosyte/ncpdp";

typeof VERSION; // => "string"
```

## Module systems and subpaths

`@cosyte/ncpdp` is `"type": "module"` and exposes both conditions, so both of these resolve to the
right build without extra configuration:

```ts runnable
// ESM and TypeScript
import { parseScript } from "@cosyte/ncpdp/script";
import { parseTelecom } from "@cosyte/ncpdp/telecom";

typeof parseScript; // => "function"
typeof parseTelecom; // => "function"
```

```js no-run CommonJS needs require, and the samples on these pages run as ES modules; CI loads the CommonJS build separately
// CommonJS
const { parseScript } = require("@cosyte/ncpdp/script");
const { parseTelecom } = require("@cosyte/ncpdp/telecom");
```

The root `@cosyte/ncpdp` and its four subpaths (`@cosyte/ncpdp/script`, `@cosyte/ncpdp/telecom`,
`@cosyte/ncpdp/common`, and `@cosyte/ncpdp/profiles`) each publish per-condition types (`.d.ts` for
`import`, `.d.cts` for `require`), checked by `attw` on every release, and resolve under both `node16`
and legacy `node10` module resolution. Editor IntelliSense matches the build you actually load.

## Keep patient data out of your tests

Every example in this documentation uses **synthetic** messages: no real patient names, member IDs,
prescriber NPIs, or NDCs. Do the same in your own tests: NCPDP messages carry PHI, and a fixture
committed to a repository is a leak the moment it is published. [How the parser reads
safely](./fail-safe-reading.md#what-is-safe-to-log) says
which parts of a parse result are safe to log.

## Next

- [Quickstart](./quickstart.md): a first useful result from each of the two standards.
- [Troubleshooting](./troubleshooting.md): what to do when an import or a parse does not behave.

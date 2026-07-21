---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

`@cosyte/ncpdp` is a TypeScript NCPDP toolkit for Node.js. It ships dual **ESM + CJS** builds with
per-condition type declarations, so it works from either module system without configuration, and it
exposes its two standards as separate subpaths so a Telecom-only or SCRIPT-only consumer never pays
for the other.

> **Status:** pre-alpha, published to npm at `0.0.1` (public, on the `0.0.x` ladder until first
> alpha). The install command below is live.

## Prerequisites

- **Node.js >= 22.** The whole `@cosyte/*` suite targets ES2023 / Node 22+.
- A package manager — `pnpm`, `npm`, or `yarn`.
- **One runtime dependency.** The **Telecom** side (fixed-field text) is Node stdlib only. The
  **SCRIPT** side (XML) uses a single vetted parser,
  [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) — zero transitive deps,
  namespace-aware, and configured XXE-safe (entity resolution disabled). That one dependency is
  ratified in the package's `docs/adr/0001-xml-parser.md`; no further runtime deps are added without a
  new ADR.

## Install

```bash
npm install @cosyte/ncpdp
```

## Smoke test

Confirm the package resolves and a real entry point is callable — parse the smallest valid SCRIPT
message and read its version back:

```ts runnable
import { parseScript } from "@cosyte/ncpdp/script";

const msg = parseScript('<Message version="2017071"><Header /><Body /></Message>');

msg.header.version; // => "2017071"
Array.isArray(msg.warnings); // => true
```

If that resolves and returns, the install is good — head to the [Quickstart](./quickstart).

## Module systems and subpaths

`@cosyte/ncpdp` is `"type": "module"` and exposes both conditions, so both of these resolve to the
right build without extra configuration:

```ts
// ESM / TypeScript
import { parseScript } from "@cosyte/ncpdp/script";
import { parseTelecom } from "@cosyte/ncpdp/telecom";
```

```js
// CommonJS
const { parseScript } = require("@cosyte/ncpdp/script");
const { parseTelecom } = require("@cosyte/ncpdp/telecom");
```

The four subpaths — `@cosyte/ncpdp` (root), `@cosyte/ncpdp/script`, `@cosyte/ncpdp/telecom`,
`@cosyte/ncpdp/common`, and `@cosyte/ncpdp/profiles` — each publish per-condition types (`.d.ts` for
`import`, `.d.cts` for `require`), gated by `attw` on every release, and resolve under both `node16`
and legacy `node10` module resolution. Editor IntelliSense matches the build you actually load.

## PHI discipline

Every example in this documentation uses **synthetic** fixtures — no real patient names, member IDs,
prescriber NPIs, or NDCs. Do the same in your own tests: NCPDP messages carry PHI, and a fixture
committed to a repository is a leak the moment it publishes. See
[Troubleshooting](./troubleshooting) for how the parser keeps field content out of its warnings and
logs.

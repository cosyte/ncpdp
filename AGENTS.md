# AGENTS.md

`@cosyte/ncpdp` is our TypeScript parser, serializer, and builder for the two NCPDP standards:
Telecom pharmacy claims and their responses (`@cosyte/ncpdp/telecom`) and SCRIPT XML ePrescribing
(`@cosyte/ncpdp/script`), with shared vocabulary in `@cosyte/ncpdp/common`. It is published on npm
under MIT.

## Build and test

Use Node.js 22.22.2 or later (the floor `@cosyte/process` sets for the dev tools; the package itself
runs on any Node 22) and the pnpm that `packageManager` in `package.json` pins.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## The gate

Run all of these from the repository root, in this order, before you push. CI runs the same checks.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm phi-scan
pnpm test
pnpm test:coverage
pnpm build
pnpm attw
pnpm check:test-selection
pnpm check:documents
pnpm check:no-emdash
pnpm check:no-internal-refs
pnpm publish --dry-run --no-git-checks --ignore-scripts
npm pack --dry-run --ignore-scripts
```

## Rules

- Synthetic data only. Real patient data never enters this repository: not in a fixture, a test, a
  log, an issue, or a commit. `pnpm phi-scan` runs on every commit.
- A change a consumer can see carries a changeset (`pnpm changeset`); `.changeset/README.md` says
  which bump to pick.
- No em or en dashes anywhere, commit messages included.

`CLAUDE.md` holds the rules that bind changes here and the failure behind each. Contributions follow
the organization's [contributing guide](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md).

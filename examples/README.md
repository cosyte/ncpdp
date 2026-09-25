# Examples

Three small programs, one for each job the [README](../README.md) describes. Each imports
`@cosyte/ncpdp/<subpath>` by its package name, which Node resolves through this package's own
`exports` map to the built `dist/`, prints what it read, checks its own output, and exits non-zero on
a mismatch. The inputs are the repository's committed synthetic fixtures under `test/fixtures/`, or
values written inline, and every one of them is synthetic.

```bash
pnpm install
pnpm build
pnpm examples                      # run all three
pnpm tsx examples/read-newrx.ts    # or one
```

| Example                                              | What it shows                                                                                                                  | Reads                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [`read-newrx.ts`](./read-newrx.ts)                   | A SCRIPT NewRx read field by field: patient, drug, NDC, quantity and the SIG text, with no warnings.                           | `test/fixtures/script/newrx-quickstart.xml`                                   |
| [`read-pbm-response.ts`](./read-pbm-response.ts)     | A Telecom PBM response: a paid claim with its DUR alert, and a rejected one whose unlabelled reject code is kept, not dropped. | `test/fixtures/telecom/pbm-response-dur.ncpdp` and `pbm-reject-unknown.ncpdp` |
| [`build-telecom-claim.ts`](./build-telecom-claim.ts) | A spec-clean Telecom B1 claim built, serialized and read back, with the quantity scaled string-wise and the bytes stable.      | values written inline                                                         |

`pnpm examples` runs `scripts/run-examples.ts`, which fails if any example exits non-zero or stops
before printing its final `<name>: ok` line. CI runs it on every pull request, after the build.

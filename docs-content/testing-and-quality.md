---
id: testing-and-quality
title: Testing and quality
sidebar_label: Testing and quality
description: "How we test @cosyte/ncpdp: unit tests, fixtures, property-based tests, fuzzing, guarded documents, and the PHI scan, with what each catches and misses."
---

# Testing and quality

This page describes how we test `@cosyte/ncpdp`, what each technique catches, and what it cannot.
The shared rules every Cosyte package follows (the coverage and mutation floors, the property-based
runners, what a pull request must prove) are written down in the testing standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

The failure we test hardest against is the quiet one: a field read at the wrong offset, or a reject
lost on the way, that still looks like a valid result. So most of what follows checks values, not
only that the parser did not throw.

## What we run, and what each technique catches

| Technique            | What it catches                                                                                                                                                                                                                                                                                                                                      | What it cannot catch                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Unit tests           | each documented behavior and each failure path of every module, run against the source                                                                                                                                                                                                                                                               | an input nobody thought to write down                                                               |
| Synthetic fixtures   | a regression on a known message shape: SCRIPT NewRx, response, and lifecycle messages, Telecom requests and responses, and the vendor conventions the built-in profiles describe                                                                                                                                                                     | a shape the fixtures do not hold; behavior on real traffic, since every fixture is synthetic        |
| Property-based tests | a whole class of input breaking a stated rule: arbitrary input never throws outside the fatal codes, a parsed result cannot be changed in place, a message survives serializing and parsing again, any reject code makes a response rejected, money decodes to an exact decimal, no DUR alert, compound ingredient, or other-payer amount is dropped | a rule nobody stated; a case outside the cases run; a gap in what the generators produce            |
| Fuzzing              | a crash, a hang, or a runaway allocation on hostile input: the Telecom byte tokenizer under arbitrary bytes and separator soup, and the SCRIPT loader under entity and document type declarations                                                                                                                                                    | a wrong but plausible result, unless a property states what right is                                |
| Coverage gate        | code no test runs: lines, branches, functions, and statements, held at a floor across the package and in each source directory                                                                                                                                                                                                                       | a test that runs code without checking what it returns                                              |
| Mutation testing     | a test that runs code but would not notice it changing                                                                                                                                                                                                                                                                                               | not yet run on this package; the numbers below say so until it is                                   |
| Guarded documents    | a page that drifts from the code: the conformance statement against the versions the code decodes, the documentation against every exported diagnostic code, the Telecom segment codes against the segment inventory, and every sample on these pages run against the built package with its `// =>` values checked                                  | prose that is wrong beside a sample or a table that is right                                        |
| PHI scan             | a realistic patient identifier in a fixture or a staged file, checked against a declared allow list of synthetic values                                                                                                                                                                                                                              | anything outside the fields and formats it knows; it detects after a write, it does not prevent one |

There is no differential testing against another NCPDP implementation: NCPDP's redistribution
limits rule out a corpus shared with a licensed reference parser, and the
[Conformance statement](./conformance.md) says what stands in for one.

## How each one runs

- **Unit tests, fixtures, properties, the guarded documents, and the doc samples** run in one Vitest
  suite on every pull request and on `main`, on each Node.js version the package supports. Each fuzz
  target runs at a fixed number of cases there.
- **Fuzzing** also runs every night for a time budget instead of a case count, from a seed that
  changes with each run, so each night explores different input. A failure prints the seed that
  replays it and opens an issue.
- **The coverage gate** runs with the suite. A floor that is not met fails the pull request.
- **The PHI scan** runs on every commit (a pre-commit hook) and in CI.

## Run them yourself

```bash
pnpm install --frozen-lockfile
pnpm test               # unit tests, fixtures, properties, guarded documents and doc samples
pnpm test:coverage      # the same suite with the coverage gate
pnpm fuzz               # the property and fuzz layer on its own
pnpm phi-scan           # the PHI scan over the repository

# A longer fuzz run, as the nightly job runs it:
NCPDP_FUZZ_SECONDS=120 pnpm fuzz
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.

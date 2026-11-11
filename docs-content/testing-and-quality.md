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

| Technique            | What it catches                                                                                                                                                                                                                                                                                                                                      | What it cannot catch                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Unit tests           | each documented behavior and each failure path of every module, run against the source                                                                                                                                                                                                                                                               | an input nobody thought to write down                                                                                         |
| Synthetic fixtures   | a regression on a known message shape: SCRIPT NewRx, response, and lifecycle messages, Telecom requests and responses, and the vendor conventions the built-in profiles describe                                                                                                                                                                     | a shape the fixtures do not hold; behavior on real traffic, since every fixture is synthetic                                  |
| Property-based tests | a whole class of input breaking a stated rule: arbitrary input never throws outside the fatal codes, a parsed result cannot be changed in place, a message survives serializing and parsing again, any reject code makes a response rejected, money decodes to an exact decimal, no DUR alert, compound ingredient, or other-payer amount is dropped | a rule nobody stated; a case outside the cases run; a gap in what the generators produce                                      |
| Fuzzing              | a crash, a hang, or a runaway allocation on hostile input: the Telecom byte tokenizer under arbitrary bytes and separator soup, and the SCRIPT loader under entity and document type declarations                                                                                                                                                    | a wrong but plausible result, unless a property states what right is                                                          |
| Coverage gate        | code no test runs: lines, branches, functions, and statements, held at 100 percent across the package and in each source directory, and at the floor file                                                                                                                                                                                            | a test that runs code without checking what it returns                                                                        |
| Mutation testing     | a test that runs code but would not notice it changing                                                                                                                                                                                                                                                                                               | every source file mutated weekly and every changed source file on each pull request; the score is held to a floor (see below) |
| Guarded documents    | a page that drifts from the code: the conformance statement against the versions the code decodes, the documentation against every exported diagnostic code, the Telecom segment codes against the segment inventory, and every sample on these pages run against the built package with its `// =>` values checked                                  | prose that is wrong beside a sample or a table that is right                                                                  |
| PHI scan             | a realistic patient identifier in a fixture or a staged file, checked against a declared allow list of synthetic values                                                                                                                                                                                                                              | anything outside the fields and formats it knows; it detects after a write, it does not prevent one                           |

There is no differential testing against another NCPDP implementation: NCPDP's redistribution
limits rule out a corpus shared with a licensed reference parser, and the
[Conformance statement](./conformance.md) says what stands in for one.

## How each one runs

- **Unit tests, fixtures, properties, the guarded documents, and the doc samples** run in one Vitest
  suite on every pull request and on `main`, on Node.js 22, 24 and 26, each on Linux, Windows and
  macOS. The same suite runs again under Bun and under Deno, each in its own job.
- **Property tests** run at least 100 cases each on a pull request, and more where a test names more
  (the fuzz targets run from 100 to 4,000). Every night they run again at 10,000 cases each
  (`COSYTE_PROPERTY_RUNS=10000`). A failure prints the seed and path that replay it
  (`COSYTE_PROPERTY_SEED`, `COSYTE_PROPERTY_PATH`), and the nightly run records each one in its
  summary.
- **Fuzzing** also runs every night for a time budget instead of a case count, from a seed that
  changes with each run, so each night explores different input. A failure prints the seed that
  replays it and opens an issue.
- **The coverage gate** runs with the suite, at 100 percent for lines, branches, functions and
  statements. A ratchet then holds coverage to `quality-floor.json`, and on a pull request every
  changed line that coverage counts must have run and no floor may be lowered or removed.
- **Mutation testing** runs with [StrykerJS](https://stryker-mutator.io/) on the shared Cosyte
  configuration. On a pull request it mutates each source file the change touched, and every mutant
  in the changed lines must be killed, unless an inline comment names why it cannot be. Twice a
  week the whole of `src/` is mutated, shared out across parallel jobs, and the score is held to the
  floor in `quality-floor.json`, which only rises. Mutants in code that runs once, when a module
  loads (the code tables), are left out of the score: no test can be traced to them, and coverage
  still holds every such line to having run. The mutation runs leave out the timing tests, the
  tests of our own tooling under `scripts/`, which test no library code, and the tests that read
  the source files as text, which StrykerJS rewrites while it runs.
- **The PHI scan** runs on every commit (a pre-commit hook) and in CI.

## Run them yourself

```bash
pnpm install --frozen-lockfile
pnpm test               # unit tests, fixtures, properties, guarded documents and doc samples
pnpm test:coverage      # the same suite with the coverage gate
pnpm quality:check      # coverage against the floor file, after test:coverage
pnpm fuzz               # the property and fuzz layer on its own
pnpm phi-scan           # the PHI scan over the repository

# The properties at the nightly depth, and a replay of a failure it printed:
COSYTE_PROPERTY_RUNS=10000 pnpm fuzz
COSYTE_PROPERTY_SEED=<seed> COSYTE_PROPERTY_PATH=<path> pnpm fuzz

# A longer fuzz run, as the nightly job runs it:
NCPDP_FUZZ_SECONDS=120 pnpm fuzz

# Mutation testing: the files a change touched, then the whole package (this takes a while)
pnpm mutate changed --base origin/main && pnpm quality:mutation --base origin/main
pnpm mutate:full && pnpm quality:mutation
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.

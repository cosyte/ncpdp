---
id: performance
title: Performance
sidebar_label: Performance
description: "What we measure on @cosyte/ncpdp (throughput, latency, memory, import time, and bundle size), on which inputs, and how a pull request is checked."
---

# Performance

This page describes what we measure on `@cosyte/ncpdp` and how. The shared method every Cosyte
package follows (throughput, latency percentiles, memory, import time and bundle size, and how a pull
request is compared with `main`) is written down in the performance standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

## The inputs

Every input is synthetic and built in code by the benchmark itself, so a run is the same anywhere
and carries no patient data. They take the shapes real traffic has:

- **A NewRx** of about 3 KiB with a structured sig: what a prescriber's system sends all day.
- **A B1 claim**: one Telecom transmission with one claim, what a pharmacy system sends a processor
  for every fill.
- **A medication history**: a SCRIPT `RxHistoryResponse` of 100, 1,000 and 4,000 dispensed
  medications (from about 130 KiB to 5 MiB).
- **A batch of B1 claims**: 100, 1,000 and 10,000 claims, four to a transmission. Batch framing is
  not decoded by this package, so a batch is the list of its transmissions.
- **A NewRx with one large base64 value** in its medication note, at 64 KiB and 4 MiB: a large
  opaque payload.

Each is parsed (`parseScript`, `parseTelecom`), parsed and validated (with a trading-partner
profile, every view a pharmacy or claims system reads, and `partitionWarnings`), and, where the
package has a builder for it, built from plain objects and serialized.

## What is measured

For every input and operation, on the built package a consumer imports:

- **Throughput**, in operations and bytes a second.
- **Latency** at the 50th, 95th, and 99th percentiles of one call.
- **Memory**: allocations per operation, the peak heap of one call, and whether the heap stays flat
  over a long run.
- **Cold import time** of the root and of each subpath, and the files the root import loads with
  their **gzipped size**.

A reading is taken on a GitHub-hosted runner by the `Bench reading` workflow, which also reads the
numbers against the budgets below and takes a CPU and heap profile of the hottest paths. To take one
yourself, build, then run `pnpm bench:reading`, `pnpm bench:budgets` and `pnpm bench:profile`.

The proposed budgets are a peak heap under 20 times the input for a dense message and under 3 times
for a large opaque payload, a cold import under 15 ms, and throughput, in bytes a second, not falling
by more than half from a shape's smallest size to its largest. They are a direction, not a gate.

The suite also measures a **floor**: a call that reads its input's length and allocates nothing. Its
peak heap is what the harness itself reads for any call, so for an input of a few hundred bytes the
budget reports each peak above the floor beside the raw one.

## How a pull request is checked

Two jobs run on every pull request, beside the tests:

- **The scaling gate** (`pnpm test:perf`) asks whether parsing cost grows faster than the input: 4
  times the messages, and messages 4 times longer (a medication history with 4 times the entries, a
  Telecom transmission with 4 times the claims). Its self-check proves the gate would fail on a
  parse made quadratic at exactly these sizes. A gate that fails is a red check.
- **The base against head comparison** times the small inputs on the pull request's base and on its
  head, interleaved on one runner. It is advisory: it posts its numbers and fails nothing.

The fuzz targets bound time per input too: each fails a case that takes more processor time than a
small fixed allowance plus a share for each byte of input, and fails a case whose heap grows past a
fixed ceiling.

## What these numbers are not

- **Not a promise for a deployment.** Message sizes, the machine, and its load decide what a
  deployment sees.
- **Not a comparison with other libraries.** That is a separate suite with its own written method.
- **Not a behavior contract.** Nothing here changes how a message parses.

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.

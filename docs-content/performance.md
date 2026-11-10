---
id: performance
title: Performance
sidebar_label: Performance
description: "What we will measure on @cosyte/ncpdp (throughput, latency, memory, import time, and bundle size), how, and what is measured today."
---

# Performance

This page describes what we measure on `@cosyte/ncpdp` and how. The shared method every Cosyte
package follows (throughput, latency percentiles, memory, import time and bundle size, and how a pull
request is compared with `main`) is written down in the performance standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

## What is measured today

No benchmark runs on this package yet, so this page has no figures. What the tests already bound is
time per input, not speed: each fuzz target fails a case that takes more processor time than a small
fixed allowance plus a share for each byte of input, and fails a case whose heap grows past a fixed
ceiling. That catches a hang, a path that grows faster than its input, and a runaway allocation. It
says nothing about throughput.

## What the benchmarks will measure

Following the performance standard, for both standards:

- **Throughput**, in messages and megabytes a second, for SCRIPT messages and Telecom transmissions
  of a few sizes.
- **Latency** at the 50th, 95th, and 99th percentiles of one parse and one serialize.
- **Memory**: peak heap and allocations over a long run.
- **Import time** of the root and of each subpath, and the **bundle size** of each.

Inputs will be synthetic and generated in the process, so a run is the same anywhere and carries no
patient data. Until a figure is measured for a release, the section below says so for that figure.

## What these numbers are not

- **Not a promise for a deployment.** Message sizes, the machine, and its load decide what a
  deployment sees.
- **Not a comparison with other libraries.** That is a separate suite with its own written method.
- **Not a behavior contract.** Nothing here changes how a message parses.

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.

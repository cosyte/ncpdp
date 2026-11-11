// Benchmarks for @cosyte/ncpdp, on @cosyte/bench, against the built entry a consumer imports.
//
// A reading of this build (throughput, latency p50/p95/p99, allocations, peak heap, a long run for
// leaks, and the cold import with every file it loads and its gzip size):
//   pnpm build && pnpm bench:reading --out bench-results/reading.json
// One benchmark or one case only (as `<benchmark> / <size>` in the results):
//   pnpm bench:reading --only "parseScript: NewRx"
// A base against head comparison, the base built in another checkout:
//   pnpm bench:compare --base <base checkout>/dist/index.mjs --head dist/index.mjs
// The budgets, and the single-run numbers and CPU and heap profile of the hottest paths:
//   pnpm bench:budgets bench-results/reading.json
//   pnpm bench:profile
// On a pull request CI runs the comparison in its bench-compare job, and the bench-reading workflow
// takes a reading and a profile on a GitHub-hosted runner. Both are advisory: they post their numbers
// and fail nothing.
//
// The suite is handed the module under test rather than importing it, so one file measures both
// builds. Every input is synthetic and built in code by bench/shapes.mjs: no file is read.
//
// Three operations, for each shape that has them:
// - parse: `parseScript` or `parseTelecom`, the lenient read every caller starts with;
// - parse and validate: the parse with a trading-partner profile, then every view a pharmacy or
//   claims system reads (the NewRx and its structured sig; for Telecom, each transaction's claim,
//   DUR, compound, COB and prior authorization views), then the warnings triaged against the
//   profile with `partitionWarnings`. This package has no validator apart from its parse: every
//   check it makes is a warning the parse or a view raises;
// - build: `buildNewRx` or `buildTelecomRequest` from plain objects, then `serializeScript` or
//   `serializeTelecom`. A medication history has no builder (the package does not model an
//   RxHistoryResponse), so it is parsed and validated only.

import { defineBenchmark, defineSuite } from "@cosyte/bench";

import {
  KIB,
  b1Batch,
  b1Claim,
  b1Requests,
  b1Request,
  medicationHistory,
  newRx,
  newRxInput,
  noteNewRx,
  noteNewRxInput,
} from "./shapes.mjs";

// Each shape at the size real traffic has and, where traffic has a large form, at sizes well past
// it. `compare` names the operations a pull request's comparison times at that size: a comparison
// runs every case 24 times in fresh processes within a 600 second budget, so it takes the small
// sizes of the busiest paths only. A reading measures every case.
const SHAPES = [
  {
    name: "NewRx",
    standard: "script",
    operations: ["parse", "validate", "build"],
    sizes: [
      // The message a prescriber's system sends all day. 64 of them, so a pass is not one string
      // repeated.
      {
        label: "3 KiB",
        inputs: 64,
        text: (i) => newRx(i),
        build: (i) => newRxInput(i),
        compare: ["parse", "build"],
      },
    ],
  },
  {
    name: "B1 claim",
    standard: "telecom",
    operations: ["parse", "validate", "build"],
    sizes: [
      // The claim a pharmacy system sends a processor for every fill.
      {
        label: "1 claim, 291 B",
        inputs: 64,
        text: (i) => b1Claim(i),
        build: (i) => b1Request(i),
        compare: ["parse", "build"],
      },
    ],
  },
  {
    name: "medication history",
    standard: "script",
    operations: ["parse", "validate"],
    sizes: [
      {
        label: "100 entries, 130 KiB",
        inputs: 4,
        text: (i) => medicationHistory(i, 100),
        compare: ["parse"],
      },
      { label: "1,000 entries, 1.3 MiB", inputs: 1, text: (i) => medicationHistory(i, 1_000) },
      { label: "4,000 entries, 5 MiB", inputs: 1, text: (i) => medicationHistory(i, 4_000) },
    ],
  },
  {
    // A batch is the list of its transmissions, four claims to each: batch framing is not decoded
    // by this package, so a batch processor hands the transmissions over one by one. One call reads
    // the whole batch and keeps every result, as a caller answering the batch does.
    name: "B1 batch",
    standard: "telecom",
    batch: true,
    operations: ["parse", "validate", "build"],
    sizes: [
      {
        label: "100 claims, 19 KiB",
        inputs: 4,
        text: (i) => b1Batch(100, i),
        build: (i) => b1Requests(100, i),
        compare: ["parse"],
      },
      {
        label: "1,000 claims, 188 KiB",
        inputs: 1,
        text: () => b1Batch(1_000),
        build: () => b1Requests(1_000),
      },
      {
        label: "10,000 claims, 1.8 MiB",
        inputs: 1,
        text: () => b1Batch(10_000),
        build: () => b1Requests(10_000),
      },
    ],
  },
  {
    // One large text value, base64, in the medication note: the large opaque payload.
    name: "NewRx with a base64 note",
    standard: "script",
    operations: ["parse", "build"],
    sizes: [
      {
        label: "64 KiB",
        inputs: 4,
        text: (i) => noteNewRx(i, 64 * KIB),
        build: (i) => noteNewRxInput(i, 64 * KIB),
      },
      {
        label: "4 MiB",
        inputs: 1,
        text: (i) => noteNewRx(i, 4096 * KIB),
        build: (i) => noteNewRxInput(i, 4096 * KIB),
      },
    ],
  },
];

/** The bytes of one input: its text, or the sum of a batch's transmissions. */
function bytesOf(text) {
  return Array.isArray(text)
    ? text.reduce((n, t) => n + Buffer.byteLength(t), 0)
    : Buffer.byteLength(text);
}

/**
 * The sizes of a shape for one operation, as @cosyte/bench takes them: each corpus built in code,
 * with its bytes. A build case is weighed by the wire bytes of the message it writes, so its bytes a
 * second read on the same scale as the parse's.
 */
function sizes(shape, operation) {
  return shape.sizes.map((size) => ({
    label: size.label,
    compare: size.compare?.includes(operation) ?? false,
    build: () => {
      const texts = Array.from({ length: size.inputs }, (_v, i) => size.text(i));
      const bytes = texts.reduce((n, t) => n + bytesOf(t), 0);
      if (operation !== "build") return { inputs: texts, bytes };
      return { inputs: Array.from({ length: size.inputs }, (_v, i) => size.build(i)), bytes };
    },
  }));
}

/** Read a parsed SCRIPT message the way a pharmacy system does, and triage its warnings. */
function readScript(ncpdp, message, profile) {
  let n = 1;
  const rx = message.asNewRx();
  if (rx !== undefined) {
    const med = rx.medication;
    n += med?.sig === undefined ? 0 : 1;
    n += med?.quantity?.value?.isValid === true ? 1 : 0;
    n += rx.patient?.name === undefined ? 0 : 1;
  }
  n += message.disposition === undefined ? 0 : 1;
  return n + ncpdp.partitionWarnings(message.warnings, profile).unexpected.length;
}

/** Read every transaction of a parsed Telecom transmission, and triage its warnings. */
function readTelecom(ncpdp, transmission, profile) {
  let n = 1;
  for (let i = 0; i < transmission.transactions.length; i++) {
    n += ncpdp.claim(transmission, i) === undefined ? 0 : 1;
    n += ncpdp.requestDur(transmission, i).length;
    n += ncpdp.compound(transmission, i) === undefined ? 0 : 1;
    n += ncpdp.cobOtherPayments(transmission, i).length;
    n += ncpdp.priorAuthorization(transmission, i) === undefined ? 0 : 1;
  }
  return n + ncpdp.partitionWarnings(transmission.warnings, profile).unexpected.length;
}

/** The function a benchmark times, for one shape and one operation, bound to the module. */
function bind(shape, operation) {
  const script = shape.standard === "script";
  return (ncpdp) => {
    const profile = script ? ncpdp.profiles.surescripts : ncpdp.profiles.pbm;
    const parse = script ? (text) => ncpdp.parseScript(text) : (text) => ncpdp.parseTelecom(text);
    const validate = script
      ? (text) => readScript(ncpdp, ncpdp.parseScript(text, { profile }), profile)
      : (text) => readTelecom(ncpdp, ncpdp.parseTelecom(text, { profile }), profile);
    const build = script
      ? (input) => ncpdp.serializeScript(ncpdp.buildNewRx(input))
      : (input) => ncpdp.serializeTelecom(ncpdp.buildTelecomRequest(input));
    const one = { parse, validate, build }[operation];
    // A batch call keeps every result, as a caller answering the batch does.
    return shape.batch === true ? (list) => list.map(one) : one;
  };
}

/** The number a result is reduced to, so the call is not dead code. */
function weigh(shape, operation) {
  const one = {
    parse: (m) => m.warnings.length + 1,
    validate: (n) => n,
    build: (text) => text.length,
  }[operation];
  return shape.batch === true ? (list) => list.reduce((n, r) => n + one(r), 0) : one;
}

/** The name of the floor benchmark; bench/budgets.mjs reads it apart from the rest by its prefix. */
const FLOOR_BENCHMARK = "floor: a call that allocates nothing";

const NAMES = {
  script: { parse: "parseScript", validate: "parseScript, validating", build: "buildNewRx" },
  telecom: {
    parse: "parseTelecom",
    validate: "parseTelecom, validating",
    build: "buildTelecomRequest",
  },
};

const benchmarks = [];
for (const shape of SHAPES) {
  for (const operation of shape.operations) {
    const name = NAMES[shape.standard][operation];
    benchmarks.push(
      defineBenchmark({
        name: `${operation === "build" ? `${name}, then serialize` : name}: ${shape.name}`,
        sizes: sizes(shape, operation),
        bind: bind(shape, operation),
        weigh: weigh(shape, operation),
      }),
    );
  }
}

// The floor: a call that reads its input's length and allocates nothing, on the B1 claim's input.
// Its peak heap is what the harness itself reads for any call, so a small case's peak is read
// against it: bench/budgets.mjs reports each multiple above the floor beside the raw one.
benchmarks.push(
  defineBenchmark({
    name: FLOOR_BENCHMARK,
    sizes: [
      {
        label: "291 B",
        compare: false,
        build: () => {
          const texts = Array.from({ length: 64 }, (_v, i) => b1Claim(i));
          return { inputs: texts, bytes: texts.reduce((n, t) => n + bytesOf(t), 0) };
        },
      },
    ],
    bind: () => (text) => text.length,
    weigh: (n) => n,
  }),
);

export default defineSuite({ name: "@cosyte/ncpdp", benchmarks });

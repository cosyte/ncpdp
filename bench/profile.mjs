// The time a pass of each operation takes at each shape's smallest and largest size, the cold import
// of every subpath, then a CPU profile and a sampled heap profile of the hottest paths, with the top
// functions of each:
//   pnpm build && pnpm bench:profile [--out <dir>] [--summary <file.md>]
//
// Each workload is warmed, then profiled on its own for about two seconds through the inspector
// (node:inspector/promises), so a function's share is a share of that workload alone. With
// --enable-source-maps and the build's source map beside it, a function is named by its src/ file
// and line; without, by the built file. `--out` keeps every .cpuprofile and .heapprofile for a
// profiler's own view (Chrome DevTools, speedscope). The inputs are the bench's own, from
// bench/shapes.mjs: synthetic, built in code.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { findSourceMap } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  KIB,
  b1Batch,
  b1Claim,
  b1Requests,
  medicationHistory,
  newRx,
  newRxInput,
  noteNewRx,
} from "./shapes.mjs";

const PROFILE_MS = 2_000;
const WARMUP_MS = 500;
const TOP = 12;
const SAMPLES = 9;
const SAMPLE_MS = 100;
const IMPORT_RUNS = 15;

function args(argv) {
  const out = { target: argv[0], dir: undefined, summary: undefined };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--out") out.dir = argv[++i];
    else if (argv[i] === "--summary") out.summary = argv[++i];
  }
  return out;
}

/** Run `pass` until `ms` have gone by; returns how many passes ran. */
function runFor(pass, ms) {
  const end = performance.now() + ms;
  let passes = 0;
  let sink = 0;
  while (performance.now() < end) {
    sink += pass();
    passes++;
  }
  if (sink < 0) throw new Error("unreachable");
  return passes;
}

/** Milliseconds a pass, one sample: whole passes until at least `SAMPLE_MS` have gone by. */
function sample(pass) {
  const start = performance.now();
  let passes = 0;
  let sink = 0;
  while (performance.now() - start < SAMPLE_MS) {
    sink += pass();
    passes++;
  }
  if (sink < 0) throw new Error("unreachable");
  return (performance.now() - start) / passes;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The median milliseconds a pass of `pass`, warmed. One workload at a time: alternating a small
 * input with a large one charges the small one for collecting the large one's garbage.
 */
function msPerPass(pass) {
  runFor(pass, WARMUP_MS);
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) samples.push(sample(pass));
  return median(samples);
}

function mib(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/** Where a call frame is: its src/ file and line through the source map when there is one. */
function locate(frame) {
  const line = frame.lineNumber;
  if (frame.url === "") return "(native)";
  let where = frame.url;
  try {
    const path = frame.url.startsWith("file:") ? fileURLToPath(frame.url) : frame.url;
    const map = findSourceMap(path);
    const entry = map?.findEntry(line, frame.columnNumber);
    if (entry !== undefined && entry.originalSource !== undefined) {
      const source = entry.originalSource.replace(/^.*?(src\/)/, "$1");
      return `${source}:${String(entry.originalLine + 1)}`;
    }
    where = path.replace(/^.*?(dist\/|bench\/|node_modules\/)/, "$1");
  } catch {
    // An unparseable URL keeps its own text.
  }
  return `${where}:${String(line + 1)}`;
}

function key(frame) {
  return `${frame.functionName === "" ? "(anonymous)" : frame.functionName} ${locate(frame)}`;
}

function isProfilerFrame(frame) {
  return (
    frame.url.startsWith("node:inspector") ||
    frame.functionName === "(program)" ||
    frame.functionName === "(idle)"
  );
}

/** Self time by function, from a CPU profile: the share of samples each one was on top. */
function topSelfTime(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    // The profiler's own start and stop, and time the process spent outside JavaScript, are not
    // the workload's.
    if (isProfilerFrame(node.callFrame)) continue;
    const dt = profile.timeDeltas[i] ?? 0;
    total += dt;
    const k = key(node.callFrame);
    self.set(k, (self.get(k) ?? 0) + dt);
  }
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name, us]) => ({ name, share: us / total }));
}

/** Bytes allocated by function, from a sampled heap profile (sampled, so an estimate). */
function topAllocations(profile) {
  const self = new Map();
  let total = 0;
  const walk = (node) => {
    if (!isProfilerFrame(node.callFrame) && node.selfSize > 0) {
      const k = key(node.callFrame);
      self.set(k, (self.get(k) ?? 0) + node.selfSize);
      total += node.selfSize;
    }
    for (const child of node.children) walk(child);
  };
  walk(profile.head);
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name, bytes]) => ({ name, share: total === 0 ? 0 : bytes / total }));
}

/**
 * The cold import of one built entry: the median over fresh processes of the time its dynamic
 * import takes, measured inside each process, so process start is not counted.
 */
function coldImportMs(file) {
  const url = pathToFileURL(file).href;
  const code = `const t = performance.now(); await import(${JSON.stringify(url)}); process.stdout.write(String(performance.now() - t));`;
  const runs = [];
  for (let i = 0; i < IMPORT_RUNS; i++) {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      encoding: "utf8",
    });
    if (child.status !== 0) return undefined;
    runs.push(Number(child.stdout));
  }
  return median(runs);
}

async function main() {
  const options = args(process.argv.slice(2));
  if (options.target === undefined) {
    process.stderr.write(
      "usage: node bench/profile.mjs <dist/index.mjs> [--out <dir>] [--summary <file.md>]\n",
    );
    return 2;
  }
  const target = resolve(options.target);
  const ncpdp = await import(pathToFileURL(target).href);
  const { surescripts, pbm } = ncpdp.profiles;

  const lines = [
    "### Cold import of each entry",
    "",
    `The median over ${String(IMPORT_RUNS)} fresh processes of the time one dynamic import takes, measured inside the process (process start not counted).`,
    "",
    "| Entry | Median |",
    "| --- | --- |",
  ];
  const dist = dirname(target);
  for (const entry of [
    "index",
    "script/index",
    "telecom/index",
    "common/index",
    "profiles/index",
  ]) {
    const ms = coldImportMs(resolve(dist, `${entry}.mjs`));
    lines.push(
      `| \`dist/${entry}.mjs\` | ${ms === undefined ? "could not import" : `${ms.toFixed(2)} ms`} |`,
    );
  }

  // A pass of one input; a batch pass reads every transmission and keeps every result.
  const operations = {
    parseScript: (text) => () => ncpdp.parseScript(text).warnings.length + 1,
    parseScriptValidating: (text) => () => {
      const m = ncpdp.parseScript(text, { profile: surescripts });
      return ncpdp.partitionWarnings(m.warnings, surescripts).unexpected.length + 1;
    },
    parseTelecomBatch: (list) => () =>
      list.map((t) => ncpdp.parseTelecom(t)).reduce((n, t) => n + t.transactions.length, 0),
    buildTelecomBatch: (requests) => () =>
      requests
        .map((r) => ncpdp.serializeTelecom(ncpdp.buildTelecomRequest(r)))
        .reduce((n, t) => n + t.length, 0),
    buildNewRx: (input) => () => ncpdp.serializeScript(ncpdp.buildNewRx(input)).length,
  };

  // Each scaling shape at its smallest and largest size, as bench/ncpdp.bench.mjs has them. Before
  // the profiles' inputs are built and held: a heap already holding them makes every collection
  // dearer.
  const PAIRS = [
    {
      operation: "parseScript",
      shape: "medication history",
      smallLabel: "100 entries",
      largeLabel: "4,000 entries",
      small: () => medicationHistory(0, 100),
      large: () => medicationHistory(0, 4_000),
      pass: operations.parseScript,
    },
    {
      operation: "parseScript, validating",
      shape: "medication history",
      smallLabel: "100 entries",
      largeLabel: "4,000 entries",
      small: () => medicationHistory(0, 100),
      large: () => medicationHistory(0, 4_000),
      pass: operations.parseScriptValidating,
    },
    {
      operation: "parseTelecom",
      shape: "B1 batch",
      smallLabel: "100 claims",
      largeLabel: "10,000 claims",
      small: () => b1Batch(100),
      large: () => b1Batch(10_000),
      pass: operations.parseTelecomBatch,
    },
    {
      operation: "buildTelecomRequest, then serialize",
      shape: "B1 batch",
      smallLabel: "100 claims",
      largeLabel: "10,000 claims",
      small: () => b1Requests(100),
      large: () => b1Requests(10_000),
      bytes: (n) => b1Batch(n === "small" ? 100 : 10_000),
      pass: operations.buildTelecomBatch,
    },
    {
      operation: "parseScript",
      shape: "NewRx with a base64 note",
      smallLabel: "64 KiB",
      largeLabel: "4 MiB",
      small: () => noteNewRx(0, 64 * KIB),
      large: () => noteNewRx(0, 4096 * KIB),
      pass: operations.parseScript,
    },
  ];
  const bytesOf = (x) =>
    Array.isArray(x) ? x.reduce((n, t) => n + Buffer.byteLength(t), 0) : Buffer.byteLength(x);
  lines.push(
    "",
    "### Throughput, smallest size against largest",
    "",
    `A reading cannot time a case of a megabyte or more when its warmup never settles, and skips it. This times every size the same simpler way: warmed, then the median of ${String(SAMPLES)} samples of at least ${String(SAMPLE_MS)} ms of whole passes (a single pass when one takes longer), one size at a time, in one process. A build is weighed by the bytes it writes.`,
    "",
    "| Operation | Shape | Smallest | Largest | ms a pass, smallest | ms a pass, largest | Bytes/s, smallest | Bytes/s, largest | Kept |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const pair of PAIRS) {
    const small = pair.small();
    const msSmall = msPerPass(pair.pass(small));
    const bytesSmall = bytesOf(pair.bytes === undefined ? small : pair.bytes("small"));
    const large = pair.large();
    const msLarge = msPerPass(pair.pass(large));
    const bytesLarge = bytesOf(pair.bytes === undefined ? large : pair.bytes("large"));
    const rateSmall = bytesSmall / (msSmall / 1000);
    const rateLarge = bytesLarge / (msLarge / 1000);
    lines.push(
      `| ${pair.operation} | ${pair.shape} | ${pair.smallLabel} | ${pair.largeLabel} | ${msSmall.toFixed(2)} | ${msLarge.toFixed(2)} | ${mib(rateSmall)}/s | ${mib(rateLarge)}/s | ${((rateLarge / rateSmall) * 100).toFixed(0)}% |`,
    );
  }

  const history = medicationHistory(0, 4_000);
  const feed = Array.from({ length: 64 }, (_v, i) => newRx(i));
  const feedInputs = Array.from({ length: 64 }, (_v, i) => newRxInput(i));
  const claims = Array.from({ length: 64 }, (_v, i) => b1Claim(i));
  const batch = b1Batch(10_000);
  const requests = b1Requests(1_000);
  const note = noteNewRx(0, 4096 * KIB);

  const workloads = [
    {
      name: "parseScript: medication history, 4,000 entries",
      pass: operations.parseScript(history),
    },
    {
      name: "parseScript: 64 NewRx",
      pass: () => feed.reduce((n, text) => n + ncpdp.parseScript(text).warnings.length + 1, 0),
    },
    {
      name: "buildNewRx, then serialize: 64 NewRx",
      pass: () =>
        feedInputs.reduce(
          (n, input) => n + ncpdp.serializeScript(ncpdp.buildNewRx(input)).length,
          0,
        ),
    },
    {
      name: "parseTelecom: 64 B1 claims",
      pass: () => claims.reduce((n, text) => n + ncpdp.parseTelecom(text).warnings.length + 1, 0),
    },
    {
      name: "parseTelecom, validating: B1 batch, 10,000 claims",
      pass: () =>
        batch.reduce((n, text) => {
          const t = ncpdp.parseTelecom(text, { profile: pbm });
          for (let i = 0; i < t.transactions.length; i++) {
            n += ncpdp.claim(t, i) === undefined ? 0 : 1;
            n += ncpdp.requestDur(t, i).length;
          }
          return n + ncpdp.partitionWarnings(t.warnings, pbm).unexpected.length;
        }, 0),
    },
    {
      name: "buildTelecomRequest, then serialize: 1,000 claims",
      pass: operations.buildTelecomBatch(requests),
    },
    { name: "parseScript: NewRx with a 4 MiB base64 note", pass: operations.parseScript(note) },
  ];

  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  await session.post("HeapProfiler.enable");
  if (options.dir !== undefined) mkdirSync(options.dir, { recursive: true });

  lines.push(
    "",
    "### CPU and heap profile of the hottest paths",
    "",
    `Node ${process.version}. Each workload warmed for ${String(WARMUP_MS)} ms, then profiled alone for ${String(PROFILE_MS)} ms: self time from a CPU profile sampled every 100 us, and allocation from a sampled heap profile (an estimate).`,
  );
  for (const [index, w] of workloads.entries()) {
    runFor(w.pass, WARMUP_MS);
    // The heap sampler starts first and stops last, so the CPU profile holds the workload and not
    // the sampler's own start and stop. It keeps what a collection freed, so a function is charged
    // for everything it allocated, not only for what was still alive at the end.
    await session.post("HeapProfiler.startSampling", {
      samplingInterval: 16_384,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    await session.post("Profiler.start");
    const passes = runFor(w.pass, PROFILE_MS);
    const { profile: cpu } = await session.post("Profiler.stop");
    const { profile: heap } = await session.post("HeapProfiler.stopSampling");
    if (options.dir !== undefined) {
      writeFileSync(resolve(options.dir, `${String(index + 1)}.cpuprofile`), JSON.stringify(cpu));
      writeFileSync(resolve(options.dir, `${String(index + 1)}.heapprofile`), JSON.stringify(heap));
    }
    lines.push(
      "",
      `#### ${String(index + 1)}. ${w.name}`,
      "",
      `${String(passes)} passes in ${String(PROFILE_MS)} ms, ${(PROFILE_MS / passes).toFixed(2)} ms a pass.`,
      "",
      "| Self time | Function | Allocated | Function |",
      "| --- | --- | --- | --- |",
    );
    const cpuTop = topSelfTime(cpu);
    const heapTop = topAllocations(heap);
    for (let i = 0; i < TOP; i++) {
      const c = cpuTop[i];
      const h = heapTop[i];
      lines.push(
        `| ${c === undefined ? "" : `${(c.share * 100).toFixed(1)}%`} | ${c === undefined ? "" : `\`${c.name}\``} | ${h === undefined ? "" : `${(h.share * 100).toFixed(1)}%`} | ${h === undefined ? "" : `\`${h.name}\``} |`,
      );
    }
  }
  session.disconnect();
  const text = `${lines.join("\n")}\n`;
  process.stdout.write(text);
  if (options.summary !== undefined) writeFileSync(options.summary, text);
  return 0;
}

process.exitCode = await main();

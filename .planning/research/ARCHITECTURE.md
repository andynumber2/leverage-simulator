# Architecture Research

**Domain:** Static, client-side financial backtesting/simulation app with a build-time data pipeline
**Researched:** 2026-08-16
**Confidence:** HIGH (structural patterns are well-established: Web Workers, typed arrays, static-site data bundling, URL-as-state are all mature, widely-documented techniques). MEDIUM on the specific numeric tolerances/thresholds suggested below — those are starting points for the validation harness, not sourced constants.

## Standard Architecture

### System Overview

```
BUILD TIME (Node/Bun CLI, runs in repo, never ships to browser)
┌──────────────────────────────────────────────────────────────────────┐
│                          DATA COMPILER                                 │
│  ┌────────┐ ┌───────────┐ ┌─────────┐ ┌────────┐ ┌────────┐ ┌───────┐│
│  │ Ingest │→│  Calendar │→│ Splice/ │→│  Tier  │→│ Encode │→│Manifest││
│  │  CSVs  │ │  Align    │ │Interp.  │ │Assembly│ │ Binary │ │ Emit  ││
│  └────────┘ └───────────┘ └─────────┘ └────────┘ └────────┘ └───────┘│
│       every stage carries {source, nativeFrequency, seamDate} forward  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                    │ writes
                                    ▼
                    /public/data/{manifest.json, calendar.bin, *.bin}
                                    │ fetched at
                                    ▼
RUNTIME (browser, static assets only, Cloudflare Pages)
┌──────────────────────────────────────────────────────────────────────┐
│  URL STATE  ⇄  APP SHELL / STORE                                       │
│       ↓ hydrates                    ↑ serializes on change             │
│  ┌────────────┐                                                        │
│  │ Data Loader │ (fetch manifest → fetch .bin → decode → SoA cache)    │
│  └─────┬──────┘                                                        │
│        │ MarketData (typed arrays)                                     │
│        ▼                                                               │
│  ┌───────────────────────┐   single call    ┌────────────────────┐    │
│  │  SIMULATION KERNEL     │◄─────────────────│ Single-run UI panel │    │
│  │  (pure, allocation-    │   (main thread)  │ + Attribution view  │    │
│  │   free hot loop)       │──────────────────►                    │    │
│  └───────────┬────────────┘   equity buffer  └────────────────────┘    │
│              │ same kernel, 10k calls                                  │
│              ▼                                                         │
│  ┌────────────────────┐  chunk work  ┌──────────────┐                  │
│  │ Sweep Orchestrator  │─────────────►│ Worker Pool  │                 │
│  │ (partition/cancel/  │◄─────────────│ (kernel +    │                 │
│  │  memoize/stream)    │ stream cells │  per-cell    │                 │
│  └──────────┬──────────┘  (transfer)  │  metrics)    │                 │
│             │                          └──────────────┘                │
│             ▼                                                          │
│  ┌────────────────┐   ┌───────────┐   ┌──────────────┐                 │
│  │ Metrics/Attrib. │   │  Chart    │   │   Export     │                 │
│  │ (IRR, MDD, mult,│──►│ (heatmap  │   │  (PNG, CSV)  │                 │
│  │  ruin, decomp)  │   │  + lines) │   │              │                 │
│  └─────────────────┘   └───────────┘   └──────────────┘                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Boundary verdict |
|-----------|----------------|-------------------|
| Data compiler | Ingest raw CSVs, align calendars, splice/interpolate, assemble tiers, encode binary, emit manifest with provenance | **Matters.** Node-only, never ships to browser; different runtime, different correctness concerns (schema/CSV parsing vs performance). |
| Data loader | Fetch manifest + binary assets, decode into typed-array `MarketData`, cache per symbol/tier | **Matters, but thin.** Just fetch + `DataView`/`TypedArray` construction. Do not let it grow business logic. |
| Simulation kernel | Pure function: inputs → one equity curve + summary. No I/O, no DOM, no allocation in the hot loop | **Matters most.** This is the perf- and correctness-critical seam; must be callable identically from main thread or a worker. |
| Sweep orchestrator | Partition a 2D parameter sweep across workers, stream partial results, cancel stale sweeps, memoize completed grids | **Matters.** This is what makes 10,000 calls feel instant instead of frozen; isolate it from both the kernel and the chart. |
| Worker pool | Thin host for the kernel inside `Worker` threads; receives data + param chunk, returns cell results | **Matters as a wrapper, not a rewrite.** It must call the *same* kernel module the main thread uses — do not fork kernel logic per-environment. |
| Metrics layer | IRR (money-weighted), max drawdown, multiple-of-contributed, ruin flag — derived from kernel output, not computed inside the kernel | **Matters, lightweight.** Keeps the kernel single-purpose and keeps IRR-method changes from touching hot-loop code. |
| Attribution layer | Decompose result gap into vol-drag / financing / expense ratio, for the *single focused run only* | **Matters conceptually, trivial in implementation.** It's 2-3 extra kernel calls with variant params, not a generic decomposition engine — do not build a plugin framework for cost models. |
| Chart layer | Line chart (single run) + 2D heatmap (sweep), canvas/WebGL-backed for the 10k-cell case | **Matters.** SVG will choke on a 200×50 grid with live updates; canvas is the right primitive. |
| URL-state layer | Serialize/deserialize app state to/from the URL query string, with a data-version tag | **Matters.** It's the only "backend" this app has — permalinks are the persistence layer. |
| Export | PNG (canvas → blob) and CSV (typed array → string) of the currently-displayed run | **Does not need its own architecture.** It's a read-only view over state that already exists elsewhere; keep it as two small pure functions, not a "module." |

**Over-engineering to avoid for a solo static app:**
- A generic "sweep over N arbitrary dimensions" abstraction. The product needs exactly two axes (entry date × leverage). Build for two axes; a 3rd axis (if ever added) is a new phase, not a speculative abstraction now.
- A generic plugin system for cost models. There is one cost model (`L*r - (L-1)*(short_rate+spread) - er/252`); attribution is "run it with pieces zeroed out," not an extensible pipeline.
- Redux/heavy state management. State is a dozen scalars plus a cached sweep grid; the URL is the source of truth, so a plain reactive store (signals, nanostores, or even a single `useReducer`) is enough.
- A generic binary container format (Parquet/Arrow/etc.) for ~1MB of data. A hand-rolled flat `Float32Array` file per field, referenced by a JSON manifest, is simpler to implement, debug, and version.
- SharedArrayBuffer for the worker fan-out (see Q3 below) — the COOP/COEP cost is not worth it at this data size and access pattern.

## Recommended Project Structure

```
/compiler/                  # Node/Bun CLI, build-time only, not bundled to browser
├── ingest/                 # per-source-format CSV parsers (Yahoo/Stooq daily, FRED, Shiller monthly)
├── align.ts                # canonical trading-calendar construction + reindexing
├── splice.ts                # monthly→daily interpolation (step-fill), seam recording
├── tiers.ts                 # derives strict/extended tier ranges FROM provenance, not hand-declared
├── encode.ts                 # writes calendar.bin + per-{symbol,field}.bin
├── manifest.ts                # assembles manifest.json from provenance + encode outputs
├── validate.ts                 # compiler self-check: monotonic dates, no NaN, tier ranges non-empty
└── cli.ts                       # entrypoint: `compile-data ./raw ./public/data`

/public/data/                # compiler output, committed or built in CI
├── manifest.json
├── calendar.bin
└── {symbol}.{field}.bin

/src/
├── data/
│   ├── loader.ts            # fetch manifest + .bin, decode to typed arrays
│   └── types.ts               # MarketData, ManifestSymbol shapes shared with compiler output shape
├── kernel/
│   ├── simulate.ts             # THE pure kernel — zero deps on DOM/workers/fetch
│   └── simulate.test.ts        # 1x-identity, ruin, attribution decomposition unit tests
├── sweep/
│   ├── orchestrator.ts          # partition, generation/cancellation, memoization cache
│   ├── worker.ts                  # worker entrypoint: imports kernel, handles chunk messages
│   └── pool.ts                     # spawns/reuses N workers, routes messages
├── metrics/
│   └── metrics.ts                   # IRR, maxDrawdown, multiple, ruin — pure, over kernel output
├── attribution/
│   └── attribution.ts                # 3-variant kernel call + subtraction, single-run only
├── validation/
│   └── trackingError.ts                # computeTrackingError(synthetic, real, tolerance) — SHARED by tests, CI, and in-app view
├── state/
│   └── url.ts                          # encode/decode app state ↔ query string, dataVersion handling
├── charts/
│   ├── EquityChart.tsx (or .ts)          # single-run line chart
│   └── Heatmap.tsx (or .ts)                # canvas-based 2D sweep grid
├── export/
│   └── export.ts                            # toPngBlob, toCsvString — thin, no module needed beyond this
└── app/                                      # shell, routing, store wiring
```

### Structure Rationale

- **`/compiler` lives outside `/src` entirely.** It is a different runtime (Node) with different freedoms (can use `fs`, heavier deps, synchronous I/O) and must never be accidentally bundled into the browser build. Keeping it as a sibling directory with its own `package.json`/tsconfig (or at minimum its own build target) makes that boundary enforceable, not just conventional.
- **`kernel/` has no imports from `sweep/`, `data/`, or `charts/`.** This is the one boundary worth being strict about: the kernel must be importable and unit-testable in total isolation, and must be the literal same module loaded by the worker and by the main thread's single-run path. If the worker ends up with a "copy" of the kernel for performance reasons, that's a bug waiting to happen (the credibility of the whole app rests on the kernel being one piece of code).
- **`validation/trackingError.ts` is shared,** not duplicated between the test suite, a CI script, and the in-app comparison view (see Q8). One function, three call sites.
- **`metrics/` and `attribution/` are separate from `kernel/`** because they change for different reasons: IRR methodology or drawdown definition can be revised without touching the hot loop, and attribution's "which pieces to zero out" is a display concern, not a simulation concern.

## Architectural Patterns

### Pattern 1: Struct-of-Arrays kernel over preallocated buffers

**What:** All time-series data (returns, rates, and simulation output) live in parallel `Float64Array`/`Float32Array` columns indexed by day, never in per-day objects or an array of `{date, value}` structs.
**When to use:** Any hot loop that runs thousands of times over tens of thousands of elements — exactly this project's sweep.
**Trade-offs:** Slightly less ergonomic call sites (index-based access instead of `.date`/`.value` properties) in exchange for zero per-call allocation, V8/JIT-friendly monomorphic access, and cheap `postMessage` transfer (typed arrays are transferable/structured-clonable natively).

**Example — the kernel contract:**
```typescript
// kernel/simulate.ts — PURE. No I/O, no Date objects in the hot loop, no allocation.

/** Shared, read-only, decoded once by the data loader and reused across all calls. */
interface MarketData {
  readonly length: number;
  /** ln(1 + dailyReturn) for the selected series (price- or total-return), index = trading day */
  readonly logReturns: Float64Array;
  /** annualized short rate (already daily-aligned/interpolated by the compiler), same index space */
  readonly shortRate: Float64Array;
}

type ContributionFrequency = 0 | 1 | 2 | 3; // 0=daily 1=monthly 2=quarterly 3=yearly — int enum, no string compares in the hot loop

interface SimParams {
  leverage: number;                 // L, e.g. 3.0
  expenseRatioAnnual: number;       // e.g. 0.0090
  financingSpreadAnnual: number;    // e.g. 0.0050, added to shortRate
  initialInvestment: number;
  contributionAmount: number;
  contributionFrequency: ContributionFrequency;
  startIndex: number;               // resolved once upstream from a date via the calendar, not re-resolved per call
  endIndex: number;                 // inclusive
}

/** Caller-owned, sized once, reused across thousands of calls. The kernel writes into these,
 *  it never allocates its own equity/contribution arrays. */
interface SimOutputBuffers {
  equity: Float64Array;       // length >= endIndex - startIndex + 1
  contributedCum: Float64Array; // cumulative dollars contributed, same length
}

interface SimResult {
  finalEquity: number;
  finalContributed: number;
  maxDrawdown: number;        // computed inline during the same pass, no second scan
  ruinIndex: number;          // -1 if never ruined, else the day index equity crossed <= 0
}

/**
 * Runs one leveraged backtest in place. Allocation-free: every array it touches is either
 * `data` (shared, read-only) or `out` (caller-owned, overwritten). Safe to call 10,000+ times
 * back to back from a tight loop with zero GC pressure attributable to this function.
 */
function runSimulation(
  data: MarketData,
  params: SimParams,
  out: SimOutputBuffers
): SimResult {
  const dailyExpense = params.expenseRatioAnnual / 252;
  let equity = params.initialInvestment;
  let contributed = params.initialInvestment;
  let peak = equity;
  let maxDrawdown = 0;
  let ruinIndex = -1;

  for (let i = params.startIndex; i <= params.endIndex; i++) {
    const r = Math.expm1(data.logReturns[i]); // simple daily return from log return
    const financeCost = (params.leverage - 1) * (data.shortRate[i] + params.financingSpreadAnnual) / 252;
    const dailyReturn = params.leverage * r - financeCost - dailyExpense;

    equity *= (1 + dailyReturn);

    if (shouldContribute(i, params.contributionFrequency)) {
      equity += params.contributionAmount;
      contributed += params.contributionAmount;
    }

    if (equity <= 0 && ruinIndex === -1) {
      equity = 0;
      ruinIndex = i;
    }

    peak = equity > peak ? equity : peak;
    const drawdown = peak > 0 ? (peak - equity) / peak : 0;
    maxDrawdown = drawdown > maxDrawdown ? drawdown : maxDrawdown;

    const o = i - params.startIndex;
    out.equity[o] = equity;
    out.contributedCum[o] = contributed;

    if (ruinIndex !== -1) {
      // fill remainder with 0 / hold contributed flat, then stop iterating — ruin is terminal
      for (let j = i + 1; j <= params.endIndex; j++) {
        out.equity[j - params.startIndex] = 0;
        out.contributedCum[j - params.startIndex] = contributed;
      }
      break;
    }
  }

  return { finalEquity: equity, finalContributed: contributed, maxDrawdown, ruinIndex };
}
```

- **1x identity requirement** falls out of this shape for free: with `leverage=1`, `financeCost=0` and `dailyReturn = r - dailyExpense`; setting `expenseRatioAnnual=0` too reproduces the unlevered series exactly, which is the property test to write.
- **Sweep call site (inside a worker):** allocate `out.equity`/`out.contributedCum` **once** per worker, sized to the longest window that worker will ever process, and pass the same `out` object into `runSimulation` for every cell in the assigned chunk. Only the small `SimResult` record — a handful of numbers — gets copied into a results array per cell; the big buffer is overwritten in place and never leaves the worker. This is what actually bounds GC pressure to zero across a 10,000-call sweep: the arrays that would otherwise be allocated 10,000 times are allocated once.
- **IRR is deliberately not computed inside the kernel.** The kernel emits `equity` and `contributedCum`; the metrics layer reconstructs a cash-flow series from `contributedCum`'s deltas plus `finalEquity` as the terminal inflow, and runs Newton's method / bisection on that — independent of kernel changes.

### Pattern 2: Transferable-object return, cloned-copy distribution (not SharedArrayBuffer)

**What:** Distribute the ~1MB dataset to each worker via a one-time `postMessage` **copy** at pool/symbol-change time (structured clone of typed arrays), and return sweep results from worker to main via **transfer** (zero-copy ownership handoff of the result buffer).
**When to use:** Any worker fan-out where the input data is small, read-only, and changes far less often than the compute requests against it (exactly this project: dataset ~1MB, sweep parameters change on every slider drag).
**Trade-offs:** A structured-clone copy costs a small amount of time and memory per worker (N workers × ~1MB, trivial), versus SharedArrayBuffer's zero-copy sharing which requires cross-origin isolation.

**Why not SharedArrayBuffer, concretely:** `SharedArrayBuffer` requires the page to be served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (cross-origin isolation). On Cloudflare Pages this means adding both headers to `_headers` for all routes. That's achievable, but `require-corp` then forces every cross-origin resource the page loads (fonts, embeds, any future iframe/analytics) to opt in via CORS or `Cross-Origin-Resource-Policy`, which is a permanent tax on the whole site for a workload that doesn't actually need concurrent shared-memory mutation — it needs read-only fan-out of ~1MB, once per symbol selection, which structured clone handles at negligible cost. Reserve COOP/COEP as a future option only if a later requirement genuinely needs concurrent mutation of shared state (it doesn't here).

**Example:**
```typescript
// main thread — one-time distribution when symbol/tier changes
for (const worker of pool.workers) {
  worker.postMessage({ type: 'load-data', data: marketData }); // structured-clone copy, ~1MB, infrequent
}

// worker — returns results via transfer, not clone
self.postMessage(
  { type: 'chunk-result', generation, cellIndices, values: resultBuffer },
  [resultBuffer.buffer] // ownership transferred back to main, zero-copy
);
```

### Pattern 3: Generation-tagged cancellation + sink-side filtering (no Atomics needed)

**What:** Every new sweep request gets a monotonically increasing `generation` id. Workers check a module-level "latest generation" flag between individual cell computations (not mid-cell) and stop early if stale. The main thread additionally discards any incoming result message tagged with a generation older than the current one, as a correctness backstop independent of whether the worker noticed in time.
**When to use:** Interactive parameter sweeps where the user can trigger a new computation (slider drag) before the previous one finishes.
**Trade-offs:** Reaction latency to cancellation is bounded by one cell's compute time (a single 25,000-day backtest is sub-millisecond to low-single-digit milliseconds), which is more than fine for slider-drag responsiveness — no need for `Atomics.wait`/`SharedArrayBuffer`-based hard preemption.

```typescript
// orchestrator (main thread)
let currentGeneration = 0;
function startSweep(spec: SweepSpec) {
  currentGeneration++;
  const generation = currentGeneration;
  for (const chunk of partitionSweep(spec, pool.size)) {
    pool.dispatch({ type: 'run-chunk', generation, chunk });
  }
}
pool.onMessage((msg) => {
  if (msg.generation !== currentGeneration) return; // stale result, drop silently
  grid.applyChunk(msg.cellIndices, msg.values);
  paintScheduled ||= requestAnimationFrame(paintGrid);
});

// worker
let latestGeneration = -1;
self.onmessage = (e) => {
  if (e.data.type === 'run-chunk') {
    latestGeneration = e.data.generation;
    const myGen = e.data.generation;
    for (const cell of e.data.chunk) {
      if (latestGeneration !== myGen) return; // a newer chunk arrived, abandon this one
      const result = runSimulation(sharedData, cell.params, sharedOut);
      // buffer partial results, flush every ~50 cells or ~30ms for progressive streaming
    }
  }
};
```

## Data Flow

### Build-time flow

```
raw CSVs (Yahoo/Stooq daily, FRED rates, Shiller monthly)
    ↓ ingest (per-format parser, tags {source, nativeFrequency})
common intermediate rows {date, value, sourceTag}
    ↓ calendar alignment (reindex onto canonical NYSE trading-day spine)
per-symbol/field series aligned to shared calendar indices
    ↓ splice (monthly → daily step-fill, ONLY where native data is monthly; records seam)
spliced series + seam records {field, seamDate, sourceBefore, sourceAfter, method}
    ↓ tier assembly (strict/extended ranges COMPUTED from seam records, not hand-declared)
tiered series + per-symbol tier metadata
    ↓ encode (Float32Array → .bin, calendar → calendar.bin)
    ↓ manifest emission (aggregates provenance + asset URLs + content hashes)
/public/data/{manifest.json, calendar.bin, *.bin}
```

### Runtime flow — single run

```
URL query params
    ↓ decode
app state (symbol, leverage, dates, costs, contributions)
    ↓
data loader: fetch manifest.json (if not cached) → fetch symbol .bin(s) → decode → MarketData
    ↓
kernel.runSimulation(MarketData, SimParams, out)  [main thread, single call, no worker needed]
    ↓
metrics layer (IRR, MDD, multiple, ruin) + attribution layer (3 variant kernel calls)
    ↓
chart layer (equity line) + attribution panel
    ↓ on any param change
URL state re-serialized → history.replaceState (no reload)
```

### Runtime flow — sweep

```
sweep spec (leverage range × entry-date range, holding mode)
    ↓ memo cache lookup (key = hash of all sweep-affecting params)
    │  HIT → paint cached grid immediately, done
    │  MISS ↓
orchestrator partitions grid into N contiguous chunks (N = worker count)
    ↓ postMessage (copy, one-time per symbol/tier) data to workers if not already resident
    ↓ postMessage (small) chunk assignment + generation id
workers: loop cells → runSimulation (same kernel) → per-cell metrics struct
    ↓ stream partial results back every ~50 cells (transfer, zero-copy)
orchestrator: filter by generation → merge into grid → rAF-batched paint
    ↓ on completion
memoize full grid under its cache key (small LRU, in-memory only)
```

**Key invariant:** the sweep computes **all** display metrics (IRR, MDD, multiple, ruin) per cell in one pass, not one sweep per metric. Switching the heatmap's color metric is a pure re-color of the cached grid — zero recomputation, zero network, zero worker dispatch.

## Scaling Considerations

This is a solo, static, single-user-session app — "scale" here means dataset growth and sweep resolution, not concurrent users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (≈10 symbols, ~1MB data, 200×50 sweep = 10k cells over ~25k bars) | Exactly the architecture above: structured-clone data distribution, 2-8 worker pool sized to `navigator.hardwareConcurrency`, in-memory memoization. |
| Larger universe (50+ symbols, data grows to 10-20MB) | Data loader should lazy-fetch per-symbol `.bin` files (already the design — manifest lets you fetch only what's selected) rather than one giant blob. No architecture change needed, just confirms the "per-symbol file, not monolithic blob" choice in the manifest design. |
| Finer sweep resolution (e.g., 500×200 = 100k cells) | Progressive streaming and cancellation matter more, not less — same architecture, tune chunk size down so first paint arrives faster. If per-cell cost ever becomes the bottleneck (unlikely at this data size), the kernel is the only thing that would move to WASM; the orchestration layer around it does not change. |

### Scaling Priorities

1. **First bottleneck, if any:** initial data fetch + decode latency on cold load (multiple `.bin` files). Mitigate by fetching only the default/selected symbol's data eagerly and prefetching the rest opportunistically (idle callback), not by restructuring the pipeline.
2. **Second bottleneck, if any:** worker pool size vs `hardwareConcurrency` on low-core devices (mobile). Mitigate by capping chunk granularity so progressive painting still feels responsive even with 2 workers, not by adding SharedArrayBuffer complexity.

## Anti-Patterns

### Anti-Pattern 1: Re-deriving tier labels by hand in the UI

**What people do:** Write "Extended tier: 1928-present, uses interpolated data before 1988" as a literal string in a UI component.
**Why it's wrong:** The moment the compiler's source data changes (a new CSV extends coverage, a seam date shifts), that hand-written string silently becomes false, and the entire credibility argument of the app ("provenance is visible, never a footnote") is undermined by a stale label nobody remembers to update.
**Do this instead:** The UI renders tier explanation text from `manifest.symbols[x].tiers[tier].reason` and the underlying `seams[]` records, using a small template function — the string is a *view* over compiler-emitted data, never authored independently of it.

### Anti-Pattern 2: Forking the kernel per execution context

**What people do:** Write one `simulate()` for the main-thread single-run path and a "faster" hand-inlined copy inside the worker for the sweep, because it's tempting to micro-optimize the hot path differently once it's isolated in a worker.
**Why it's wrong:** Two implementations of the core financial model is exactly the kind of drift that produces a synthetic-3x-vs-real-UPRO mismatch that has nothing to do with the actual math being wrong — it's a bug in code duplication. Given the validation harness is the credibility anchor of the whole project, this is the single highest-cost anti-pattern available.
**Do this instead:** One `kernel/simulate.ts` module, imported by both the main-thread single-run call site and the worker. If it needs to be faster, optimize it once; both call sites benefit.

### Anti-Pattern 3: Recomputing a sweep per selected metric

**What people do:** Treat "sweep colored by IRR" and "sweep colored by max drawdown" as two different sweep requests because the UI naturally models "which metric is displayed" as sweep-adjacent state.
**Why it's wrong:** It reintroduces the exact freeze the progressive-streaming architecture was built to avoid, every time the user just wants to look at the same grid through a different lens.
**Do this instead:** The kernel/metrics pass already computes every metric per cell (Pattern 1 above). The metric selector is a pure display transform over the cached grid.

## Integration Points

### External Services

None at runtime — this is the whole point of the architecture (per PROJECT.md: no backend, no runtime API calls). The only "external" dependency is the build-time ingestion of raw CSV sources (Yahoo/Stooq, FRED, Shiller), which is a compiler-time concern, not a runtime integration.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Compiler ↔ app | Filesystem (`.bin` + `manifest.json` written to `/public/data`) | One-directional, build-time only. The app never writes back to this directory. |
| Data loader ↔ kernel | In-memory `MarketData` object (typed arrays), direct function call | Same-thread when single-run, cloned-into-worker-memory when sweeping. |
| Orchestrator ↔ worker pool | `postMessage`, structured-clone for data (rare), transferable for results (every chunk) | Never SharedArrayBuffer (see Pattern 2 rationale). |
| Kernel ↔ metrics/attribution | Function call, plain typed-array + scalar arguments | No shared mutable state; metrics never write back into kernel buffers. |
| App state ↔ URL | Query-string encode/decode on every state change, `history.replaceState` (no full navigation) | See below for schema. |

## Manifest Design

The manifest is the one file the app fetches unconditionally on load. It must let the app enumerate everything without downloading any series data.

```json
{
  "manifestVersion": 3,
  "generatedAt": "2026-08-10T00:00:00Z",
  "compilerVersion": "0.4.1",
  "calendar": {
    "url": "/data/calendar.a91f3c.bin",
    "count": 25789,
    "startDate": "1928-01-03",
    "endDate": "2026-08-07",
    "encoding": "int32-epoch-day-le"
  },
  "symbols": {
    "SPX_TR": {
      "displayName": "S&P 500 (Total Return)",
      "assetClass": "equity-index",
      "fields": {
        "price": {
          "url": "/data/SPX_TR.price.7c2e91.bin",
          "encoding": "float32-le",
          "startIndex": 0,
          "count": 25789,
          "startDate": "1928-01-03",
          "endDate": "2026-08-07",
          "sources": [
            { "name": "Yahoo Finance ^GSPC daily", "range": ["1928-01-03", "2026-08-07"], "nativeFrequency": "daily" }
          ],
          "seams": []
        },
        "dividendYield": {
          "url": "/data/SPX_TR.divyield.4b81aa.bin",
          "encoding": "float32-le",
          "startIndex": 0,
          "count": 25789,
          "startDate": "1928-01-03",
          "endDate": "2026-08-07",
          "sources": [
            { "name": "Shiller monthly dataset", "range": ["1928-01-03", "1988-01-04"], "nativeFrequency": "monthly" },
            { "name": "CRSP-derived daily total-return divisor", "range": ["1988-01-05", "2026-08-07"], "nativeFrequency": "daily" }
          ],
          "seams": [
            {
              "date": "1988-01-05",
              "method": "step-fill-to-daily",
              "fromSource": "Shiller monthly dataset",
              "toSource": "CRSP-derived daily total-return divisor"
            }
          ]
        }
      },
      "tiers": {
        "strict": { "startDate": "1988-01-05", "endDate": "2026-08-07", "reason": "all fields native-daily from this date" },
        "extended": { "startDate": "1928-01-03", "endDate": "2026-08-07", "reason": "dividend yield interpolated (step-fill) before 1988-01-05" }
      }
    },
    "UPRO": {
      "displayName": "ProShares UltraPro S&P500 (3x, real ETF)",
      "assetClass": "leveraged-etf",
      "purpose": "validation-only",
      "fields": {
        "price": {
          "url": "/data/UPRO.price.d10e77.bin",
          "encoding": "float32-le",
          "startIndex": 21403,
          "count": 4386,
          "startDate": "2009-06-25",
          "endDate": "2026-08-07",
          "sources": [
            { "name": "Yahoo Finance UPRO daily", "range": ["2009-06-25", "2026-08-07"], "nativeFrequency": "daily" }
          ],
          "seams": []
        }
      },
      "tiers": {
        "strict": { "startDate": "2009-06-25", "endDate": "2026-08-07", "reason": "all fields native-daily" },
        "extended": { "startDate": "2009-06-25", "endDate": "2026-08-07", "reason": "no splice needed, inception is the limit" }
      }
    }
  },
  "rates": {
    "SHORT_RATE": {
      "displayName": "Fed Funds / 3M T-bill blended short rate",
      "url": "/data/SHORT_RATE.a55c02.bin",
      "encoding": "float32-le",
      "startIndex": 6805,
      "count": 19096,
      "startDate": "1954-07-01",
      "endDate": "2026-08-07",
      "sources": [
        { "name": "FRED DFF daily effective fed funds rate", "range": ["1954-07-01", "2026-08-07"], "nativeFrequency": "daily" },
        { "name": "Shiller/NBER discount rate (monthly)", "range": ["1928-01-03", "1954-06-30"], "nativeFrequency": "monthly" }
      ],
      "seams": [
        {
          "date": "1954-07-01",
          "method": "step-fill-to-daily",
          "fromSource": "Shiller/NBER discount rate (monthly)",
          "toSource": "FRED DFF daily effective fed funds rate"
        }
      ]
    }
  }
}
```

**Design notes:**
- **`startIndex`/`count` reference the shared `calendar.bin`**, not embedded dates per series — the date axis is stored once and derived, not duplicated per field, keeping files small and eliminating a whole class of date-encoding bugs.
- **`seams[]` is the provenance-to-UI seam** described in Q4: the UI's tier explanation copy is templated from this array, never hand-written.
- **`tiers` ranges are computed by the compiler from `seams`**, not maintained as a separate hand-curated list — a symbol's `strict` range starts at the latest seam date among its required fields; `extended` starts at the earliest available data.
- **Cache-busting:** every `.bin` filename embeds a content hash (`SPX_TR.price.7c2e91.bin`), so those assets can be served with long, immutable cache headers. `manifest.json` itself is served with short/no caching so the app always resolves the current hashed URLs. `manifestVersion` is a schema-version integer (bump on breaking structural changes to the manifest shape itself, separate from data updates). `generatedAt` (or a content hash of the whole manifest) becomes the `dataVersion` embedded in permalinks.

## URL State Encoding

**Recommendation: readable query params, not an opaque encoded blob.** State is a dozen scalars; a base64/compact blob buys nothing here and costs debuggability, resistance to hand-editing, and graceful forward-compatibility (adding a new param to a query string is backward compatible by default; an opaque blob needs a version-aware decoder for every future change).

```
https://example.pages.dev/?s=UPRO&L=3&mode=fixed&ei=2015-01-02&yrs=10&init=10000&c=500&cf=M&er=0.0090&fs=0.0050&tier=extended&div=on&dv=2026-08-10

For the sweep view (axis ranges, not enumerated points):
&Lr=1:5:0.1&edr=1990:2020&mode=hold
```

| Param | Meaning |
|-------|---------|
| `s` | symbol id (matches manifest key) |
| `L` | leverage (single-run view) |
| `mode` | `fixed` (holding-period) or `hold` (hold-to-today) |
| `ei` | entry date (single-run view) |
| `yrs` | holding years, fixed mode only |
| `init` / `c` / `cf` | initial investment / contribution amount / frequency (`D`/`M`/`Q`/`Y`) |
| `er` / `fs` | expense ratio / financing spread overrides |
| `tier` | `strict` or `extended` |
| `div` | dividend-reinvest toggle |
| `Lr` / `edr` | leverage range / entry-date range (sweep view, `min:max:step`) |
| `dv` | data version the link was generated against (from manifest `generatedAt` or a content hash) |
| `v` | URL-schema version — bump only when a param key's *meaning* changes, not when a param is added |

**Stale-permalink handling (older bundle):**
1. Compare the URL's `dv` to the current manifest's version.
2. If equal, proceed normally.
3. If different but the requested symbol still exists and its current date range still covers the requested window, load normally with a small non-blocking banner ("data updated since this link was created").
4. If the symbol no longer exists or the requested date range now falls outside its current coverage, show an explicit degraded-state banner naming what changed — never silently clamp the date or substitute a different symbol.
5. Never reinterpret an existing param key with new meaning on a schema change; bump `v` and branch the parser instead, so old links keep parsing the same way forever.

## Suggested Build Order

Mapped to candidate phases. Dependencies are the hard constraint; ordering within a phase is not.

| Phase | Component(s) | Depends on | Why here | Demonstrable output |
|-------|-------------|------------|----------|---------------------|
| 1 | Data compiler + manifest | Nothing | Foundation — nothing downstream can be honestly built against fake data, and the binary/manifest shape needs to be frozen before the loader and kernel integrate against it | `node compile-data` prints per-symbol summary stats; `manifest.json` + `.bin` files committed |
| 2 | Data loader + simulation kernel | Phase 1's binary/manifest *shape* (kernel itself can start against synthetic data in parallel with the tail of Phase 1) | Kernel has zero real dependency on real data — build/test it against a fixed-seed synthetic return series first, then swap in the real loader once Phase 1 lands | A script/minimal page runs one real backtest end-to-end and logs the equity curve |
| 3 | Validation harness (gate) | Phase 1 (real UPRO/TQQQ data) + Phase 2 (kernel) | This is the credibility anchor — verify it before investing further UI effort on top of a model that might not track reality | Automated test asserting synthetic-3x tracks real UPRO within tolerance; CI fails if it doesn't |
| 4 | Metrics + attribution layer | Phase 2 kernel (frozen interface) | Independent of UI/workers, can run in parallel with Phase 3 once the kernel's output shape is stable | Unit tests against hand-computed small examples (known IRR, known drawdown) |
| 5 | Single-run UI | Phase 2 + Phase 4 | First true user-facing product — a defensible single backtest with attribution is arguably the MVP even without the sweep. Runs the kernel directly on the main thread (single call is fast; no worker needed yet) | Interactive page: pick symbol/leverage/dates, see equity curve + attribution breakdown |
| 6 | URL-state layer | Phase 5 (param shape must exist first) | Smaller state surface to get right before sweep-range params are added; permalinks work before sweep complexity lands | Reloading a shared URL reproduces the exact single-run view |
| 7 | Worker pool + sweep orchestrator | Phase 2-4 kernel (stable/frozen), Phase 5 (somewhere to render into) | Don't build worker plumbing before there's a UI to drive it — no visible payoff and no way to validate cancellation/streaming UX until there's something to watch | A dev-only harness sweeping N cells and logging progressive results, no chart yet |
| 8 | Heatmap chart + sweep UI | Phase 7 | Depends on orchestrator existing to stream into | 200×50 heatmap paints progressively, metric selector re-colors without recompute, sweep-mode toggle works |
| 9 | Export (PNG/CSV) + preset scenarios | Phase 5 and Phase 8 | Lowest risk, reads already-existing rendered/computed state | Downloadable PNG of the current chart, CSV of a run's daily series, a preset picker for canonical scenarios |

**Parallelizable:**
- Phase 1 (compiler) and early Phase 2 (kernel against synthetic data) — different people/sessions, integrate once both land.
- Phase 3 (validation harness) and Phase 4 (metrics/attribution) — both depend only on Phase 2's kernel, not on each other.
- Phase 6 (URL state) and early Phase 7 scaffolding — bounded parallelism, since both eventually integrate with Phase 5's UI shell.
- Phase 9 (export) and the tail of Phase 8 — export just reads final state, doesn't block heatmap polish.

**Strictly sequential:** 1 → 2 → 3 (gate) → 5 → 6/7 → 8 → 9. Phase 3 is a hard gate: do not proceed to user-facing polish (Phase 5 onward, in spirit — practically Phase 5 can start once Phase 2 is stable, but should not ship/be considered "done" until Phase 3 passes) on a kernel that hasn't been checked against real leveraged-ETF history.

## Validation Harness Placement

**Recommendation: all three, sharing one implementation.**

1. **Automated test suite** (the actual gate). A shared `computeTrackingError(synthetic, real, tolerance)` pure function, called from a Vitest/Jest test that runs the kernel with `L=3` and UPRO's real prospectus-like cost inputs against the bundled S&P 500 total-return series, compares the resulting synthetic equity curve to the bundled real UPRO price series, and fails the suite if tracking error exceeds a documented tolerance. This must exist and pass before Phase 5 is considered complete — it's the Phase 3 gate in the build order above.
2. **Build-time/CI check.** The same `computeTrackingError` function, invoked as a `validate` step whenever the data bundle changes (new price data appended, a compiler fix reruns splicing) — not a second implementation, the same one, triggered by a different event (data change vs code change) so a data update that silently breaks fidelity is caught even if no test file changed.
3. **In-app visible comparison.** A view (or a toggle overlay on the single-run chart) that plots synthetic-3x against real UPRO/TQQQ side by side with the tracking-error stat displayed to the actual user — because per the project's own stated purpose, the proof needs to be visible in-product to the skeptic being argued with, not just green in CI. This is nearly free once Phase 5's single-run UI exists: it's that same UI pointed at the validation symbols with an overlay mode, calling the same `computeTrackingError` function to render the stat.

Do not implement three separate tracking-error calculations. One function, three call sites (test, CI script, UI component) is the correct boundary — anything more is duplicated correctness logic for the single most important guarantee this app makes.

## Sources

- [Enable COEP and COOP Response headers — Cloudflare Community](https://community.cloudflare.com/t/enable-coep-and-coop-response-headers/252256) — confirms `_headers` file mechanism and the two required headers (`Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Opener-Policy: same-origin`) for `SharedArrayBuffer` on Cloudflare Pages, and the `require-corp` side effect on cross-origin embeds.
- [Configuring Headers — WebContainers](https://webcontainers.io/guides/configuring-headers) — general COOP/COEP configuration pattern for static hosts, corroborates the header requirement.
- [MDN — JavaScript typed arrays](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Typed_arrays) — struct-of-arrays-over-ArrayBuffer pattern (multiple typed views over one buffer), basis for Pattern 1.
- [MDN — TypedArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray) — typed array allocation/structured-clone/transfer semantics underlying Pattern 2.
- General knowledge of `postMessage` transferable objects, Web Worker pooling, and cooperative cancellation patterns (well-established, MDN-documented Web Platform behavior) applied to this project's specific sweep shape.
- Domain facts (data seam dates, cost model formula, tier definitions) taken directly from `.planning/PROJECT.md`, not independently re-verified in this research pass — the manifest example's specific dates/sources are illustrative of the *shape*, not a claim about the actual compiled dataset.

---
*Architecture research for: static client-side leveraged-ETF backtesting app with build-time data pipeline*
*Researched: 2026-08-16*

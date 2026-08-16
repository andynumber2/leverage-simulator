# Stack Research

**Domain:** Browser-based, fully-static financial backtesting and visualization app (leveraged-ETF simulator)
**Researched:** 2026-08-16
**Confidence:** MEDIUM (npm registry versions are HIGH confidence — verified directly against the registry; qualitative performance/architecture claims are MEDIUM, based on cross-checked web sources plus stated napkin-math where no direct benchmark exists — flagged inline)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.x (via Vite toolchain) | Language | Single language across app + bundle compiler CLI; typed-array-heavy numeric code benefits from strict typing catching unit/index errors |
| Vite | 8.2.1 | Build tool | Native Web Worker (`?worker`), WASM, and binary-asset (`?url`/`import.meta.url`) support with zero config; trivial static output for Cloudflare Pages; fastest dev loop of the options considered |
| Solid.js | 1.9.14 | UI framework | Fine-grained reactivity with no virtual DOM, smallest runtime of the mainstream reactive frameworks, and no re-render cost when heatmap/chart state changes 10k times during a sweep — see Q3 below for full rationale |
| Plain JS in a Web Worker pool over `Float64Array`, with a Rust→WASM fallback module behind the same interface | — | Sweep compute engine | JIT-compiled typed-array JS is close enough to WASM for this workload that the added toolchain (Rust, wasm-pack, wasm-bindgen) isn't justified until profiling proves otherwise — see Q1 |
| uPlot | 1.6.32 | Time-series line charts | Canvas-based, ~45 KB total, built for exactly this shape of data (dense daily series), fastest line-chart renderer available in JS |
| Custom Canvas 2D heatmap (hand-rolled, no library) | — | 200×50 heatmap | At 10,000 cells, every general-purpose charting library tested in public benchmarks either has no heatmap mark (uPlot) or degrades badly well under 10k cells (ECharts, Plotly, Highcharts) — see Q2 |
| Raw `ArrayBuffer` with a small custom header | — | Bundled binary time-series format | True zero-copy into `Float64Array`/`Float32Array`, no parser dependency, smallest runtime footprint; fixed internal schema makes Arrow/Parquet's self-describing overhead pure cost with no benefit — see Q4 |
| Node.js + TypeScript | Node 22 LTS | Bundle compiler CLI | Single language with the app; see Q5 for why this beats Python despite pandas being nicer for the data-cleaning step |
| Vitest | 4.1.10 | Test runner | Native Vite integration, in-browser and Node test modes, built-in snapshot/golden-file support |
| fast-check | 4.9.0 | Property-based testing | De facto standard for property-based testing in the JS/TS ecosystem; integrates directly with Vitest — see Q7 |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Comlink | 4.4.2 | Worker RPC | Wraps `postMessage` in a proxy so calling the sweep worker looks like calling an async function; use it instead of hand-rolled message protocols to avoid boilerplate bugs in the worker boundary |
| vite-plugin-pwa | 1.3.0 | Offline support (Workbox wrapper) | Precaches the app shell + binary data assets as a service worker; use `generateSW` strategy with `globPatterns` covering the compiled `.bin` bundles and `maximumFileSizeToCacheInBytes` raised past the default 2 MB ceiling (bundles are ~1 MB total, but default cutoff is tight) |
| d3-scale + d3-interpolate (from `d3`) | 7.9.0 (import subset, not full `d3`) | Color scale for heatmap, axis scales for line charts | Needed regardless of charting library choice — uPlot and the custom heatmap canvas both need an external scale/color-interpolation utility; import only `d3-scale`/`d3-interpolate`/`d3-array` submodules, not the `d3` umbrella package, to keep bundle size down |
| html-to-image or native `canvas.toBlob()` | native browser API preferred | PNG export | uPlot and the custom heatmap both render to `<canvas>`, so `canvas.toBlob('image/png')` is sufficient with zero dependency — no export library needed |
| lz-string or a hand-rolled base64url encoder | — | URL permalink state encoding | Needed to fit full sweep parameters into a shareable URL; evaluate against actual parameter set size before adding a dependency — a plain `URLSearchParams` may suffice |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| wrangler (Cloudflare CLI) | Local Pages preview + deploy | Use `wrangler pages dev` to test `_headers` and service-worker behavior locally before deploy — Cloudflare's edge caching semantics don't always match `vite preview` |
| @vitest/web-worker or Vitest browser mode | Testing Worker-bound sweep code | Sweep engine runs inside a Worker in production; test it with Vitest's browser mode (Playwright-backed) rather than mocking `postMessage`, so the actual Worker boundary is exercised |

## Installation

```bash
# Core
npm install solid-js
npm install -D vite vite-plugin-solid typescript

# Worker / offline
npm install comlink
npm install -D vite-plugin-pwa

# Charting
npm install uplot
npm install d3-scale d3-interpolate d3-array

# Bundle compiler CLI (separate package.json under tools/bundle-compiler, or a workspace)
npm install -D tsx   # run TS CLI scripts directly in Node without a build step

# Testing
npm install -D vitest fast-check @vitest/browser playwright
```

## Alternatives Considered

### Q1 — Numerical compute in the browser

The workload: ~10,000 independent backtests × ~25,000 daily bars ≈ 250M bar-iterations per heatmap render, each iteration doing a handful of flops (leverage scaling, cost subtraction, compounding, running max for drawdown). Must not block the UI.

| Approach | Realistic wall-clock (single heatmap render) | Basis |
|----------|----------------------------------------------|-------|
| (a) Plain JS in one Web Worker, `Float64Array` in/out, no allocation inside the hot loop | ~1–3 s single-threaded | Napkin math: V8's JIT sustains roughly 0.5–2 GFLOPS on monomorphic, allocation-free `Float64Array` loops (consistent with the general finding that JIT-compiled typed-array JS is close to WASM for simple arithmetic, and only falls behind as computation complexity or SIMD-friendliness rises). 250M iterations × ~5–10 flops/iteration ≈ 1.25–2.5 Gflops total → 1–3 s at that throughput. No published benchmark matches this exact workload; this is a bounded estimate, not a citation. |
| (b) Worker pool over N cores (`navigator.hardwareConcurrency - 1` workers, sweep partitioned by entry-date chunk) | ~150–600 ms on a typical 8–16 logical-core consumer laptop | Same per-core throughput as (a), divided across 4–8 usable workers (reserving one core for the UI thread, per the common Worker-pool pattern of using `hardwareConcurrency - 1`). This is the biggest single lever available and costs only a partitioning scheme, not a language change. |
| (c) Rust or AssemblyScript compiled to WASM, single-threaded | ~0.5–1.5 s single Worker; ~100–300 ms pooled across Workers | WASM's advantage over JS on tight numeric loops comes from predictable linear memory layout and (with SIMD) vectorized arithmetic, not from the language itself — the JIT genuinely closes most of the gap on simple, allocation-free, monomorphic loops. WASM pulls meaningfully ahead once SIMD is used (typically cited as a further 2–4x on top of scalar WASM for vectorizable arithmetic), which this workload is well suited to (same operation across parallel bars). AssemblyScript gets you WASM output from TS-like syntax with much less toolchain cost than Rust, at some performance cost vs hand-tuned Rust. |
| (d) WebGPU compute shaders | Likely fastest in principle (thousands of parallel lanes) but not recommended as the primary path | WebGPU reached roughly 85% global browser support in early 2026 (Chromium 113+, Safari 26+), but Firefox ships it disabled by default over fingerprinting/driver-stability concerns as of mid-2026. For a tool whose entire purpose is a shareable permalink that "settles an argument," a rendering path that silently degrades or fails for a meaningful slice of visitors is a bad default. Also carries the highest implementation cost (WGSL shaders, buffer staging, readback synchronization) for a workload that a Worker pool already gets under a second. |

**Recommendation: (b), Worker pool over plain JS/`Float64Array`, as the default and only implementation for v1.** Reasoning:
- The Worker-pool partitioning gets the estimated single-threaded 1–3 s down to the 150–600 ms range on typical hardware — well within "responsive," without adding a compiled-language toolchain.
- WASM's real advantage here is SIMD, and SIMD only pays off once the JS version is profiled and shown to be the bottleneck, not before. Shipping Rust/wasm-bindgen from day one adds a second build toolchain, a second language for the same team to maintain, and cross-boundary serialization overhead ( `Float64Array` in/out of WASM linear memory is cheap but not free) for a workload the Worker pool already handles.
- **Fallback path:** structure the sweep engine behind a single interface (`runSweep(params): SweepResult`) so a WASM implementation can be dropped in behind that interface later without touching the UI or charting code, if profiling on real hardware (not the napkin estimate above) shows the JS Worker-pool path is still too slow on low-core-count devices (e.g., older phones, 2-core Chromebooks). Do not build the WASM path speculatively — build the interface seam, ship JS, and only invest in WASM if a real device profile demands it.
- Do not pursue WebGPU for v1. Revisit only if the sweep size grows by an order of magnitude (100k+ backtests) and the Worker-pool path is confirmed too slow across representative hardware.

**Confidence: MEDIUM.** The qualitative ordering (JIT closes most of the gap on simple loops; WASM wins mainly via SIMD; Worker-pool parallelism is the biggest lever) is corroborated by multiple independent sources. The specific millisecond figures are a stated estimate from throughput assumptions, not a benchmark run against this exact workload — treat them as a planning bound, and re-measure with `performance.now()` on real hardware once the sweep engine exists, before deciding whether WASM is warranted.

### Q2 — Charting

| Library | Version | Heatmap rendering | Line charts | Bundle size | PNG export | Verdict |
|---------|---------|--------------------|--------------|-------------|------------|---------|
| uPlot | 1.6.32 | **None** — uPlot has no heatmap mark; it is time-series/line/bar/OHLC only | Excellent — purpose-built, canvas-based, fastest published line-chart renderer in the JS ecosystem | ~45 KB total | Native, via `canvas.toBlob()` | Use for line charts only |
| ECharts | 6.1.0 | Canvas renderer, but published benchmark suites report ECharts' heatmap tests not completing past ~200 grid points before performance collapses — well under the 10,000-cell target | Good | ~1 MB+ (even tree-shaken, ECharts' modular build is still hundreds of KB for heatmap+line+canvas renderer) | Built-in `getDataURL()` | Reject for heatmap; too heavy to justify pulling in just for line charts when uPlot already covers that |
| Plotly.js | 3.7.0 | Poor — community and GitHub issue reports describe multi-second to 30-second render times on arrays in the low thousands of cells, and Plotly's own heatmap renderer uses `data:` URLs internally (not true canvas drawing), which specifically hurts export quality too | Adequate but heavyweight | 1–3.5 MB depending on trace-type subset | Built-in, but data-URL-based heatmap rendering degrades export fidelity | Reject — heaviest bundle, worst-documented heatmap performance of the options considered |
| Observable Plot | 0.6.17 | Has a heatmap-shaped "auto" mark, but Plot's mark rendering is SVG by default (canvas is used only for its raster/image marks) — **SVG at 10k cells is the documented failure mode this research question specifically warns about**; treat any SVG-default library as disqualified for the heatmap regardless of its line-chart quality | Good, grammar-of-graphics API | ~250–300 KB | No built-in PNG export (SVG must be rasterized manually) | Reject for heatmap for the same SVG reason; not worth adding as a second dependency just for line charts when uPlot is smaller and purpose-built |
| regl / deck.gl | regl 2.1.1, deck.gl 9.3.10 | Would handle 10k cells trivially (WebGL, built for far larger datasets) | Possible but not their design center | regl is small (~50 KB), but deck.gl is large (~500 KB+) and brings a scene-graph/layer model that's overkill for one static grid | Requires manual canvas capture | Overkill — correct performance profile, wrong tool: a 200×50 grid of solid-colored rectangles does not need a WebGL scene graph; a 2D canvas context does this in a few milliseconds by direct measurement of similar grid sizes in `simpleheat`-style implementations |
| Custom Canvas 2D (hand-rolled) | — | Trivial at this scale: 10,000 `fillRect` calls (or a single `putImageData` pass) is a well-known-fast pattern (`simpleheat`, `hotmap`/pixi.js scale to millions of cells with this approach) | N/A | 0 KB (no library) | Native `canvas.toBlob()` | **Recommended** |

**Recommendation: split — uPlot for line charts, a hand-rolled Canvas 2D renderer for the heatmap.**

Rationale:
- 200×50 = 10,000 cells is squarely inside "known SVG failure zone" territory that this research question flags, and it's also past where general-purpose canvas charting libraries (ECharts, Plotly) have documented performance collapse in public issue trackers and benchmark suites. But it is trivially small for a *direct* canvas approach — drawing 10,000 rectangles (or one `putImageData` call over a `200×50` pixel buffer, upscaled with `imageSmoothingEnabled = false` or CSS `image-rendering: pixelated` for crisp cell edges) is well inside single-frame budget territory (sub-millisecond to low-single-digit milliseconds, per the class of implementation `simpleheat` uses at similar and larger scales).
- Pan/zoom on a fixed 200×50 grid is CSS-transform-friendly (scale/translate the canvas or its container) rather than needing a re-render per frame, which keeps the implementation simple and avoids pulling in a heavyweight interaction library.
- No general-purpose charting library in the comparison set both (a) renders heatmaps on canvas/WebGL by default and (b) has a bundle size smaller than what a hand-rolled ~150-line canvas renderer costs. Reaching for one buys nothing here.
- uPlot remains the right choice for the ordinary time-series line charts (equity curve, drawdown line) — it is purpose-built for dense daily series, already canvas-based, and far smaller than any alternative capable of the same job.
- Light/dark: implement as CSS custom properties read at render time (background, gridline, axis-label colors) plus a light/dark-aware color scale (e.g., swap `d3.interpolateViridis` for a variant with sufficient contrast on both backgrounds, or use a diverging scale like `d3.interpolateRdYlGn` reversed appropriately per metric). Canvas doesn't get free `prefers-color-scheme` styling the way CSS/SVG does, so this needs an explicit re-render (cheap, given the above) on theme toggle.

**What NOT to use for the heatmap:** ECharts, Plotly.js, Observable Plot, any SVG-default library. Each either fails outright at 10k cells (SVG-based) or has documented performance collapse in this size range (ECharts, Plotly canvas heatmap paths).

**Confidence: MEDIUM.** uPlot's lack of a heatmap mark and general canvas-vs-SVG guidance are corroborated by uPlot's own repo and ECharts' own documentation. The specific "~200 grid points" ECharts/Highcharts collapse figure and Plotly's multi-second render reports come from third-party benchmark write-ups and community forum threads, not vendor-published numbers — treat as directionally reliable, not exact.

### Q3 — App framework and build

| Option | Bundle (runtime, gzip) | Worker integration | Binary asset handling | Cloudflare Pages deploy |
|--------|------------------------|---------------------|------------------------|--------------------------|
| React 19.2.8 | ~45 KB (react + react-dom) | Fine via `?worker` + Comlink, well-trodden path | Fine via Vite `?url`/raw imports | Trivial — `vite build` output is static, drop into Pages |
| Svelte 5 (5.56.9) | ~2–5 KB runtime (compiles away most of the framework) | Fine, same Vite worker support | Fine | Trivial |
| Solid.js 1.9.14 | ~7 KB runtime | Fine, same Vite worker support | Fine | Trivial |
| Vanilla + TS | 0 KB framework | Fine | Fine | Trivial |

All four deploy identically to Cloudflare Pages (it's a static-file host — this axis doesn't discriminate). The real decision is bundle size and reactivity model, given the app is dominated by one expensive, infrequent operation (recomputing a 10k-run sweep) feeding into frequent, cheap UI updates (pan/zoom/theme/hover).

**Recommendation: Solid.js.** Reasoning:
- No virtual DOM: Solid compiles reactive bindings directly to fine-grained DOM updates, so when sweep parameters change and results propagate to the heatmap/chart, there's no framework-level re-render/diff cost layered on top of the canvas redraw work — the canvas redraw is already the expensive part, and Solid doesn't add a second cost on top of it.
- Runtime is close to Svelte's in size and close to React's in ecosystem familiarity (JSX, hooks-shaped APIs) — a reasonable middle ground for a project likely maintained solo.
- React is the safe/familiar default if ecosystem breadth and hiring/tutorial availability matter more than bundle size for this project — it's a legitimate alternative, not wrong, just heavier for a single-page tool with no need for React's ecosystem depth (no complex routing, no server components, no need for the broader library ecosystem React uniquely offers).
- Svelte 5 is also a strong contender (smallest runtime, mature compiler) — pick it over Solid if the team is more comfortable with Svelte's template syntax than Solid's JSX-like syntax; both are meaningfully lighter than React for this use case.
- Vanilla TS was considered and rejected only because state management for permalink-encoded URL parameters + reactive chart updates is exactly the boilerplate a micro-framework like Solid removes cheaply, without meaningfully increasing bundle size (7 KB is noise next to the ~1 MB of bundled data assets).

**Confidence: MEDIUM.** Bundle-size figures for React/Svelte/Solid are well-established industry knowledge, not from a single freshly-verified source; versions were verified directly against the npm registry (HIGH confidence on version numbers specifically).

### Q4 — Binary data format for bundled time series

Data shape: per-symbol series of dates + price-return + total-return, plus a short-rate series, ~1 MB total, decoded straight into typed arrays for the sweep engine.

| Format | Decode speed | Zero-copy into typed array | Compression on float64 | HTTP caching/versioning |
|--------|--------------|------------------------------|--------------------------|---------------------------|
| Raw `Float64`/`Float32` `ArrayBuffer` + custom header | Fastest possible — `new Float64Array(buffer, offset, length)` is a view, not a copy | Yes, genuinely zero-copy | None inherent — must apply own compression/encoding before gzip/brotli at the HTTP layer | Simple: content-hash the filename (Vite's asset pipeline already does this for imported assets), pair with `Cache-Control: immutable` |
| Apache Arrow IPC | Fast, designed for exactly this (`tableFromIPC` gives zero-copy vectors) | Yes | Same underlying float64 bytes, same gzip weakness unless Arrow's own compression codecs are used | Same as above, but adds a schema/metadata layer this project's fixed internal schema doesn't need |
| Parquet via hyparquet | Slower — Parquet is a page/row-group columnar format designed for selective, filtered reads from large files, not full-file decode into flat typed arrays; hyparquet decodes to JS arrays/objects by default, requiring an extra typed-array conversion pass | No (extra copy step) | Best on-disk compression of the options (Parquet supports per-column encodings like dictionary/RLE, plus standard codecs), but this dataset (dense daily floats, no repetition) doesn't hit Parquet's sweet spot | Same file-hash approach works, but Parquet's per-row-group indexing overhead buys nothing when the whole file is read every time |
| MessagePack (msgpackr) | Fast for the encode/decode itself, but MessagePack encodes numbers individually (not as contiguous typed-array buffers), so decoding into a `Float64Array` still requires an allocation + copy loop | No | No better than raw floats — same 8-bytes-per-value overhead, no columnar compression benefit | Same file-hash approach |
| Plain gzipped CSV | Slowest — text parsing + `parseFloat` per cell is orders of magnitude slower than a typed-array view, and is the only option requiring a full string-to-number parse pass | No | Gzip on ASCII decimal text actually compresses reasonably (text has structure gzip exploits) but still loses to raw binary + delta encoding, and decode cost dominates regardless | Same, but CSV has no schema/versioning discipline built in |

On the general float64-compression point raised in the question: **generic gzip compresses float64 arrays poorly** because IEEE-754 mantissa bits are effectively noise to a byte-oriented compressor (commonly cited ceiling around 2:1 for lossless general-purpose compression on raw float64). Two specific mitigations are relevant here and both are cheap to implement in the bundle compiler:
- **Delta encoding**: for the *rate* series (short rates, small day-to-day deltas) or index levels, storing first-differences (which cluster near zero and repeat leading-zero byte patterns) compresses far better under gzip/brotli than the raw values. This is the same principle behind Gorilla-style time-series compression (XOR/delta + leading-zero-run encoding), though implementing full Gorilla encoding is unnecessary complexity for this dataset size.
- **Fixed-point scaling**: returns and prices for this domain don't need full float64 precision — storing daily returns as scaled `Int32` (e.g., × 1e8, truncated) roughly halves raw size before compression even runs, and integers compress meaningfully better than floats under generic byte-oriented compressors.

**Recommendation: raw `ArrayBuffer` with a small custom binary header (magic bytes, format version, per-series offset/length table, symbol/date-range metadata), gzip- or brotli-compressed at the HTTP layer by Cloudflare's edge (automatic, no app-side work), with delta-encoding applied to the short-rate series specifically in the bundle compiler before that HTTP compression runs.**

Reasoning:
- The project's own PROJECT.md constraint is explicit: no backend, ~1 MB total dataset, decoded straight into typed arrays for the sweep engine. That is precisely the raw-`ArrayBuffer` use case — every layer added on top (Arrow's schema metadata, Parquet's row-group/page structure, MessagePack's per-value encoding) is overhead against a format the app fully controls end-to-end (both producer — the bundle compiler — and consumer — the app — are this codebase).
- Arrow IPC is the most defensible *alternative* if the schema is expected to grow in complexity (variable per-symbol column sets, nullable fields, mixed types) — it's the right call once the format needs to be self-describing for tooling outside this repo. That's not this project: the compiler and the app are one system with one shared, versioned header format, so self-description is redundant with the JSON manifest already required by Q5.
- Parquet/hyparquet is the wrong tool here specifically because Parquet is optimized for selective columnar reads from large files (predicate pushdown, column pruning) — this app reads the entire ~1 MB dataset on every load. Parquet's structural overhead has no workload to pay for itself against.
- Plain gzipped CSV is rejected outright — text parsing 250M+ cell-reads worth of daily bars across the full universe is measurably (orders of magnitude) slower than a typed-array view, for a format with no other advantage in this all-binary-controlled pipeline.
- Versioning: embed a format-version byte in the header and a build-time content hash in the filename (Vite does this automatically for imported binary assets); the JSON manifest (Q5) carries human-readable provenance (source, date range) per series, while the binary header carries only what's needed for the decoder to know how to slice the buffer.

**Confidence: MEDIUM-HIGH.** The zero-copy/typed-array mechanics are well-established browser API behavior (not in dispute). The gzip-on-float64 weakness and delta-encoding benefit are corroborated by multiple independent sources (general-purpose lossless compression literature, ClickHouse's own compression engineering writeup, and time-series-specific compression research). The specific recommendation follows directly from the project's own stated constraints (small fixed dataset, single producer/consumer, no backend) more than from any external benchmark.

### Q5 — The bundle compiler CLI

Node/TypeScript vs Python, for a CLI that ingests raw CSVs and emits binary bundles + a JSON manifest, doing data-cleaning work: splicing series, interpolating monthly rates to daily, aligning trading calendars.

**Recommendation: Node.js + TypeScript**, specifically because:
- **Single-language project.** The compiler's output format (the raw `ArrayBuffer` layout from Q4) is defined by, and consumed by, TypeScript code in the app. Writing the encoder in the same language as the decoder eliminates an entire class of bugs where the two sides of a binary format drift (endianness, struct padding, header field order) — the header struct can be a single shared TypeScript type/constant used by both the compiler and the app's decoder.
- **The data-cleaning work is real but bounded.** Splicing series, interpolating monthly-to-daily, and aligning trading calendars are the kinds of operations pandas makes pleasant, but they are not statistically sophisticated — they're deterministic, well-specified transforms (linear or step interpolation between monthly rate observations, forward-fill/reindex against a trading calendar) that are straightforward to implement directly, and testable with fast-check/Vitest golden files (Q7) in the same suite that tests the simulation engine.
- **Where Python's ecosystem genuinely matters** is if the deep-history data sourcing itself (e.g., pulling and reconciling Shiller's monthly dataset, or any future data source with a Python-first API/library) benefits from pandas idioms during *exploration* — that's a reasonable place to prototype in a Jupyter/Python scratch script before porting the final, tested transform into the TypeScript compiler. That's a one-time exploratory cost, not a standing second-language maintenance burden.
- **Trading-calendar alignment** is the one piece worth a dependency either way — Python's `pandas_market_calendars` is the most complete such library, but the JS ecosystem's smaller calendar libraries are sufficient given this project only needs a handful of calendars (NYSE/Nasdaq, effectively one calendar) rather than global market coverage.

Weigh this against the project's own constraint context (single owner, "drop in a CSV, recompile, redeploy" workflow) — a second language and runtime (Python + its own dependency management, separate from `npm install`) is friction against that stated goal every time the compiler needs a change, for cleaning logic that doesn't actually require pandas' strengths (its main value — vectorized operations over huge frames, groupby, merge-asof-style joins — is a bonus, not a necessity, at this data's size, on the order of tens of thousands of rows per symbol).

**Confidence: MEDIUM.** This is a judgment call weighing project-specific tradeoffs (stated in PROJECT.md) more than an external best-practice; both languages are legitimate choices and pandas would not be wrong, just an added toolchain for work that doesn't require it at this data scale.

### Q6 — Cloudflare Pages specifics

- **Asset size limits:** Cloudflare Pages' hard per-file limit is 25 MiB, comfortably above this project's ~1 MB total dataset — not a constraint here even as the bundled universe grows.
- **`_headers` file:** placed at the build output root, sets `Cache-Control` per path-glob pattern. For content-hashed assets (Vite's default output naming for imported binary assets), pair the hashed path pattern with `Cache-Control: public, max-age=31536000, immutable` — the browser then never revalidates that specific file, only re-fetches when the hash (and therefore the URL) changes on a new deploy.
- **Versioning:** rely on Vite's content-hash-in-filename behavior for immutability correctness "for free" — do not hand-roll a version query string (`?v=2`), since Cloudflare's edge cache and browser cache both key more reliably on path than on query string in some configurations, and content-hashed paths sidestep that ambiguity entirely.
- **HTML/manifest files** (anything not content-hashed, e.g. `index.html`, the JSON data manifest if served unhashed) should get a short or `no-cache` `Cache-Control` so deploys propagate promptly, while the hashed binary assets they reference stay `immutable`.
- **Offline-after-first-load:** a service worker (via `vite-plugin-pwa`, Workbox `generateSW` strategy) is the correct mechanism, not reliance on plain HTTP cache alone — plain HTTP caching, even with `immutable`, does not guarantee availability without a network round-trip when the browser is fully offline (cache-control headers govern revalidation *when a request is made*, they don't intercept the network layer the way a service worker's fetch handler does). Configure `globPatterns` to include the binary data bundles and the JSON manifest, and raise `maximumFileSizeToCacheInBytes` above its low default if any single bundled asset (unlikely at ~1 MB total across all assets, but possible for a single large symbol's full-history series) approaches it.
- **Cache-busting on redeploy:** Workbox's precache manifest is itself content-hash-based, so a new deploy naturally invalidates only the files that changed — this composes correctly with the `_headers`-driven immutable HTTP caching rather than fighting it.

**Confidence: MEDIUM.** Cloudflare's own documentation is authoritative for the size limit and `_headers` mechanics; the service-worker-vs-HTTP-cache reasoning is standard PWA practice, not Cloudflare-specific, and is corroborated by Workbox's own documentation and multiple implementation write-ups.

### Q7 — Testing numerical code

- **Golden-file / snapshot testing (Vitest):** Vitest's built-in snapshot support (`toMatchSnapshot()` / `toMatchFileSnapshot()`) is the standard mechanism for asserting a computed series (e.g., synthetic 3x S&P 500 daily values) against a stored reference. For the UPRO/TQQQ tracking requirement specifically, the golden file is not a Vitest-generated snapshot but the *actual bundled real-ETF series* — the test computes the synthetic leveraged series from the underlying index and short-rate data, then asserts it stays within the documented tolerance band of the real ETF series over the full overlapping date range, using an explicit numeric assertion (max absolute/relative deviation, or tracking-error statistics) rather than snapshot equality — snapshot/golden-file testing is the right *pattern* (compare against a trusted reference file) but the comparison itself needs to be tolerance-based, not exact-match, since real ETF data includes financing-cost and expense-ratio realities the model approximates.
- **Property-based testing (fast-check):** fast-check is the standard property-based testing library in the TS ecosystem and integrates directly with Vitest's test runner. It's the right tool for invariants the simulation engine must hold across the *entire input space*, not just fixed examples — e.g.:
  - 1x leverage reproduces the unlevered series exactly, for any generated return series
  - Monotonicity: higher financing spread strictly reduces the final value for any leverage > 1, holding everything else fixed
  - Ruin detection: once position value crosses zero, it never becomes spuriously positive again in the remaining series, for any generated input
  - IRR calculation is invariant to a currency-scaling of all cash flows (contributions and final value scaled by any positive constant should not change the computed IRR)
  - Additive decomposition: volatility drag + financing cost + expense ratio + naive-L*r result should reconstruct the actual simulated result, for any generated parameter combination (this is the cost-attribution correctness invariant, arguably the single most important property test in the project given cost attribution is the headline feature)
- **Division of labor:** use fast-check for algebraic/structural invariants that must hold for *any* valid input (the properties above), and Vitest golden-file comparison specifically for the empirical claim that the model matches reality (UPRO/TQQQ tracking) — these are different kinds of correctness (internal consistency vs external validity) and conflating them into one test style would weaken both.

**Confidence: MEDIUM.** fast-check and Vitest are well-established, current tools (versions verified against npm registry directly, HIGH confidence there); the specific property list above is derived from this project's own stated requirements (PROJECT.md) rather than sourced from an external "how to test financial code" reference — treat the property list as a starting point to expand during phase planning, not an exhaustive spec.

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| ECharts, Plotly.js, or Observable Plot for the heatmap | ECharts' own heatmap benchmark reports degrade well before 10,000 cells; Plotly.js community reports describe multi-second to 30-second heatmap renders in this size range and uses `data:`-URL-based rendering internally, hurting export quality; Observable Plot defaults to SVG rendering, the specific failure mode this research question calls out for 10k-cell heatmaps | Hand-rolled Canvas 2D renderer |
| uPlot for the heatmap | uPlot has no heatmap mark at all — it's a time-series/line/bar/OHLC library only | Hand-rolled Canvas 2D renderer for the heatmap; uPlot remains correct for the line charts |
| Rust/AssemblyScript → WASM as the day-one sweep implementation | JIT-compiled `Float64Array` JS in a Worker pool is estimated to already land in the 150–600 ms range for this workload — a second compiled-language toolchain isn't justified until real-hardware profiling shows the JS path insufficient | Worker pool over plain JS/`Float64Array`; keep WASM as a documented fallback behind a stable `runSweep()` interface |
| WebGPU compute shaders as the primary/only compute path | Firefox ships WebGPU disabled by default as of mid-2026; a shareable-permalink tool that silently fails or degrades for a meaningful share of visitors undermines the project's own "settle the argument with a link" purpose | Worker pool (CPU); revisit only if sweep size grows an order of magnitude and CPU-pool performance is confirmed insufficient on real hardware |
| Apache Arrow IPC or Parquet/hyparquet for the bundled data format | Arrow's schema/metadata layer and Parquet's row-group/page structure are overhead against a fixed, single-producer/single-consumer binary format this project fully controls; Parquet specifically is optimized for selective reads from large files, not full-file decode of a ~1 MB dataset | Raw `ArrayBuffer` with a small custom header |
| Plain gzipped CSV for the bundled data format | Text parsing (`parseFloat` per cell) across the full universe is measurably slower than a typed-array view, with no offsetting benefit in an all-binary-controlled pipeline | Raw `ArrayBuffer`, gzip/brotli-compressed at the HTTP edge, with delta-encoding applied to the short-rate series before compression |
| Relying on HTTP cache alone for offline support | `Cache-Control` headers, even `immutable`, govern revalidation on a network request — they don't make the app available with zero network at all | Service worker via `vite-plugin-pwa` (Workbox `generateSW`) |
| React, if bundle size and re-render overhead matter more than ecosystem familiarity | Not wrong, just heavier (~45 KB vs Solid's ~7 KB) for a single-page tool with no need for React's broader ecosystem (no server components, no complex routing) | Solid.js (or Svelte 5 as a close second choice) |

## Stack Patterns by Variant

**If profiling on real hardware shows the Worker-pool JS sweep engine exceeds ~1 s on representative consumer hardware:**
- Add a Rust + `wasm-bindgen` (or `wasm-bindgen-rayon` for multi-threaded WASM) implementation behind the existing `runSweep()` interface, targeting WASM SIMD specifically, since SIMD is where WASM's real advantage over JIT-compiled JS materializes for this kind of vectorizable arithmetic
- Because the interface seam (recommended in Q1) makes this a drop-in swap, not a rewrite

**If the bundled data universe grows to need per-column nullable fields, mixed schemas across symbols, or external tooling interop:**
- Reconsider Apache Arrow IPC (or the lighter Flechette implementation) over the raw-`ArrayBuffer` format
- Because Arrow's self-describing schema starts paying for itself once the format needs to be read/written by tools outside this repo, or needs structural flexibility the fixed custom header doesn't cleanly support

**If Firefox's WebGPU-by-default status changes (currently disabled as of mid-2026):**
- Reconsider a WebGPU compute path as a progressive enhancement (feature-detect, fall back to the Worker pool) for very large future sweeps
- Because the browser-support blocker, not the technology, is the reason WebGPU is deferred for v1

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| solid-js@1.9.14 | vite-plugin-solid@2.11.14, vite@8.2.1 | Standard Vite+Solid starter combination |
| vitest@4.1.10 | vite@8.2.1 | Vitest 4.x targets Vite 6/7/8-line hosts; keep both on current majors together |
| fast-check@4.9.0 | vitest@4.1.10 | No special integration package needed — fast-check's `fc.assert`/`fc.property` runs directly inside a standard Vitest `test()` block |
| vite-plugin-pwa@1.3.0 | vite@8.2.1 | Confirm plugin's peer-dependency range against the installed Vite major at implementation time — PWA plugin majors have historically tracked Vite majors closely |
| uplot@1.6.32 | none required | Zero dependencies — safe to pin without a compatibility matrix |

## Sources

- npm registry (`registry.npmjs.org`) direct lookups for all version numbers — HIGH confidence, primary source
- uPlot GitHub repository (`github.com/leeoniya/uPlot`) — heatmap-mark absence and canvas-based design
- Apache ECharts official docs, "Canvas vs SVG" best-practices page — canvas recommendation for >1k elements
- SciChart.js benchmark write-up ("Performance Comparison of JavaScript Chart Libraries in 2026") — third-party benchmark, ECharts/Highcharts heatmap degradation figures — MEDIUM/LOW confidence, single-source benchmark
- Plotly.js GitHub issue tracker and Plotly Community Forum threads on heatmap performance — community-reported, not vendor-benchmarked — LOW confidence, corroborating pattern across multiple independent threads raises to MEDIUM
- Cloudflare Pages/Workers official docs (`developers.cloudflare.com/pages/platform/limits`, `.../workers/static-assets/headers/`) — asset size limit, `_headers` mechanics
- Vite PWA plugin official docs (`vite-pwa-org.netlify.app`) — Workbox `generateSW`/precache configuration
- General floating-point compression literature (Lindstrom/Isenburg-class fast lossless FP compression papers, ClickHouse compression engineering writeup) — gzip-on-float64 weakness, delta-encoding rationale — MEDIUM confidence, consistent across independent academic and industry sources
- WebGPU browser-support tracking write-ups (multiple 2026 status posts) — MEDIUM/LOW confidence, aggregated from secondary sources rather than caniuse.com directly; re-verify against caniuse.com at implementation time given this is a fast-moving compatibility surface
- Apache Arrow JS official docs and GitHub repo, plus Flechette project comparison — zero-copy IPC decode mechanics and relative bundle sizes

---
*Stack research for: browser-based financial backtesting/visualization app, static deploy to Cloudflare Pages*
*Researched: 2026-08-16*

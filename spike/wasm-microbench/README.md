# wasm-microbench (throwaway, D-11)

Deleted at Phase 1 end per D-13. Its only permanent output is the JS-versus-WASM ratio recorded
in `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md`. This file exists
so that document's reproduction steps can be transcribed verbatim before this crate is deleted.

## What this measures

`src/lib.rs` ports two things from the JS arm bit-for-bit: `make_seeded_gbm_series`
(`bench/synthetic-data.ts`'s `makeSeededGbmSeries`) and the branchy per-bar recurrence
(`bench/kernel.ts`'s `runSpikeBacktest`, exposed here as `WasmSeries::run_spike_backtest` /
`bench_full_series`). `harness/run.mjs` drives the compiled WASM module in the same headless
Chromium the production `npm run bench` suite uses, using the same calibration-normalized
minimum-of-5 methodology as `bench/calibration.ts`, and asserts the WASM arm's output is
element-wise equal (within a 1e-9 relative tolerance) to the JS arm's own `runSpikeBacktest`
output for the identical seed and parameters before printing any timing as trustworthy.

A single call lands at/below `performance.now()`'s effective resolution in headless Chromium on
this machine (both arms measure the identical raw floor value, ~0.1ms) — see 01-SPIKE-RESULTS.md
for how the batched (5,000-call) secondary measurement resolves this.

## Toolchain install (verbatim commands used this session)

Neither `cargo`, `rustc`, nor `wasm-pack` were present. Installed via the official installers,
never via npm (Package Legitimacy Audit, 01-RESEARCH.md — the npm `wasm-pack` wrapper's
postinstall fetches a platform binary from GitHub releases at install time; installing outside
`package.json` avoids that entirely):

```bash
# Rust toolchain (rustup), minimal profile, stable channel
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup-init.sh
chmod +x /tmp/rustup-init.sh
/tmp/rustup-init.sh -y --default-toolchain stable --profile minimal
source "$HOME/.cargo/env"

# WASM target
rustup target add wasm32-unknown-unknown

# A host C toolchain (gcc) is required even for a wasm32-unknown-unknown build: cargo still
# compiles proc-macro crates and build scripts for the HOST target before it can reach the wasm
# output, and wasm-pack's own installer (cargo install wasm-pack) needs one too. This sandbox
# had libgcc but no cc/gcc; installed via apt (Ubuntu 24.04 noble, arm64):
sudo apt-get update
sudo apt-get install -y gcc

# wasm-pack, via cargo — never via npm
cargo install wasm-pack
```

Versions installed this session: `rustc 1.97.1 (8bab26f4f 2026-07-14)`,
`cargo 1.97.1 (c980f4866 2026-06-30)`, `wasm-pack 0.15.0`.

## Build

```bash
cd spike/wasm-microbench
cargo build --target wasm32-unknown-unknown --release
wasm-pack build --target web --release
```

Produces `pkg/wasm_microbench.js` (the `wasm-bindgen`-generated ES module wrapper) and
`pkg/wasm_microbench_bg.wasm`.

## Run the measurement

```bash
node spike/wasm-microbench/harness/run.mjs
```

This does four things:

1. Computes the JS arm's reference `finalValue`/`ruined` for the same seed
   (`DEFAULT_SEED = 0x5eed5eed`) and params by importing `bench/kernel.ts` and
   `bench/synthetic-data.ts` directly (`harness/js-reference.ts`, run via
   `node --experimental-strip-types` — Node 22's native TS type-stripping, no build step, no new
   devDependency).
2. Launches headless Chromium via the project's existing Playwright install, serves
   `spike/wasm-microbench/` over a local HTTP server (module scripts fail under `file://` due to
   Chromium's CORS restrictions), and runs `harness/index.html`, which builds the WASM series
   once, proves correctness, then times `bench_full_series` with the same calibration-normalized
   minimum-of-5 methodology as `bench/calibration.ts` — both a single call and a 5,000-call batch
   (to recover a resolvable per-call figure once the single-call time is at the timer's floor).
3. Runs the analogous batched measurement for the JS arm under Node's V8
   (`harness/js-batched-reference.ts`) as a secondary, explicitly-labelled data point (Node V8,
   not headless Chromium's V8 — see that file's header comment for why this is supplementary,
   not the primary same-environment ratio).
4. Asserts equivalence, then prints one JSON object with both arms' correctness results and every
   timing figure. A non-zero exit means either equivalence failed or the harness itself errored.

## Delete

`rm -rf spike/` (per D-13), after transcribing the run's JSON output into
`01-SPIKE-RESULTS.md`'s Raw numbers and Reproduction steps sections.

//! spike/wasm-microbench/src/lib.rs — D-11/D-12 throwaway Rust microbenchmark.
//!
//! Ports two things from the JS arm bit-for-bit, per the header comments in
//! `bench/synthetic-data.ts` and `bench/kernel.ts`:
//!
//! - `make_seeded_gbm_series` — the mulberry32 PRNG + trigonometric Box-Muller GBM series
//!   generator (`makeSeededGbmSeries`).
//! - `run_spike_backtest` (a method on `WasmSeries`) and `bench_full_series` (its wasm-bindgen
//!   entry point) — the branchy per-bar leveraged recurrence (`runSpikeBacktest`), including the
//!   contribution schedule, the ruin clamp with its absorbing state, calendar-day financing
//!   accrual, and trading-day expense accrual. Not a stripped arithmetic loop (D-12): a stripped
//!   loop is the case where WASM looks best and would flatter it relative to the real kernel.
//!
//! This crate is deleted at phase end (D-13). Its only output is the JS-versus-WASM ratio
//! recorded in `.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md`.

use wasm_bindgen::prelude::*;

const BAR_COUNT: usize = 25_000;
const TRADING_DAYS_PER_YEAR: f64 = 252.0;
const CALENDAR_DAYS_PER_YEAR: f64 = 365.0;

const DAILY_DRIFT: f64 = 0.0003;
const DAILY_VOL: f64 = 0.012;

const SHORT_RATE_BASE: f64 = 0.02;
const SHORT_RATE_AMPLITUDE: f64 = 0.015;
const SHORT_RATE_CYCLES: f64 = 3.0;
const SHORT_RATE_NOISE_HALF_WIDTH: f64 = 0.00025;

const GAP_BAR_STRIDE: usize = 5;
const HOLIDAY_GAP_PROBABILITY: f64 = 0.05;

/// mulberry32, ported bit-for-bit from `bench/synthetic-data.ts`'s header comment. `state` is
/// kept as `u32` throughout (never `i32`) so every shift is the logical (zero-filling) shift
/// that matches JS's `>>>` operator, and every multiply/add is `wrapping_*` so the bit pattern
/// matches JS's `Math.imul` / `(... ) | 0` truncation — two's-complement wraparound produces an
/// identical bit pattern regardless of signed/unsigned interpretation, so u32 throughout is
/// sufficient for bit-for-bit parity.
fn mulberry32_next(state: &mut u32) -> f64 {
    *state = state.wrapping_add(0x6d2b79f5);
    let mut t: u32 = (*state ^ (*state >> 15)).wrapping_mul(1 | *state);
    t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))) ^ t;
    ((t ^ (t >> 14)) as f64) / 4294967296.0
}

/// One standard normal deviate via the trigonometric Box-Muller transform, consuming two draws.
/// Ported bit-for-bit from `bench/synthetic-data.ts`'s `nextGaussian`.
fn next_gaussian(state: &mut u32) -> f64 {
    let u1 = mulberry32_next(state).max(1e-12);
    let u2 = mulberry32_next(state);
    (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
}

/// The seeded 25,000-bar synthetic series: daily GBM returns, a slowly-oscillating short rate,
/// and calendar-day gaps standing in for weekends/holidays. Mirrors `SyntheticSeries` in
/// `bench/synthetic-data.ts`.
#[wasm_bindgen]
pub struct WasmSeries {
    returns: Vec<f64>,
    short_rate: Vec<f64>,
    calendar_days_elapsed: Vec<i32>,
}

/// Ported bit-for-bit from `makeSeededGbmSeries`. Calling this twice with the same seed produces
/// element-wise identical series, exactly like the JS arm.
#[wasm_bindgen]
pub fn make_seeded_gbm_series(seed: u32) -> WasmSeries {
    let mut state = seed;
    let mut returns = vec![0.0_f64; BAR_COUNT];
    let mut short_rate = vec![0.0_f64; BAR_COUNT];
    let mut calendar_days_elapsed = vec![0_i32; BAR_COUNT];

    for i in 0..BAR_COUNT {
        let z = next_gaussian(&mut state);
        returns[i] = DAILY_DRIFT + DAILY_VOL * z;

        let cycle_position =
            (i as f64 / BAR_COUNT as f64) * 2.0 * std::f64::consts::PI * SHORT_RATE_CYCLES;
        let rate_noise = (mulberry32_next(&mut state) - 0.5) * 2.0 * SHORT_RATE_NOISE_HALF_WIDTH;
        let rate = SHORT_RATE_BASE + SHORT_RATE_AMPLITUDE * cycle_position.sin() + rate_noise;
        short_rate[i] = rate.max(0.0);

        if i % GAP_BAR_STRIDE == 0 {
            calendar_days_elapsed[i] = if mulberry32_next(&mut state) < HOLIDAY_GAP_PROBABILITY {
                4
            } else {
                3
            };
        } else {
            calendar_days_elapsed[i] = 1;
        }
    }

    WasmSeries {
        returns,
        short_rate,
        calendar_days_elapsed,
    }
}

#[wasm_bindgen]
impl WasmSeries {
    /// The branchy per-bar recurrence, ported bit-for-bit from `runSpikeBacktest` including the
    /// contribution schedule, the ruin clamp's absorbing state, calendar-day financing accrual
    /// (365-day basis) and trading-day expense accrual (252-day basis) — two deliberately
    /// different accrual bases, not conflated, per the JS arm's header comment.
    ///
    /// Output buffers are allocated once per call (mirroring the JS arm's per-repeat allocation
    /// discipline is not required here — the JS arm preallocates its output buffers *outside*
    /// the timed `measureMinOfN` loop and reuses them across all 5 repeats; this method
    /// allocates a correctly-sized `Vec` per call because wasm-bindgen has no zero-cost way to
    /// hand back a caller-owned scratch buffer across the JS boundary for a throwaway spike).
    /// Returns `[finalValue, ruinedAsF64]` (0.0 = not ruined, 1.0 = ruined).
    pub fn run_spike_backtest(
        &self,
        leverage: f64,
        entry_index: u32,
        initial_investment: f64,
        contribution_amount: f64,
        contribution_interval_bars: u32,
        financing_spread: f64,
        expense_ratio: f64,
    ) -> Vec<f64> {
        let entry_index = entry_index as usize;
        let bar_count = self.returns.len();
        let out_len = bar_count - entry_index;
        let mut out_value = vec![0.0_f64; out_len];
        let mut out_ruined = vec![0_u8; out_len];

        let mut value = initial_investment;
        let mut ruined = false;
        let mut last_out_idx: i64 = -1;

        for i in entry_index..bar_count {
            let out_idx = i - entry_index;
            last_out_idx = out_idx as i64;

            if ruined {
                out_value[out_idx] = 0.0;
                out_ruined[out_idx] = 1;
                continue;
            }

            let daily_return = self.returns[i];
            let rate = self.short_rate[i];
            let calendar_gap = self.calendar_days_elapsed[i] as f64;

            // A1: leverage applied to the daily return and compounded — never cumulative.
            value *= 1.0 + leverage * daily_return;

            // A2/A8: financing on the borrowed portion, calendar-day accrual. Structurally zero
            // at leverage 1 (A10), matching the JS arm's `if (leverage > 1)` guard exactly.
            if leverage > 1.0 {
                let financing_cost = value
                    * (leverage - 1.0)
                    * (rate + financing_spread)
                    * (calendar_gap / CALENDAR_DAYS_PER_YEAR);
                value -= financing_cost;
            }

            // A4: expense ratio on the flat trading-day convention, every bar.
            value -= value * (expense_ratio / TRADING_DAYS_PER_YEAR);

            // A7: ruin clamp — absorbing state.
            if value <= 0.0 {
                value = 0.0;
                ruined = true;
                out_value[out_idx] = 0.0;
                out_ruined[out_idx] = 1;
                continue;
            }

            // Contribution added after the ruin check, so a contribution on the ruin bar itself
            // can never resurrect the position.
            if contribution_interval_bars > 0
                && out_idx > 0
                && out_idx % (contribution_interval_bars as usize) == 0
            {
                value += contribution_amount;
            }

            out_value[out_idx] = value;
            out_ruined[out_idx] = 0;
        }

        let final_value = if last_out_idx >= 0 {
            out_value[last_out_idx as usize]
        } else {
            initial_investment
        };
        let ruined_flag = if ruined || out_ruined.last().copied().unwrap_or(0) == 1 {
            1.0
        } else {
            0.0
        };
        vec![final_value, ruined_flag]
    }
}

/// The timed entry point (D-11 Task 1). Takes the same parameter set as `SpikeKernelParams`
/// (`leverage`, `entryIndex`, `initialInvestment`, `contributionAmount`,
/// `contributionIntervalBars`, `financingSpread`, `expenseRatio`) plus the already-built series,
/// exactly mirroring the JS arm's `runSpikeBacktest(params, series, outValue, outRuined)` shape:
/// the series is built once, outside the timed region, and only the recurrence itself is timed.
/// Returns `[finalValue, ruinedAsF64]`.
#[wasm_bindgen]
pub fn bench_full_series(
    series: &WasmSeries,
    leverage: f64,
    entry_index: u32,
    initial_investment: f64,
    contribution_amount: f64,
    contribution_interval_bars: u32,
    financing_spread: f64,
    expense_ratio: f64,
) -> Vec<f64> {
    series.run_spike_backtest(
        leverage,
        entry_index,
        initial_investment,
        contribution_amount,
        contribution_interval_bars,
        financing_spread,
        expense_ratio,
    )
}

# Phase 03 gate diagnosis: splitting the unclassified residual in two

Written by the execute-phase orchestrator after plan 03-06 halted, per D-20's requirement to
classify a residual before changing anything. Plan 03-06 correctly refused to force a single
classification. The reason it could not was that **the residual is two residuals with two
different causes**, and D-20's table asks for one row.

Everything below was measured with throwaway read-only scripts against the committed bundle,
calling the unmodified kernel, data layer and `computeTrackingError`. No source file was changed
to produce these numbers, and no cost parameter or tolerance was touched.

## As committed, the gate is RED on both funds and both gates

| Fund | Annualized tracking error | Tolerance | Annualized return drift | Tolerance |
|---|---|---|---|---|
| UPRO | 3.1640% | 0.66% | -6.9678% | 0.525% |
| TQQQ | 3.5647% | 0.66% | -3.8605% | 0.525% |

## Residual 1 — return drift: a structural defect in the comparison, not a cost

`tests/validation/upro-tqqq-gate.test.ts:245` builds the synthetic with `dividendReinvest: false`,
citing D-10 ("the synthetic applies leverage to the price-return index"), and compares it against
`UPRO/total-return` and `TQQQ/total-return`. The two sides therefore disagree about dividends:
the synthetic's underlying excludes them, the reference fund series includes its distributions.

Re-running the identical comparison with the synthetic built from the **total-return** index
instead, changing nothing else:

| Fund | drift, synthetic from price-return | drift, synthetic from total-return | Tolerance |
|---|---|---|---|
| UPRO | -6.968% | **+0.254%** | 0.525% |
| TQQQ | -3.860% | **+0.399%** | 0.525% |

Both land inside the tolerance. The entire drift is the dividend asymmetry. This matches D-20's
row 4 signature ("synthetic far too pessimistic overall") but NOT that row's assigned cause
(retail rate, A3), which plan 03-06 had already ruled out by confirming the rate source is
wholesale. Same signature, different structural cause. It is still D-20 outcome 1, fix structure.

Note this contradicts D-10 as literally written, so it is a decision to re-open, not a silent fix.

## Residual 2 — tracking error: not attributable to the cost model at all

The dividend fix leaves the tracking error essentially unchanged (UPRO 3.164% -> 3.215%,
TQQQ 3.565% -> 3.533%), so it has a different cause.

Decisive measurement: compare each fund's OWN realized daily return against 3x its own stated
benchmark index, with **no cost model of any kind applied**.

| Comparison | Annualized TE | Excluding the worst 1% of days |
|---|---|---|
| UPRO vs 3x SPX total return, no model | 3.198% | 2.282% |
| UPRO vs 3x SPX price return, no model | 3.152% | 2.295% |
| TQQQ vs 3x NDX total return, no model | 3.519% | 2.743% |
| TQQQ vs 3x NDX price return, no model | 3.553% | 2.786% |

These are within noise of the gate's measured 3.164% and 3.565%. **The cost model contributes
essentially nothing to Gate 1.** A tracking error of roughly 3.2% (UPRO) and 3.5% (TQQQ) exists in
the reference data before any model touches it, so no cost model can reduce it below that floor,
and the 0.66% tolerance is unreachable by construction against this reference series.

The mechanism: per the manifest, `UPRO/*` and `TQQQ/*` are Yahoo Finance chart-endpoint series,
i.e. **market closing prices**, not NAV. A leveraged ETF's market close carries premium/discount
and close-timing noise against the index close. That is a property of the reference series, not of
the simulation. It is broad-based rather than outlier-driven: excluding the worst 1% of days only
brings it to ~2.3-2.8%.

This is D-20 outcome 2 territory (widen the tolerance by naming the mechanism in
`TOLERANCE_MECHANISMS`), and the mechanism now has a measured basis rather than an estimate.

## What this does NOT license

Neither finding permits touching a cost parameter. VALID-03 binds unchanged, and nothing above
was derived by fitting anything to the measured error. The expense ratios stay at their `CITED`
filing values and the financing spread stays at its `ASSUMED` midpoint.

## Reproduction

Both diagnostics were throwaway scripts, deliberately not committed. Residual 1 re-runs the gate
harness with `dividendReinvest: true`. Residual 2 needs only the bundle: for each fund, take
`fund_return[i] - 3 * index_return[i]` across the overlap, then sample standard deviation times
sqrt(252).

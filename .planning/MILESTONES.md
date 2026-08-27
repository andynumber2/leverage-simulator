# Milestones

Historical record of shipped versions.

---

## v1.0 (2026-08-27)

**Status:** Complete, override closeout
**Phases:** 9 (01 through 08, plus inserted phase 07.1)
**Plans:** 66
**Commits:** 604
**Timeline:** 2026-08-15 to 2026-08-27, 12 days
**Requirements:** 71 of 72 satisfied
**Known verification overrides:** 2 (see STATE.md Deferred Items)
**Archive:** [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md), [v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md)
**Audit:** [v1.0-MILESTONE-AUDIT.md](v1.0-MILESTONE-AUDIT.md), status `gaps_found`

### What shipped

A static web app that simulates daily-rebalanced leveraged exposure to a bundled set of indices
and ETFs, with the cost model as the product rather than an afterthought.

1. **A dataset that can be audited.** Every series carries its source and date range, compiled at
   build time into a raw `ArrayBuffer` decoded zero-copy into typed arrays, with a
   recompile-determinism gate in CI so the committed bundle cannot drift from its inputs.
2. **A simulation kernel proven against reality.** Synthetic 3x tracks real UPRO and TQQQ history
   inside a documented tolerance. Closing that gate surfaced two real defects: a dividend-convention
   error (the synthetic was built from the price-return index and compared against a
   dividend-inclusive fund series) and a tolerance that had been set against the wrong basis. No
   cost parameter was tuned to make the gate pass.
3. **A defensible single-run backtest** with cost attribution that says which mechanism consumed the
   money (volatility drag, financing, expense ratio) rather than only reporting the outcome.
4. **A 10,000-cell entry-date by leverage heatmap** computed off the main thread in a Worker pool,
   with a hand-rolled Canvas 2D renderer.
5. **Export in whatever form the argument needs:** PNG to the clipboard, CSV whose columns let a
   skeptic recompute the same final value in a spreadsheet, and named preset scenarios declared
   unflattering-first so the preset list cannot itself be read as a cherry-pick.

### What did not ship

**PERF-03.** A 10,000-cell sweep does not complete under 1000ms on the declared 4-core baseline.
Measured 1257 to 1411ms across every production run ever taken. Five levers were measured and
refuted: WASM (1.20x slower), worker width 4 (zero, reverted), kernel per-bar output arrays (1-2%),
pool and dispatch overhead (0.14ms across the whole grid), and per-cell kernel compute itself
(combined ratio median 1.0036, six of eight arms slower than shipped). An entire phase (07.1) was
inserted to spend the pool-tuning lever and reported a negative result honestly, including
reverting its own worker-count change. The budget was never relaxed to close the gap.

**The bench suite's own total runtime**, 56,141ms against a 30,000ms cap. The visibility half of
that criterion landed; the runtime itself did not come down.

### Lessons worth carrying

- **A measurement instrument can be blind in a way that reads as a pass.** PERF-07a is observed
  with `PerformanceObserver({ type: 'longtask' })`, whose entries only exist above 50ms, against a
  budget that is also 50ms. A `0.00ms` row means "nothing crossed 50ms", never "large headroom".
  That misreading let PNG export ship 2.4x over budget on real hardware while the record said
  "essentially maximal headroom".
- **Verifying on the wrong host is the same as not verifying.** Both post-merge defects in Phase 8
  were invisible on a 9-core dev sandbox and immediate on 4-core CI.
- **Human verification gates catch what oracles cannot.** The real-Safari PNG check failed on its
  first run and surfaced a WebKit-only defect that had been live for four plans, with every
  automated "is the canvas blank" assertion passing while it was broken.
- **Negative results are results.** Phase 07.1 and three follow-up quick tasks exist entirely to
  record that five performance levers do not work. That record is why PERF-03 could be closed as a
  decision rather than left as an open question.

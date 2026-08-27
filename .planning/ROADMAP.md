# Roadmap: Leverage Simulator

## Milestones

| Milestone | Status | Phases | Plans | Closed | Archive |
|---|---|---|---|---|---|
| v1.0 | Complete (override closeout, 2 escalations) | 9 | 66 | 2026-08-27 | [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) |

**v1.0 shipped the whole product loop:** a bundled, sourced, versioned dataset; a simulation kernel
proven against real UPRO and TQQQ history; a single-run backtest with cost attribution; a
10,000-cell entry-date by leverage heatmap; and export as PNG, CSV or a shareable permalink.
71 of 72 requirements met. Requirements archived to
[v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md); audit at
[v1.0-MILESTONE-AUDIT.md](v1.0-MILESTONE-AUDIT.md).

**Carried forward into v1.1** (see STATE.md Deferred Items for the full measurement history):

1. **PERF-03, not met.** A 10,000-cell sweep measures 1257 to 1411ms against a 1000ms budget on the
   4-core baseline and has never passed. Five levers measured and refuted; only D-03's coarser
   default grid remains, and it changes what is measured rather than making it faster. The budget
   was never relaxed.
2. **Bench suite total runtime**, 56,141ms against a 30,000ms cap. The breach is visible rather
   than masked, but was never brought inside the cap.
3. **The CI benchmark approach itself is an open design question.** The project owner considers it
   not useful given run-to-run variability, and the project's own data supports the concern:
   `normalize()`'s residual is 6.36% over 13 baseline runs, so one run supports a headroom claim
   only to about plus or minus 13%, and a separate instrument (PERF-07a's longtask observer) was
   found to be structurally incapable of evidencing headroom at all. Keep, rebuild or retire is
   undecided.
4. **Nyquist coverage**, 3 of 9 phases reconciled. Phases 04, 05, 06, 07, 07.1 and 08 carry a
   `VALIDATION.md` at `status: draft`.

---

## Next Milestone

Not yet defined. Run `/gsd-new-milestone` to scope v1.1.

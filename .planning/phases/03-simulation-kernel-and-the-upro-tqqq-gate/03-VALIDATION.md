---
phase: 03
slug: simulation-kernel-and-the-upro-tqqq-gate
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-18
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by plan-phase from `03-RESEARCH.md` § Validation Architecture. Task IDs are
> filled in by the planner; `TBD` rows mean "the plan had not been written yet when this
> file was seeded", not "unverified".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 — already configured with three projects (`unit`, `bench`, `bench-selftest`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test` (the `unit` project only, Node environment) |
| **Full suite command** | `npm run test && npm run bench` (unit correctness plus the PERF-02 budget gate) |
| **Estimated runtime** | ~10s quick, ~60s full (bench spawns headless Chromium) |

`npm run bench:selftest` is a gate-liveness proof, not part of the normal loop. Do not add it
to the per-task sampling command.

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test && npm run bench`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds (quick), 60 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01 T1 | 03-01 | 1 | SIM-01, SIM-02, SIM-03, SIM-05 | T-03-01, T-03-04 | length asserts before the loop; non-finite scalars rejected at the boundary | unit (end-to-end, real bundle) | `npm run test -- tests/data/kernel-inputs.test.ts` | ❌ W0 | ⬜ pending |
| 03-01 T1 | 03-01 | 1 | SIM-11 | T-03-02 | `decodeHeader` called with the required expected-version argument | script (end-to-end) | `npm run run-backtest -- --symbol SPX --leverage 3 --entry 1990-01-02 --holding-bars 2520` | ❌ W0 | ⬜ pending |
| 03-01 T2 | 03-01 | 1 | SIM-08, SIM-10 | T-03-01, T-03-03 | out-of-range parameters throw naming the value; kernel import set asserted | unit (source + behavior assertions) | `npm run test -- tests/kernel/module-boundary.test.ts` | ❌ W0 | ⬜ pending |
| 03-02 T1 | 03-02 | 2 | SIM-01, SIM-02, SIM-03, SIM-04, SIM-12 | — | N/A | unit (table-driven + fast-check property) | `npm run test -- tests/kernel/pitfalls-a.test.ts` | ❌ W0 | ⬜ pending |
| 03-02 T2 | 03-02 | 2 | SIM-05, SIM-12 | T-03-06, T-03-07, T-03-08 | ruin asserted categorically, never by epsilon; no negative value reachable | unit (table-driven + real-bundle case) | `npm run test -- tests/kernel/ruin.test.ts` | ❌ W0 | ⬜ pending |
| 03-03 T1 | 03-03 | 2 | SIM-09, VALID-03 | T-03-09 | the one-way commit's content is confirmed before the door is walked through | checkpoint:decision (blocking) | manual — see Manual-Only below | n/a | ⬜ pending |
| 03-03 T2 | 03-03 | 2 | SIM-09, VALID-03 | T-03-09, T-03-10, T-03-11 | confidence tag required per entry; `ASSUMED` must record its failed retrieval routes | unit (constant pinning, D-19) | `npm run test -- tests/validation/cost-parameters.test.ts` | ❌ W0 | ⬜ pending |
| 03-03 T3 | 03-03 | 2 | VALID-02, VALID-03 | T-03-12 | tolerances computed from a priced mechanism list, never written as literals | unit (recomputed derivation) | `npm run test -- tests/validation/cost-parameters.test.ts` | ❌ W0 | ⬜ pending |
| 03-04 T1 | 03-04 | 3 | SIM-06 | T-03-13, T-03-14 | duplicate resolved bar throws; search bounded by the validated window | unit (real calendar + hand-built fixtures) | `npm run test -- tests/data/contribution-schedule.test.ts` | ❌ W0 | ⬜ pending |
| 03-04 T2 | 03-04 | 3 | SIM-06, SIM-07, SIM-08 | T-03-15 | unknown symbol and out-of-range window both throw naming the value | unit (real bundle) | `npm run test -- tests/data/kernel-inputs.test.ts` | ❌ W0 | ⬜ pending |
| 03-04 T3 | 03-04 | 3 | SIM-09 | T-03-15, T-03-16 | leverage validated at the CLI boundary; defaults printed with their confidence tag | script (end-to-end, `--json`) | `npm run run-backtest -- --symbol SPX --leverage 2.5 --entry 2015-01-30 --holding-bars 2520 --initial 10000 --contribution 500 --frequency monthly --dividends reinvest --json` | ❌ W0 | ⬜ pending |
| 03-05 T1 | 03-05 | 3 | PERF-02, SIM-10 | T-03-17, T-03-20 | measured subject is the production kernel; no budget row changed | bench (<16ms over ~25,000 real bars) | `npm run bench` | ✓ exists | ⬜ pending |
| 03-05 T2 | 03-05 | 3 | SIM-11 | T-03-18, T-03-19 | collection forced inside the loop; missing flag asserts rather than skips | unit (Node `--expose-gc` heap delta + batch flatness) | `npm run test -- tests/kernel/allocation.test.ts` | ❌ W0 | ⬜ pending |
| 03-06 T1 | 03-06 | 4 | VALID-01 | T-03-23 | degenerate windows, unequal lengths and non-finite values each throw | unit (hand-computed references) | `npm run test -- tests/validation/tracking-error.test.ts` | ❌ W0 | ⬜ pending |
| 03-06 T2 | 03-06 | 4 | VALID-01, VALID-02, VALID-03 | T-03-21, T-03-22, T-03-24, T-03-25 | windows derived at run time and asserted at least 15 years; residual always printed | unit (build-failing gate over the real bundle) | `npm run test -- tests/validation/upro-tqqq-gate.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Wave numbers above are the plan's binding wave assignment as written by `03-0N-PLAN.md`. The
seeded draft expected two waves; the plan set uses four, and this table follows the plan.

Threat refs point at the `<threat_model>` STRIDE register in the plan named in the Plan column.

---

## Wave 0 Requirements

- [ ] `src/kernel/` — the real kernel module plus its test file, carrying the PITFALLS §A
      checklist. `tests/kernel.test.ts` exists today against the throwaway Phase 1 spike kernel
      and is the direct structural template; the ruin and 3-day-gap cases port over.
- [ ] `src/validation/cost-parameters.ts` — the sourced, citation-pinned constants module. Must be
      committed atomically and BEFORE the tracking-error gate test, per D-19. Plan `03-03` is wave 2
      and plan `03-06` is wave 4, which is how the ordering is enforced.
- [ ] `tests/validation/upro-tqqq-gate.test.ts` — the build-failing tracking-error gate. Entirely
      new; loads the Phase 2 bundle through `tools/bundle-compiler/src/binary-format.ts`.
- [ ] `--expose-gc` wiring for the SIM-11 GC-pressure test — a new npm script or a Vitest
      `poolOptions.execArgv` entry. Does not exist yet.
- [ ] `scripts/run-backtest.ts` — the one-shot end-to-end equity-curve script (ROADMAP criterion 4).
- [ ] `bench/kernel.bench.test.ts` — exists, but its `runSpikeBacktest` import must be swapped for
      the real kernel or PERF-02 measures the throwaway.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cost parameters were sourced independently and not tuned after seeing tracking error | VALID-03 / D-19 | D-19 explicitly rejected a CI commit-ordering check as brittle. The property is about author intent over git history, which a test cannot assert. | Confirm the `cost-parameters.ts` commit is an ancestor of the tracking-error gate test commit and that no later commit modifies a cost constant: `git log --follow --oneline -- src/kernel/cost-parameters.ts` and compare against the gate test's first commit. |
| Inception-era UPRO/TQQQ expense ratios verified against a primary SEC filing | SIM-09 / D-17 | The research session could not reach `sec.gov` (HTTP 403 on every fetch), so those figures are `[ASSUMED]`. A human must confirm against EDGAR or the Wayback Machine before they are committed as sourced constants. | Open the 2009 UPRO and 2010 TQQQ prospectuses on EDGAR, record the stated gross expense ratio and the filing accession number into the citation block. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

## Deviations from the seeded draft

- `human_verify_mode` is `end-of-phase` in `.planning/config.json`, so the `checkpoint:human-verify`
  that `03-RESEARCH.md` recommended before the D-19 cost-parameter commit is NOT emitted. Its intent
  is preserved two ways: a blocking `checkpoint:decision` in `03-03` puts the
  commit-at-`ASSUMED`-confidence fork in front of the developer before the one-way commit, and a
  `<verify><human-check>` on the same task carries the EDGAR retrieval instructions into the
  end-of-phase manual batch. Both Manual-Only rows below remain owed.
- `SIM-11`'s `--expose-gc` wiring lands as a `poolOptions` entry on the `unit` project in
  `vitest.config.ts` rather than as a new npm script, so `npm run test` stays the single command.

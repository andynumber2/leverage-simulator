---
phase: 03-simulation-kernel-and-the-upro-tqqq-gate
plan: 03
subsystem: validation
tags: [cost-parameters, sec-edgar, tracking-error-tolerance, no-fitting-protocol, financial-data-sourcing]

# Dependency graph
requires:
  - phase: 03-simulation-kernel-and-the-upro-tqqq-gate (plan 01)
    provides: src/kernel/backtest.ts, src/kernel/backtest.types.ts, src/data/kernel-inputs.ts (the kernel this plan's cost parameters will feed, not touched by this plan)
provides:
  - "COST_PARAMETERS: sourced, citation-pinned UPRO/TQQQ inception-era expense ratios, the generic 3x expense ratio, and the financing-spread range"
  - "TOLERANCE_MECHANISMS, RETURN_DRIFT_TOLERANCE, TRACKING_ERROR_TOLERANCE: D-14's enumerated-mechanism tolerance derivation"
  - "The D-19 git-history evidence: cost parameters committed before any other src/validation/ file exists"
affects: [03-06 (the UPRO/TQQQ gate plan that consumes these constants and tolerances)]

actuals:
  tokens: 9502
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Typed-record-plus-compile-time-exhaustiveness pattern (perf-budgets.ts) reused for COST_PARAMETERS"
    - "Derived constants (FINANCING_SPREAD_DEFAULT, RETURN_DRIFT_TOLERANCE, TRACKING_ERROR_TOLERANCE) computed from their inputs in code, never written as independent literals"

key-files:
  created:
    - src/validation/cost-parameters.ts
    - tests/validation/cost-parameters.test.ts
  modified: []

key-decisions:
  - "Task 1's checkpoint was resolved by the dispatching orchestrator before this plan ran: SEC EDGAR access, which 03-RESEARCH.md's prior session recorded as blocked (HTTP 403 on every sec.gov fetch), was verified reachable this run and real primary-source retrieval was attempted before any ASSUMED tag was used."
  - "Both UPRO and TQQQ inception-era expense ratios were upgraded from 03-RESEARCH.md's ASSUMED tag to CITED, retrieved directly from each fund's own SEC EDGAR launch-prospectus fee table (accessions 0001193125-09-135520 and 0001193125-10-023274), confirming the 0.95% net figure 03-RESEARCH.md's WebSearch synthesis had only guessed at."
  - "Held constant the post-waiver 'Total Net Annual Fund Operating Expenses' fee-table line (0.95% for both funds) rather than the pre-waiver 'Total Annual Fund Operating Expenses' gross line (1.24%/1.31%), because the net figure is what shareholders actually paid and is the apples-to-apples comparison against both funds' current published net figures -- documented as a reading judgment in each CITED entry's citation, not a silent choice."
  - "The financing-spread range stayed ASSUMED after a genuine attempt at five retrieval routes including two full N-CSR annual reports (2010 and 2024) read in full and searched for an itemized spread figure -- neither itemizes one, corroborating PITFALLS A9 at primary-source confidence rather than WebSearch-synthesis confidence."
  - "TOLERANCE_MECHANISMS' inception-era-ER-uncertainty row was priced small (3bp/yr, CITED) rather than at 03-RESEARCH.md's larger, unresolved-risk estimate, because Task 2 actually resolved that uncertainty to a primary citation -- the plan's own instruction to price this row 'from Task 2's actual outcome, not from an assumption about it.'"

patterns-established:
  - "A CostParameter entry's citation text is the audit trail for a confidence tag: CITED entries name the filing accession number and retrieval date; ASSUMED entries name every retrieval route attempted and its HTTP outcome, so an unsourced figure can never read as merely undocumented."

requirements-completed: [SIM-09, VALID-03]

coverage:
  - id: D1
    description: "COST_PARAMETERS module exists with UPRO/TQQQ inception-era expense ratios (CITED to primary SEC filings), generic 3x expense ratio, and financing-spread range (ASSUMED, five routes attempted), each with a citation, source date and confidence tag"
    requirement: SIM-09
    verification:
      - kind: unit
        ref: "tests/validation/cost-parameters.test.ts#COST_PARAMETERS: each constant is pinned to the value its own citation names"
        status: pass
      - kind: unit
        ref: "tests/validation/cost-parameters.test.ts#COST_PARAMETERS: every entry carries a real citation, source date and confidence tag"
        status: pass
      - kind: unit
        ref: "tests/validation/cost-parameters.test.ts#SIM-09: an ASSUMED entry's citation cannot masquerade as merely undocumented"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cost parameters and their pinning test committed in one atomic commit preceding every other file under src/validation/, establishing the D-19/ROADMAP-criterion-2 git-history evidence"
    requirement: VALID-03
    verification:
      - kind: other
        ref: "git log --oneline -- src/validation/cost-parameters.ts (da257a5 constants commit precedes bcecbcb tolerance commit; both are the only two commits touching this file)"
        status: pass
    human_judgment: false
  - id: D3
    description: "RETURN_DRIFT_TOLERANCE and TRACKING_ERROR_TOLERANCE derived from TOLERANCE_MECHANISMS (5 drift-scoped, 4 precision-scoped rows) and a named safety factor, computed rather than measured, before any tracking-error/gate code exists"
    requirement: VALID-03
    verification:
      - kind: unit
        ref: "tests/validation/cost-parameters.test.ts#TOLERANCE_MECHANISMS: D-14's enumerated, priced, cited derivation"
        status: pass
      - kind: unit
        ref: "tests/validation/cost-parameters.test.ts#RETURN_DRIFT_TOLERANCE and TRACKING_ERROR_TOLERANCE: computed, not literal"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-18
status: complete
---

# Phase 3 Plan 3: UPRO/TQQQ Cost Parameter Sourcing and Tolerance Derivation Summary

**Sourced UPRO/TQQQ inception-era expense ratios directly from SEC EDGAR launch prospectuses (CITED, both 0.95% net), left the financing-spread range ASSUMED after genuinely exhausting five retrieval routes, and derived both tracking-error tolerances from nine enumerated un-modelled mechanisms rather than a measured trial run.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-08-18T00:00:00Z (worktree provisioning time not separately tracked)
- **Completed:** 2026-08-18
- **Tasks:** 3 (1 checkpoint, pre-resolved by dispatch; 2 auto)
- **Files modified:** 2 created (src/validation/cost-parameters.ts, tests/validation/cost-parameters.test.ts)

## Accomplishments

- Confirmed SEC EDGAR is reachable in this environment (contrary to 03-RESEARCH.md's prior HTTP-403 finding) and retrieved both funds' actual launch-prospectus fee tables directly:
  - UPRO: Form 485BPOS, filed 2009-06-23 (UPRO's own inception date), SEC EDGAR accession `0001193125-09-135520`. Fee table: 0.75% Investment Advisory Fee + 0.00% 12b-1 + 0.49% Other Expenses = 1.24% gross, less a -0.29% fee waiver = **0.95% net**.
  - TQQQ: Form 485BPOS, filed 2010-02-05, "Prospectus February 9, 2010" (TQQQ's own launch date printed on the cover), accession `0001193125-10-023274`. Fee table: 0.75% + 0.56% Other Expenses = 1.31% gross, less a -0.36% waiver = **0.95% net**.
  - Both figures confirm the 0.95% claim 03-RESEARCH.md's WebSearch synthesis had flagged as unconfirmed, now upgraded to `CITED` with the accession number in the same diff (SIM-09's requirement).
- Attempted to source the financing-spread range from primary N-CSR filings: read two full annual reports directly (2010-08-09, accession `0001104659-10-043192`, 47MB; and 2024-08-08, accession `0001398344-24-014116`, 93MB, spanning the pre- and post-2022-derivatives-rule disclosure eras) and searched both for an itemized swap-financing spread. Neither itemizes one -- both describe financing qualitatively ("pays ... this rate plus a spread" / "financing rates paid or earned") with no number. This corroborates PITFALLS A9's prediction at primary-source confidence, stronger than 03-RESEARCH.md's WebSearch-only corroboration, but the range stays `ASSUMED` because no citable number resulted.
- Committed `COST_PARAMETERS` and its pinning test as one atomic commit (`da257a5`) before any other file under `src/validation/` existed, establishing the D-19/ROADMAP-criterion-2 git-history evidence.
- Derived `RETURN_DRIFT_TOLERANCE` and `TRACKING_ERROR_TOLERANCE` from `TOLERANCE_MECHANISMS` (5 mechanisms scoped to drift, 4 to precision) and a named 1.5x safety factor, committed separately (`bcecbcb`) with no trial tracking error computed beforehand.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm what to do when the inception-era figures cannot be reached from a primary filing** - checkpoint, resolved by the dispatching orchestrator before this plan ran (see Checkpoint Resolution below). No commit of its own.
2. **Task 2: Source the expense ratios and the financing-spread range, then commit the constants and their pinning test as one atomic commit** - `da257a5` (feat)
3. **Task 3: Derive both tracking-error tolerances from enumerated un-modelled mechanisms and commit them before any validation code** - `bcecbcb` (feat)

_No plan-metadata commit yet -- SUMMARY.md commit follows this file's creation, per the worktree isolation protocol._

## Files Created/Modified

- `src/validation/cost-parameters.ts` - `COST_PARAMETERS` (5 sourced constants), derived exports (`UPRO_INCEPTION_ERA_EXPENSE_RATIO`, `TQQQ_INCEPTION_ERA_EXPENSE_RATIO`, `GENERIC_3X_EXPENSE_RATIO`, `FINANCING_SPREAD_RANGE`, `FINANCING_SPREAD_DEFAULT`), `TOLERANCE_MECHANISMS` (9 enumerated mechanisms), `TOLERANCE_SAFETY_FACTOR`, `RETURN_DRIFT_TOLERANCE`, `TRACKING_ERROR_TOLERANCE`, and the full no-fitting protocol (D-14 through D-20) written out in the module header
- `tests/validation/cost-parameters.test.ts` - D-19's pinning test (every constant asserted against its citation's value, citation/date/confidence shape checks, ASSUMED-entry route checks) and D-14's derivation test (mechanism-count assertions, independent recomputation of both tolerances)

## Decisions Made

**Checkpoint Resolution (Task 1):** The dispatching orchestrator resolved this checkpoint before spawning this plan, per the `<resolved_checkpoint>` instruction in the executor's context. Neither option-a (commit at ASSUMED confidence, price the uncertainty) nor option-b (block for human retrieval) was selected as written: the orchestrator had independently probed SEC EDGAR immediately before dispatch and found it reachable, overturning the premise (03-RESEARCH.md's HTTP-403 finding) both options were built on. The instruction was to attempt real primary-source retrieval first for every figure, tag whatever was actually retrieved `CITED`/`VERIFIED` with its accession number, and fall back to `ASSUMED` with a full route-and-status record only for whatever genuinely could not be reached. This plan followed that instruction: two of four figures ended up `CITED` to primary filings; the financing-spread bounds stayed `ASSUMED` after five real attempts, not by default.

**Net vs. gross expense ratio line:** The plan's `<action>` text names the "Total Annual Fund Operating Expenses" line (the pre-waiver gross figure: 1.24% UPRO, 1.31% TQQQ) but the plan's own fallback values (0.0095 for both) match the post-waiver net line instead. Resolved in favor of the net line: it is the figure actually charged to shareholders under each fund's contractual fee waiver, it is what the plan's stated fallback already assumed, and it is the only line that produces a like-for-like comparison against both funds' currently published net figures. Both entries' citations record the gross figure, the waiver, and this reading choice explicitly, so it is a documented judgment call, not a silent substitution.

**Inception-era-ER-uncertainty mechanism pricing:** 03-RESEARCH.md flagged this as potentially the single largest tolerance term, hedging against an unconfirmed WebSearch claim. Since Task 2 resolved that claim to a primary citation, Task 3 priced this mechanism small (3bp/yr) rather than large, per the plan's explicit instruction that this row "must be priced from Task 2's actual outcome, not from an assumption about it."

## Deviations from Plan

None - plan executed exactly as written, including the pre-resolved Task 1 checkpoint. The one interpretive judgment made (net vs. gross expense-ratio line, above) falls within the plan's own stated fallback values and is documented in-line rather than treated as a deviation from an unambiguous instruction.

## Issues Encountered

None. SEC EDGAR fetches (data.sec.gov, www.sec.gov/Archives, www.sec.gov/cgi-bin/browse-edgar) all returned HTTP 200 throughout, at a rate well under the 10 requests/second ceiling.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/validation/cost-parameters.ts` is ready for plan 03-06 (the UPRO/TQQQ gate) to import `COST_PARAMETERS`, `UPRO_INCEPTION_ERA_EXPENSE_RATIO`, `TQQQ_INCEPTION_ERA_EXPENSE_RATIO`, `FINANCING_SPREAD_DEFAULT`, `RETURN_DRIFT_TOLERANCE`, and `TRACKING_ERROR_TOLERANCE`.
- The financing-spread range's `ASSUMED` status is the one open item this plan leaves for the phase's end-of-phase human-verify batch (`workflow.human_verify_mode: end-of-phase`): a human with EDGAR access could still attempt to locate an itemized swap-rate schedule in a comparable Direxion/ProShares filing, but per D-15 any change to `FINANCING_SPREAD_RANGE` must be accompanied by a named, cited mechanism, not a bare number swap.
- No blockers for plan 03-06.

---
*Phase: 03-simulation-kernel-and-the-upro-tqqq-gate*
*Completed: 2026-08-18*

## Self-Check: PASSED

- FOUND: `src/validation/cost-parameters.ts`
- FOUND: `tests/validation/cost-parameters.test.ts`
- FOUND: `.planning/phases/03-simulation-kernel-and-the-upro-tqqq-gate/03-03-SUMMARY.md`
- FOUND commit `da257a5` (Task 2: constants + pinning test, exactly two files)
- FOUND commit `bcecbcb` (Task 3: tolerance derivation, extends the same two files)
- `npm run typecheck` exits 0
- `npm run test` passes (321/321, including the 40 new assertions in `tests/validation/cost-parameters.test.ts`)

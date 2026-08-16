---
phase: quick-260816-qae
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/PROJECT.md
  - .planning/STATE.md
  - .planning/WINDOWS.md
  - .planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md
autonomous: true
requirements: [QUICK-260816-qae]
user_setup: []

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "PROJECT.md's Key Decisions table carries a third row recording the D-20 escalation for PERF-03, citing 807.92ms normalized (80.8% of the 1000ms budget) from GitHub Actions run 31965951474 on the D-17 ubuntu-latest baseline."
    - "That row states the escalation is deliberate under D-20, that no budget is relaxed and no thresholdMs moves, and names what the escalation actually chooses instead of implying the question is settled."
    - "The two pre-existing decision rows (JS-with-Worker-pool, hand-rolled Canvas 2D) lead with D-17 baseline figures; the dev-sandbox figures survive in those rows but are explicitly labelled as the dev sandbox."
    - "No .planning/ document still asserts that no measured figure crosses the D-20 70% escalation trigger this phase."
    - "STATE.md records that NOMINAL_REFERENCE_MS stays at 40 and that this closes the 01-01 re-verify open item."
    - "WINDOWS.md item 1 reads status fixed, with the frontmatter counters, the markdown table row, and the JSON block all agreeing."
    - "bench/calibration.ts, perf-budgets.ts, and every other path outside .planning/ are byte-for-byte unchanged; NOMINAL_REFERENCE_MS is still 40."
  artifacts:
    - .planning/PROJECT.md
    - .planning/STATE.md
    - .planning/WINDOWS.md
    - .planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md
  key_links:
    - "D-20 (01-CONTEXT.md:143) -> PROJECT.md Key Decisions third row -> 01-SPIKE-RESULTS.md section 4 addendum -> STATE.md Decisions bullet"
    - "STATE.md line 80 open item (NOMINAL_REFERENCE_MS must be re-verified, not silently retuned) -> STATE.md resolution bullet -> bench/calibration.ts:108 left at 40"
    - "gsd-tools windows fixed 1 -> WINDOWS.md frontmatter open_count/fixed_count + table row + JSON block, kept mutually consistent by the tool"
---

<objective>
Record the D-20 escalation for PERF-03 against the real D-17 CI baseline, and correct the four
.planning/ documents that still argue from dev-sandbox figures.

Purpose: PERF-03 measured 80.8% of its 1000ms budget on the D-17 baseline machine (GitHub Actions
ubuntu-latest, 4 cores). D-20 says crossing 70% means the phase escalates deliberately and records
the choice as a Key Decision, never relaxing the budget. Right now PROJECT.md, STATE.md and
01-SPIKE-RESULTS.md all say the opposite, because they were written against a 9-core dev sandbox
that measured 32.7%. The project's credibility rests on its own numbers being right about itself.

Output: a third Key Decision row in PROJECT.md, re-evidenced decision rows, a corrected STATE.md,
a dated addendum to the spike report's escalation section, and a closed Broken Window.

This plan is documentation-only. No tracer task is emitted because there is no layered
architecture to thread: there is no code path here, only four prose artifacts that must stop
contradicting a measurement.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/WINDOWS.md
@.planning/phases/01-performance-spike-and-budget-lock/01-CONTEXT.md
@.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md
@CLAUDE.md
@.claude/CLAUDE.md
</context>

<established_figures>
## Every number this plan writes, already measured

Do NOT re-measure, re-derive, or re-run anything. Do not run `npm run bench`. Every figure the
documents gain comes from this block. If a figure you want is not here, you do not have it: say so
in the SUMMARY rather than producing one.

### D-17 baseline runs (GitHub Actions `ubuntu-latest`, repo andynumber2/leverage-simulator, PR #1, branch gsd/phase-01-performance-spike-and-budget-lock)

| Run | hardwareConcurrency | calibrationScore | Implied reference-loop min | PERF-03 normalized | % of 1000ms budget | Crosses D-20 70%? |
|---|---|---|---|---|---|---|
| 31963076671 attempt 2 (pre canonical-score fix) | 4 | 0.9325 | 37.30ms | 700.38ms | 70.0% | yes |
| 31965951474 (post canonical-score fix, HEAD 8eb9551) | 4 | 1.0600 | 42.40ms | 807.92ms | 80.8% | yes |

**Run 31965951474 is the authoritative current figure.** Its other measurements:

- PERF-02: 0.21ms of a 16ms budget
- PERF-05: 0.37ms of a 16ms budget
- PERF-03 raw (un-normalized): 856.40ms; sweep used workerCount=3, chunkCount=12
- Total bench runtime: 12080ms against the 30000ms cap

Attempt 1 of run 31963076671 landed on a **2-core** runner and failed the run outright on the
PERF-03 budget. That is a real property of `ubuntu-latest` allocation, worth recording as a risk,
not as something this plan resolves.

### Local dev-sandbox run (same HEAD, informational only, explicitly NOT the D-17 baseline)

9 logical cores, calibrationScore 0.5725, PERF-02 0.18ms, PERF-03 328.56ms (32.9%), PERF-05 0.11ms
(putImageData) versus 5.92ms (fillRect), 3 bench files / 11 tests, exit 0, one canonical
calibrationScore printed in the environment block with no row-versus-environment disagreement.

### Decision already locked by the user

**NOMINAL_REFERENCE_MS stays at 40.** Rationale to record verbatim in substance:

1. The two consecutive 4-core `ubuntu-latest` runs measured the reference loop at 37.30ms and
   42.40ms, a 14% spread. Retuning the anchor to either single sample would be fitting noise
   rather than re-verifying against the baseline. 40 sits between them.
2. 01-01-PLAN.md's PERF-01a prohibition (line 71) forbids altering the calibration reference loop
   or its scaling in response to a measurement. The only thing motivating a change here is a
   measurement whose effect would be to un-trip an escalation.

This satisfies the "re-verify, do not silently retune" open item carried since 01-01
(STATE.md line 80).

### Facts already on record that the new prose must stay consistent with

- 01-04 measured a throwaway Rust to WASM microbenchmark of the identical branchy recurrence at
  **~1.20x SLOWER than JS** (0.1348ms/call WASM versus 0.1123ms/call JS, batched 5,000 calls). The
  WASM lever named in D-20 is therefore already spent.
- D-14 stands: no charting library was separately benchmarked, on the documented grounds in
  `.claude/CLAUDE.md` section "Q2 - Charting".
- D-19 stands: all eight budgets remain locked at their perception anchors.
</established_figures>

<hard_prohibitions>
1. **No file outside `.planning/` may be created, modified, or deleted.** Not
   `bench/calibration.ts`, not `perf-budgets.ts`, not any test, config, or workflow file.
2. **`NOMINAL_REFERENCE_MS` stays 40.** No `thresholdMs` in `perf-budgets.ts` changes. No
   calibration constant changes.
3. **Do not run `npm run bench` or any benchmark.** Every figure is supplied above.
4. If you conclude a source change is genuinely required, **stop and report it in the SUMMARY
   instead of making it.** An escalation that quietly edits the thing being escalated about is
   exactly the failure mode D-20 and PERF-01a exist to prevent.
5. **Never emit the U+2014 character** in any file you write. Project instruction in
   `~/.claude/CLAUDE.md`: use a comma, colon, parentheses, or two sentences. Pre-existing
   occurrences in these documents are out of scope: do not scrub them, but do not add any.
</hard_prohibitions>

<tasks>

<task type="auto">
  <name>Task 1: Record the D-20 escalation in PROJECT.md and re-evidence the two architecture rows</name>
  <files>.planning/PROJECT.md</files>
  <reversibility rating="reversible">A recorded decision in a markdown table; wrong wording is a follow-up edit, not a migration.</reversibility>
  <action>
Two edits to the Key Decisions table (currently lines 159 to 174).

**Edit A: append a third row** after the hand-rolled-Canvas row. Decision cell names the D-20
escalation for PERF-03. The Rationale cell must carry, using only figures from
`<established_figures>`:

- The measurement: PERF-03 at 807.92ms normalized (856.40ms raw, workerCount=3, chunkCount=12),
  80.8% of the 1000ms budget, on GitHub Actions `ubuntu-latest`, 4 logical cores,
  calibrationScore 1.0600, run 31965951474. Name it as the D-17 baseline, since D-17 makes that
  runner the baseline machine rather than an approximation of one.
- That the prior baseline run 31963076671 attempt 2 measured 700.38ms (70.0%), so the trigger is
  crossed on two consecutive runs and is not a single-sample artifact. Note attempt 1 of that run
  drew a 2-core runner and failed PERF-03 outright, which is a live risk to the gate itself.
- That this is a **deliberate escalation under D-20, not a budget relaxation**: PERF-03's
  threshold stays 1000ms, no `thresholdMs` moves, D-19's lock holds on all eight budgets, and
  `NOMINAL_REFERENCE_MS` stays 40 for the two reasons given in `<established_figures>`.
- What the escalation actually chooses, stated honestly. Of the three levers D-20 names, the WASM
  ratio from D-11 is already spent (01-04 measured Rust ~1.20x slower than JS, so it would make
  PERF-03 worse); pool tuning and a coarser default grid both belong to code that does not exist
  until Phase 7. So the choice recorded here is to accept the measurement, keep the budget locked,
  and carry the headroom question forward as a live constraint on Phase 6's default grid size and
  Phase 7's pool partitioning. Say plainly that at 80.8% with the real kernel, attribution passes,
  and progressive paint still to be layered on top, roughly 19% headroom remains against the 30%
  that D-20's 70% rule was written to reserve. Do not write anything that implies the question is
  settled here.

**Edit B: rewrite the Rationale cells of the two existing rows** (line 173, plain JS with a Worker
pool; line 174, hand-rolled Canvas 2D) so each **leads** with the D-17 baseline figure from run
31965951474 and demotes the dev-sandbox figure to a following clause explicitly labelled as the dev
sandbox (9 logical cores, calibrationScore 0.5725, informational, not the D-17 baseline).

- JS row: lead with PERF-03 807.92ms normalized, 80.8% of the 1000ms budget, 4 cores. State
  explicitly that the JS-over-WASM conclusion **survives the worse baseline number**, because the
  Rust arm measured slower, so escalating to WASM would spend the headroom rather than recover it.
  Keep the existing 1.20x figure, the equivalence-within-1e-9 note, and the SPIKE-RESULTS section 3
  pointer.
- Canvas row: lead with PERF-05 0.37ms of the 16ms budget on the D-17 baseline, then the dev
  sandbox's 0.11ms putImageData versus 5.92ms fillRect labelled as such. Keep the D-14 rationale
  and the SPIKE-RESULTS section 2 pointer.

Neither underlying decision changes. Only the evidence cited changes.

Preserve the three-column table structure (Decision, Rationale, Outcome) and the existing Outcome
cell text on both edited rows.
  </action>
  <verify>
    <automated>cd /workspace/-Users-abarcinski-myrepos-leverage-simulator &amp;&amp; for tok in 31965951474 807.92 "80.8" 1.0600 856.40 31963076671 700.38; do grep -qF "$tok" .planning/PROJECT.md || { echo "MISSING in PROJECT.md: $tok"; exit 1; }; done &amp;&amp; test "$(grep -c '^| ' .planning/PROJECT.md)" -ge 16 &amp;&amp; grep -qF '0.37' .planning/PROJECT.md &amp;&amp; grep -qiE 'dev sandbox' .planning/PROJECT.md &amp;&amp; echo PASS</automated>
    <automated>cd /workspace/-Users-abarcinski-myrepos-leverage-simulator &amp;&amp; C=$(git diff -U0 -- .planning/PROJECT.md | grep '^+' | LC_ALL=C grep -c $'\xe2\x80\x94' || true); test "$C" = "0" &amp;&amp; echo "PASS no new U+2014"</automated>
  </verify>
  <done>PROJECT.md's Key Decisions table has three phase-01 decision rows. The new row cites 807.92ms / 80.8% from run 31965951474, names the escalation deliberate and the budget unrelaxed, and states the chosen response plus the remaining-headroom concern for Phase 6/7. The two prior rows lead with D-17 baseline figures and label their sandbox figures as the dev sandbox. No added line contains U+2014.</done>
</task>

<task type="auto">
  <name>Task 2: Correct every remaining no-escalation claim in STATE.md and the spike report</name>
  <files>.planning/STATE.md, .planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md</files>
  <action>
**STATE.md, three edits.**

1. The `### Decisions` bullet at line 89 (the 01-04 bullet asserting that no measured figure crosses
   the D-20 70% trigger and that no escalation and no third Key Decision row are owed) is now false
   against the D-17 baseline. Replace it with a bullet stating the trigger IS crossed: PERF-03 at
   80.8% of budget on run 31965951474, escalation recorded deliberately as a third Key Decision row
   in PROJECT.md, no budget relaxed. Keep PERF-02 and PERF-05 in the sentence with their D-17
   baseline figures (0.21ms of 16ms and 0.37ms of 16ms) and note they stay well clear of the
   trigger, so the correction is precise rather than blanket.
2. The Phase 1 entry under `### Blockers/Concerns` (lines 101 to 107) repeats the same false claim
   with the dev-sandbox percentages. Correct it the same way: D-19's lock on all eight budgets is
   unaffected and still holds, PERF-02 and PERF-05 clear the trigger, PERF-03 crosses it and has
   been escalated under D-20 rather than relaxed, and any future relaxation still requires a Key
   Decision under PERF-01a.
3. Add a new `### Decisions` bullet resolving the 01-01 open item recorded at line 80
   (NOMINAL_REFERENCE_MS tuned in the sandbox, must be re-verified and not silently retuned):
   record that it stays at 40, with both reasons from `<established_figures>` (the 37.30ms versus
   42.40ms spread across the two baseline runs makes either single sample noise-fitting, and
   01-01-PLAN.md's PERF-01a prohibition forbids retuning the calibration scaling in response to a
   measurement whose only effect would be to un-trip an escalation). State that this closes the
   line-80 open item. Do not delete the line-80 bullet; it is the historical record that the
   question was raised.

**01-SPIKE-RESULTS.md, one addendum.** Section 4 "Escalation evaluation (D-20)" concludes that no
measured figure crosses the trigger and that no third Key Decision row is owed. Its per-run table
rows are honestly labelled dev-sandbox measurements and must be left exactly as they are: do not
rewrite a historical measurement. Instead append a clearly dated addendum subsection immediately
after the section 4 body stating that the section's verdict was reached before the D-17 baseline
existed, that run 31965951474 on the baseline measured PERF-03 at 807.92ms normalized (80.8%),
crossing the trigger, that run 31963076671 attempt 2 measured 700.38ms (70.0%) and also crossed it,
and that the escalation is recorded in PROJECT.md's Key Decisions table. Make the addendum
self-evidently supersede the section's conclusion so a reader who stops at section 4 cannot come
away with the wrong answer.
  </action>
  <verify>
    <automated>cd /workspace/-Users-abarcinski-myrepos-leverage-simulator &amp;&amp; test "$(grep -c 'none crosses the D-20' .planning/STATE.md)" = "0" &amp;&amp; test "$(grep -ci 'No measured figure crosses' .planning/STATE.md)" = "0" &amp;&amp; grep -qF 'NOMINAL_REFERENCE_MS' .planning/STATE.md &amp;&amp; for tok in 807.92 "80.8" 31965951474 "37.30" "42.40"; do grep -qF "$tok" .planning/STATE.md || { echo "MISSING in STATE.md: $tok"; exit 1; }; done &amp;&amp; echo PASS</automated>
    <automated>cd /workspace/-Users-abarcinski-myrepos-leverage-simulator &amp;&amp; F=.planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md &amp;&amp; grep -qF '31965951474' "$F" &amp;&amp; grep -qF '807.92' "$F" &amp;&amp; grep -qF '327.40ms' "$F" &amp;&amp; echo "PASS addendum added, historical row preserved"</automated>
    <automated>cd /workspace/-Users-abarcinski-myrepos-leverage-simulator &amp;&amp; C=$(git diff -U0 -- .planning/STATE.md .planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md | grep '^+' | LC_ALL=C grep -c $'\xe2\x80\x94' || true); test "$C" = "0" &amp;&amp; echo "PASS no new U+2014"</automated>
  </verify>
  <done>No .planning/ document asserts that the D-20 trigger is uncrossed. STATE.md records the PERF-03 escalation, keeps PERF-02 and PERF-05 accurate against the baseline, and carries a new bullet fixing NOMINAL_REFERENCE_MS at 40 with both reasons, closing the line-80 open item. 01-SPIKE-RESULTS.md section 4 keeps its original dev-sandbox rows and gains a dated addendum that supersedes its verdict. No added line contains U+2014.</done>
</task>

<task type="auto">
  <name>Task 3: Close Broken Window 1 through the ledger's own tool</name>
  <files>.planning/WINDOWS.md</files>
  <precondition>The gsd-tools shim is present at $HOME/.claude/gsd-core/bin/gsd-tools.cjs and `node "$HOME/.claude/gsd-core/bin/gsd-tools.cjs" windows status` exits 0; `gsd-tools` is not on PATH on this machine.</precondition>
  <action>
Window id 1 (kind `unrun-verify`, phase `quick-260816-p8z`, file `bench/report.ts`) recorded that
the live end-to-end proof could not be run because Playwright chromium was missing system
libraries. That is resolved: `npm run bench` now runs locally at this HEAD, exit 0, 3 bench files
and 11 tests, one canonical calibrationScore in the environment block with no row-versus-environment
disagreement. That evidence is already in hand (see `<established_figures>`); do not re-run bench to
reproduce it.

Mark it fixed with the ledger's own tool, which keeps the frontmatter counters, the markdown table
row, and the JSON block consistent in one operation:

    node "$HOME/.claude/gsd-core/bin/gsd-tools.cjs" windows fixed 1 --cwd /workspace/-Users-abarcinski-myrepos-leverage-simulator

Do not hand-edit the three representations. If the command fails, report the exact failure in the
SUMMARY and only then fall back to editing all three (frontmatter `open_count` to 0 and
`fixed_count` to 1, `last_updated` bumped, the table row's `status` to `fixed` with `resolved_at`
set, and the matching JSON object updated identically), noting in the SUMMARY that the tool path
was unavailable.
  </action>
  <verify>
    <automated>cd /workspace/-Users-abarcinski-myrepos-leverage-simulator &amp;&amp; S=$(node "$HOME/.claude/gsd-core/bin/gsd-tools.cjs" windows status --cwd /workspace/-Users-abarcinski-myrepos-leverage-simulator) &amp;&amp; echo "$S" | grep -q '"open_count": 0' &amp;&amp; echo "$S" | grep -q '"fixed_count": 1' &amp;&amp; echo "$S" | grep -q '"status": "fixed"' &amp;&amp; grep -q 'open_count: 0' .planning/WINDOWS.md &amp;&amp; grep -q 'fixed_count: 1' .planning/WINDOWS.md &amp;&amp; echo PASS</automated>
  </verify>
  <done>`windows status` reports open_count 0 and fixed_count 1 with entry 1 status fixed, and WINDOWS.md's frontmatter, table row, and JSON block all agree.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none introduced) | This plan writes only markdown under `.planning/`. No input crosses a process, network, or privilege boundary; no runtime code path is created or modified. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-qae-01 | Repudiation | PROJECT.md Key Decisions, 01-SPIKE-RESULTS.md | medium | mitigate | A recorded figure that was never measured destroys the project's evidentiary value, which is its whole purpose. Every number is supplied in `<established_figures>` with its run id and environment; Task 1 and 2 verify gates grep for those exact tokens, and the plan forbids running bench so no unsourced figure can be invented. |
| T-qae-02 | Tampering | bench/calibration.ts, perf-budgets.ts | high | mitigate | An escalation that edits the calibration anchor or a threshold would un-trip its own trigger, defeating D-20 and PERF-01a. `<hard_prohibitions>` forbids it and the phase-level verification gate asserts zero changed paths outside `.planning/` plus `NOMINAL_REFERENCE_MS` still 40. |
| T-qae-03 | Tampering | WINDOWS.md | low | mitigate | Hand-editing three representations of one ledger entry can leave the counters disagreeing with the rows. Task 3 routes the change through `gsd-tools windows fixed` and verifies frontmatter and JSON agreement. |

No package-manager installs occur in this plan, so no `T-qae-SC` supply-chain row is owed and no
package-legitimacy checkpoint applies.
</threat_model>

<verification>
Run from the repository root after all three tasks.

1. **Nothing outside `.planning/` changed:**

       test "$(git status --porcelain | awk '{print $NF}' | grep -vc '^\.planning/')" = "0"

2. **The calibration anchor and every budget threshold are untouched:**

       git diff --quiet HEAD -- bench perf-budgets.ts tests vitest.config.ts tsconfig.json package.json
       grep -q 'const NOMINAL_REFERENCE_MS = 40' bench/calibration.ts

3. **No U+2014 was introduced into any edited document:**

       C=$(git diff -U0 -- .planning/PROJECT.md .planning/STATE.md .planning/WINDOWS.md \
             .planning/phases/01-performance-spike-and-budget-lock/01-SPIKE-RESULTS.md \
           | grep '^+' | LC_ALL=C grep -c $'\xe2\x80\x94' || true); test "$C" = "0"

4. **The escalation is recorded and consistent across documents:** `31965951474`, `807.92` and
   `80.8` each appear in PROJECT.md, STATE.md, and 01-SPIKE-RESULTS.md.

5. **Ledger is clean:** `windows status` reports `open_count` 0.
</verification>

<success_criteria>
- PROJECT.md's Key Decisions table records the D-20 escalation for PERF-03 against run 31965951474
  at 80.8% of budget, as a deliberate escalation with no budget relaxed, naming what it chooses and
  leaving the Phase 6/7 headroom question open rather than declaring it settled.
- The JS-with-Worker-pool and Canvas 2D rows lead with D-17 baseline evidence; their sandbox figures
  remain but are labelled as the dev sandbox. Neither decision itself changes, and the JS row states
  that the conclusion survives the worse number because the Rust arm measured slower.
- STATE.md and 01-SPIKE-RESULTS.md no longer claim the trigger is uncrossed.
- STATE.md records NOMINAL_REFERENCE_MS staying at 40 and closes the 01-01 re-verify open item.
- WINDOWS.md item 1 is fixed, with all three representations consistent.
- Zero files outside `.planning/` modified; `NOMINAL_REFERENCE_MS` still 40; no `thresholdMs` moved.
</success_criteria>

<output>
Create `.planning/quick/260816-qae-record-the-d-20-escalation-for-perf-03-a/260816-qae-SUMMARY.md` when done.

If any hard prohibition would have to be broken to finish, stop and say so in the SUMMARY instead of
breaking it.
</output>

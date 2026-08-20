# Phase 5: Attribution and the Credibility Surface - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-20
**Phase:** 05-attribution-and-the-credibility-surface
**Areas discussed:** Decomposition method, Zero-cost comparison mode, Attribution panel placement, Synthetic-vs-real view, Provenance always on screen, Methodology page, Tier selector and defaults

**Not selected for discussion:** Extended-tier bias figure (CRED-03) was offered and skipped. One question from it was folded into the tier area, since the tier warning cannot render without the figure.

---

## Decomposition method

### How are the three components computed?

| Option | Description | Selected |
|--------|-------------|----------|
| Counterfactual kernel runs | Re-run with a factor off, diff final values. Terminal impact, reconciles by construction. 3-8 extra runs at 0.21ms. Phase 7 caveat: multiplies PERF-03, already at 80.8% | ✓ |
| In-loop accrual sums | Sum the per-bar financingCost/expenseCost the kernel already discards. One pass, METR-06-friendly. But contemporaneous dollars, not terminal impact, so will not reconcile; drag has no accrual to sum | |
| Both, cross-checked | Counterfactuals report, in-loop sums ship as a secondary "cash actually paid" line | |

### Interaction-term allocation

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed ladder: drag, financing, ER | Narrative order, 3 runs. Cost rungs measured against an already-drag-reduced path | |
| Shapley over all orderings | 8 evaluations, order-independent, reconciles exactly. Removes "you picked the flattering order" as an objection. Harder to state in one sentence | ✓ |
| Fixed ladder: ER, financing, drag | Drag absorbs the interaction residual, making drag look larger than an isolated measurement | |

### Naive rung with contributions on

| Option | Description | Selected |
|--------|-------------|----------|
| Per-cash-flow naive | Each contribution grows by 1 + L * (index cumulative return from its own bar). Well-defined for any schedule | ✓ |
| Lump-sum runs only | Panel explains itself away when contributions are non-zero. Conflicts with ATTR-01's "any single run" | |
| Lump-sum equivalent | One clean baseline, but describes a run that is not the run on screen | |

### ATTR-02 percent basis

| Option | Description | Selected |
|--------|-------------|----------|
| Dollars + share of the total gap | Three shares visibly sum to 100%; reconciliation shown, not asserted | ✓ |
| Dollars + annualized %/yr | Comparable across run lengths, but three %/yr figures do not visibly sum | |
| All three | Most complete and most quotable; risks reading as a spreadsheet dump | |

### Rendering a negative (gain) component

| Option | Description | Selected |
|--------|-------------|----------|
| Signed gain, no reframing | "volatility drag: +$X (compounding helped)". Shares may exceed 100% or go negative and the panel says so. Pre-empts the charge that the tool exists to make leverage look bad | ✓ |
| Rename the row by sign | Clearer per-run, but one mechanism gets two names and screenshots stop being comparable | |
| Suppress % share when any component flips sign | Keeps the 100% reading trustworthy where shown, at the cost of losing percent on the most-quoted runs | |

**Notes:** The baseline itself was not put to a vote. ATTR-01 names volatility drag as a component, which only exists as a measurable quantity if the baseline applies leverage to the cumulative return (PITFALLS A1). A daily-compounded zero-cost baseline has no drag term in it.

---

## Zero-cost comparison mode

| Option | Description | Selected |
|--------|-------------|----------|
| Ghost naive curve always drawn | Muted second series on the equity chart, on by default. Every screenshot carries the comparison. Costs a legend and a log-axis edge case when naive goes negative | ✓ |
| Toggle that swaps the result | Cleaner chart, metrics panel can show naive IRR/drawdown. But a comparison you flip between is absent from a screenshot | |
| Numbers only, no second curve | Least visual change, no log-axis edge case; drops the visible divergence of two curves | |

---

## Attribution panel placement

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible under the metrics panel | Permanently in the result column, inside D-20's screenshot region. Costs vertical space Phase 7 also wants | ✓ |
| Expandable disclosure, collapsed | Preserves room for Phase 7; absent from every screenshot | |
| Its own tab beside the equity curve | Full width per surface, pre-builds Phase 7's slot; nothing visible at the same time as anything else | |

---

## Synthetic-vs-real view

### Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Its own section, always reachable | Own canonical parameters, independent of the current run. One permalinkable place to send someone | ✓ |
| Overlay when a counterpart exists | Zero navigation, but narrow parameter slice and collides with the ghost naive curve | |
| Inside the methodology page | One page holds the whole defense, but close to re-weakening the bar VALID-04 exists to raise | |

### Driving parameters

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed canonical config, cost params live | 3x, total-return leg forced, inception window pinned; user's ER and spread flow through so the skeptic can watch the model fail when a cost is mis-set | ✓ |
| Mirror the user's current run | Direct, no separate state; meaningless at 5x and wrong in price-return mode per amended D-10 | |
| Fully static committed figures | Cannot drift; reads as a claim about the model rather than a demonstration | |

### Tracking-error figure

| Option | Description | Selected |
|--------|-------------|----------|
| Live in-browser via computeTrackingError | The third declared caller of P3 D-12's shared function; responds to a cost edit | ✓ |
| Build-time figure asserted against the gate | Fast, provably identical to CI; freezes on committed defaults | |

### Detail level

| Option | Description | Selected |
|--------|-------------|----------|
| Both gates + rate-regime sub-window table | Includes the unflattering post-2022 high-rate rows (+0.94% / +1.12%), already computed | ✓ |
| Headline gates only | Satisfies VALID-04; leaves the known weak spot disclosed only in the repo | |
| Both gates + tolerance-weakness disclosure | Adds that ~3.2-3.5% of tolerance is Yahoo-close premium/discount noise. (Not selected here; folded into the methodology page's limitations instead) | |

---

## Provenance always on screen

### Form

| Option | Description | Selected |
|--------|-------------|----------|
| Strip between parameters and result | Inside the screenshot region, so a pasted image self-discloses. Costs a horizontal band | ✓ |
| Block at the foot of the parameter column | Sits with the inputs it describes; falls outside the screenshot rectangle | |
| Page footer | The position PROJECT.md rules out by name: "Provenance is visible, never a footnote" | |

### Which seams

| Option | Description | Selected |
|--------|-------------|----------|
| Only seams inside the active run window | Disclosure specific to the number on screen; rest one click away | ✓ |
| Seam count, expandable | Constant size, never misleads; a bare count is what readers skip | |
| Every seam inline | Nothing hidden; overflows on the deep-history series where seams matter most | |

### Licence terms

| Option | Description | Selected |
|--------|-------------|----------|
| Source names in strip, licence on methodology page | Readable strip, nothing undisclosed | |
| Licence status inline in the strip | Maximum disclosure at point of use; invites reading terms as a data-quality warning | |
| Source names only, no licence in the app | Cleanest UI; leaves manifest licence fields with no UI consumer | ✓ |

**Notes:** The rot risk was raised before the choice and accepted. Recorded as finding F-05, not as a silent consequence.

### Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Test that fails on hand-authored provenance strings | CRED-01's "generated from manifest provenance" enforced, in the spirit of the SIM-10 assertion | ✓ |
| Types only | Free; nothing stops a later edit appending prose that goes stale | |

---

## Methodology page

### Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Full-screen overlay on a URL param | No router dependency, run survives the trip, already precached. Adds one param to a one-way contract | ✓ |
| Hand-rolled hash route | Real back button, no dependency; a second routing mechanism alongside a query-param state contract | |
| Separate static page in the Vite build | Independently linkable and indexable; loses or must round-trip the current run, needs its own theme and precache entry | |

### Generated vs written

| Option | Description | Selected |
|--------|-------------|----------|
| Generated wherever a structured source exists | cost-parameters.ts, kernel constants, manifest, TOLERANCE_MECHANISMS. Cannot go stale. Costs a rendering layer over four registries | ✓ |
| Hand-authored with a numbers-match test | Reads better; the test has to parse prose to find numbers | |
| Hand-authored, unchecked | Fastest; PITFALLS G1's failure mode waiting to happen | |

### Known limitations (multi-select, all four chosen)

| Option | Description | Selected |
|--------|-------------|----------|
| Extended-tier bias and its direction | Required by CRED-02 regardless | ✓ |
| Financing spread is ASSUMED, not cited | The most load-bearing cost parameter has the weakest sourcing; corroborates PITFALLS A9 | ✓ |
| Gate tolerance is weaker than its number | ~3.2-3.5% of the 3.955% tolerance is Yahoo-close noise; TQQQ's margin is a thin ~11% | ✓ |
| High-rate drift hints under-priced financing | Post-2022 drift +0.94% / +1.12%, and why VALID-03 forbade acting on it | ✓ |

---

## Tier selector and defaults

### Extended-tier gate

| Option | Description | Selected |
|--------|-------------|----------|
| No gate; persistent warning on every extended result | Warning inside the screenshot region; nothing hidden behind a ceremony people click past | ✓ |
| One-time acknowledgment, then persistent warning | Guarantees the driver saw it once; acknowledgment is not in the URL, and link recipients are who the tool is for | |
| No gate, warning in the provenance strip only | Most compact; a line in a dense strip is the opposite of CRED-02's "prominent" | |

### Which parameters are labelled as defaults

| Option | Description | Selected |
|--------|-------------|----------|
| Every parameter with a shipped default | Including leverage and entry date; a default entry date is a bigger claim than a default expense ratio | ✓ |
| Only parameters with a sourced value | Extends the existing D-18 pattern; leaves the most cherry-pickable parameter unlabelled | |
| Every parameter plus a global reset | Makes "show me your baseline" one click; can destroy a run in progress | |

### Landing state (closes Phase 4's F-04)

| Option | Description | Selected |
|--------|-------------|----------|
| A neutral default run, labelled as a default | Something real on first contact, visibly a starting point. Entry date needs a defensible rule, not a picked date | ✓ |
| No run until the user sets an entry date | Cannot be accused of choosing a window; meets every link arrival with an empty form | |
| A deliberately unflattering default window | Strong credibility signal; a cherry-pick in the other direction, and naming scenarios is Phase 8 | |

### CRED-03 magnitude (folded in from the skipped area)

| Option | Description | Selected |
|--------|-------------|----------|
| Build-time, committed and tested | Stable, citable, free at runtime; CI catches it moving. Era and symbol become a stated methodology choice | ✓ |
| Live in-app for the current symbol and window | Stronger disclosure; a second full simulation path on every parameter change against a 16ms budget Shapley already draws on | |
| Build-time per symbol, rendered for the active one | More specific and still free; larger generated artifact (deferred, not declined) | |

---

## Claude's Discretion

- Solid component decomposition and how the three new surfaces factor against existing `ResultColumn` components.
- The exact query-param name and value format for the methodology overlay.
- Which known-good daily era and symbol the CRED-03 downsample test uses, and matching the interpolation method the bundle compiler actually applies.
- Ghost-curve visual treatment (dash, opacity, legend copy).
- Whether the validation section is separately permalinkable (recommended, not decided).
- Numeric formatting of signed components, reusing `src/metrics/format.ts`.

## Deferred Ideas

- A global "reset everything to defaults" control — revisit with Phase 8's SHARE-06 preset picker.
- A per-symbol table of CRED-03 bias magnitudes instead of one representative figure.
- Surfacing the Yahoo/Nasdaq accepted-licence-risk positions in the app — raised and declined.
- Keeping the last N data bundles addressable so old permalinks reproduce faithfully — carried from Phase 4, Phase 8 candidate.
- The overlapping-windows caveat (VIZ-10) — Phase 6/7, a statement about the heatmap's sample rather than a single run's assumptions.

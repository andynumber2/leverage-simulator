# Phase 4: First Defensible Backtest in the Browser - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md; this log preserves the alternatives considered.

**Date:** 2026-08-19
**Phase:** 4-first-defensible-backtest-in-the-browser
**Areas discussed:** Compute placement, Metrics & ruin, Invalid params + tier, Permalink contract,
Visual treatment

Gray areas were presented as four options with multiSelect; the user selected all four. A fifth
area (Visual treatment) was opened at the user's request at the end-of-discussion gate.

---

## Compute placement

### Q1: Where does a single backtest run in the browser?

| Option | Description | Selected |
|--------|-------------|----------|
| Main thread | 0.21ms measured per run vs 16ms frame budget; D-30 already fixes the kernel signature so Phase 7 needs no rework | Yes |
| Worker from day one | Same Comlink boundary Phase 7 will use; settles PERF-07 once, costs a round-trip per change | |
| Split: load in worker, run on main | Fetch/decode/precompute off-main, runs stay on main | |

**Notes:** The user also reminded Claude to stay in ADHD output mode; no bearing on the decision.

### Q2: How does the browser get the bundle, given loadBundleFromDisk is Node-fs only?

| Option | Description | Selected |
|--------|-------------|----------|
| One core, two byte sources | buildKernelInputs is already pure over LoadedBundle; extract the byte source | Yes |
| Separate browser loader module | Shares decodeHeader/calendarView, duplicates the assembly loop | |
| Fetch everywhere, drop the fs path | One path, but tests and scripts then need a running server | |

### Q3: What triggers a re-run while dragging the leverage slider?

| Option | Description | Selected |
|--------|-------------|----------|
| rAF-coalesced | One run and one repaint per animation frame, which is what PERF-07b measures | Yes |
| Run on every input event | Simplest; pointer input outpaces frames on high-Hz devices | |
| Run on release only | Cheapest; makes the leverage slider unscrubbable | |

### Q4: DATA-08 requires full offline after first load. How?

| Option | Description | Selected |
|--------|-------------|----------|
| PWA precache everything | vite-plugin-pwa generateSW over shell + 14 hashed .bin + manifest, cap raised past 2MB | Yes |
| PWA shell + runtime-cache data | Lighter install; weakens "offline after first load" to "offline for what you opened" | |
| Hand-rolled service worker | No plugin dependency, more lifecycle code to own | |

---

## Metrics & ruin

### Q1: What does the result panel show when contributions are zero?

| Option | Description | Selected |
|--------|-------------|----------|
| IRR always headline | Stable headline slot; note that IRR equals CAGR with no contributions; CAGR always secondary | Yes |
| Swap the headline by schedule | CAGR headline at zero contributions, IRR otherwise; headline changes identity | |
| Both always, CAGR struck through | Most explicit; a struck-through number is still quotable | |

### Q2: METR-04 denominator when ruin drops scheduled contributions

| Option | Description | Selected |
|--------|-------------|----------|
| Money actually invested | Kernel totalContributed; droppedContributionsTotal shown as its own line | Yes |
| Full scheduled commitment | Answers "what did the plan return"; buries the dropped amount in a ratio | |
| Both multiples shown | Nothing hidden; two similar numbers invite misquotation | |

### Q3: How does ruin read as a category rather than a bad number?

| Option | Description | Selected |
|--------|-------------|----------|
| State change, metrics kept | Panel switches to a ruin state with a dated banner; chart terminator at the ruin bar | Yes |
| Badge beside normal metrics | Least code; the exact reading D-22 exists to prevent | |
| Replace metrics entirely | Strongest signal; hides figures a skeptic wants | |

### Q4: How is IRR solved so NaN never reaches the screen?

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded bisection, explicit undefined | D-21 guarantees a single sign change, so the root is unique; prints "undefined" rather than a number | Yes |
| Newton with bisection fallback | Faster convergence; extra path where speed is not the constraint | |
| Guard the sign pattern first | Same outcome; states the precondition as a check | |

---

## Invalid params + tier

### Q1: Criterion 3 references a tier, but APP-02 is Phase 5. What does Phase 4 do?

| Option | Description | Selected |
|--------|-------------|----------|
| Strict only, tier in URL | Extended tier's bias warning is a Phase 5 requirement; shipping the range first would be undisclosed | Yes |
| Bare toggle now, copy in Phase 5 | Full 1928 range immediately, undisclosed | |
| Extended range, tier concept in Phase 5 | No tier param, so Phase 5 breaks every Phase 4 link | |

### Q2: Prevent invalid combinations at the input, or accept and explain?

| Option | Description | Selected |
|--------|-------------|----------|
| Constrain what's knowable, explain the rest | Single-field bounds enforced by the control; cross-field impossibilities explained by name | Yes |
| Accept anything, explain everything | Uniform; requires error copy for unreachable states | |
| Prevent everything | No error copy; is the silent coercion criterion 3 and D-32 prohibit | |

### Q3: What does the result area show while parameters are invalid?

| Option | Description | Selected |
|--------|-------------|----------|
| Clear the result | No number on screen that contradicts the visible controls; matters because output is screenshotted | Yes |
| Keep last valid, marked stale | Preserves context; a screenshot shows mismatched numbers | |
| Keep last valid, unmarked | Smoothest and silently misleading | |

### Q4: The dividend toggle shifts NDX's valid range by 14 years. How is that handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Recompute bounds, explain the eviction | Message names the cause; nothing moves on its own | Yes |
| Snap the date to the new range | Never errors; silent coercion of a permalinked parameter | |
| Disable the toggle when it would evict | Prevents the error; hides an option behind a hidden rule | |

---

## Permalink contract

### Q1: Are defaults omitted from the URL?

| Option | Description | Selected |
|--------|-------------|----------|
| Emit every parameter always | ~200 chars, fully self-describing; a future default change cannot rewrite old links | Yes |
| Omit defaults | Shorter URLs; every default change silently reinterprets old links | |
| Omit defaults, pin a schema version | Compact and reproducible; requires carrying historical default sets forever | |

### Q2: What does the URL encode for hold-to-today?

| Option | Description | Selected |
|--------|-------------|----------|
| Mode plus resolved end date | Frozen faithful replay by default, plus a one-click "run to today" | Yes |
| Freeze the resolved end date only | Always reproduces; the open-ended intent is lost | |
| Encode the mode only | Preserves intent; breaks criterion 4 | |

### Q3: What happens on a bundle-version mismatch?

| Option | Description | Selected |
|--------|-------------|----------|
| Run on current data, banner the change | SHARE-02's "states clearly that the data has changed" branch; the only one reachable today | Yes |
| Keep old bundles addressable | The stronger half of SHARE-02; real build and deploy work | |
| Block until the user opts in | Impossible to miss; a click-through wall on every stale link | |

### Q4: What does the SHARE-03 determinism test assert?

| Option | Description | Selected |
|--------|-------------|----------|
| Round-trip property + golden runs | Property catches encoder gaps, fixtures catch numeric drift | Yes |
| Round-trip only | Says nothing about whether the same params still produce the same numbers | |
| Golden URLs only | Catches drift; a dropped param passes when its default matches | |

---

## Visual treatment

Opened at the user's request: "the only thing that really concerns me here is that we haven't
really discussed how this is gonna look visually."

### Q1: Overall layout of the single-run screen

| Option | Description | Selected |
|--------|-------------|----------|
| Controls left, result right | Parameters stay visible beside the numbers they produced; ASCII mockup previewed and selected | Yes |
| Controls on top, result below | Maximum chart width; pushes cost and contribution fields to a second row | |
| Single scrolling column | One code path; parameters scroll out of view above the chart | |

### Q2: Visual voice

| Option | Description | Selected |
|--------|-------------|----------|
| Technical instrument panel | Dense, monospace numerics, inline parameter-source annotations per PITFALLS G3 | Yes |
| Editorial explainer | Friendlier to a cold arrival; risks reading as marketing for a conclusion | |
| Terminal / receipts | Maximum receipts signal; no room for the chart | |

### Q3: Chart scale default and theme

| Option | Description | Selected |
|--------|-------------|----------|
| Log default, follow system theme | PITFALLS E6; ruin terminator since log cannot plot zero; uPlot repaints on theme change | Yes |
| Log default, dark only | One palette; narrows VIZ-11's stated requirement | |
| Linear default, log toggle | Expected by most; E6 says the screenshotted default is the one that must not be linear | |

### Q4: Does Phase 4 design for the screenshot?

| Option | Description | Selected |
|--------|-------------|----------|
| Design the region, no export yet | One rectangle holds params, metrics, symbol, dates and bundle version; SHARE-04 is Phase 8 | Yes |
| Don't design for it yet | Avoids constraining layout; risks a Phase 8 export-only rendering path | |
| Build a share card now | Best paste quality; a second rendering to keep in sync, plus Phase 8 scope | |

### Q5: Does Phase 4's layout reserve a place for the heatmap?

Prompted by the user describing the intended visualization as a **porkchop plot**: entry date on
one axis, leverage on the other, outcome as the third variable. Claude confirmed the astrodynamics
reference and flagged that a porkchop plot is a contour rendering over a continuous field, whereas
every prior decision assumes a discrete 200x50 cell grid painted with putImageData. Recorded as an
input to Phase 6 rather than acted on here.

| Option | Description | Selected |
|--------|-------------|----------|
| Reserve the slot now | Result column holds either chart; parameter column serves both | Yes |
| Two separate views | Each view fits exactly; parameter controls built twice or lifted later | |
| Don't plan for it yet | Least speculation; highest chance Phase 4's layout is reworked | |

---

## Claude's Discretion

- Component decomposition inside the Solid app, state container shape, CSS approach.
- Exact query-param names and value formats, within D-13's constraint.
- IRR bisection tolerance and iteration cap, within D-08's bracket.
- Where max drawdown is computed, within the constraint that there is one implementation.

## Deferred Ideas

- Keeping the last N data bundles deployed and addressable, so old permalinks reproduce
  faithfully (the stronger half of SHARE-02). Candidate for Phase 8.
- Tier selector with each tier's meaning on screen (APP-02) and the extended-tier bias warning
  with its quantified magnitude (CRED-02): Phase 5 by roadmap.
- Restarting a fresh position after ruin: out of scope, per Phase 3's D-21.
- PNG export, CSV export, preset scenarios (SHARE-04/05/06): Phase 8.
- The porkchop contour treatment versus a discrete cell grid: an explicit Phase 6 question.

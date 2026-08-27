# Phase 8: Export and the Canonical Arguments - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md; this log preserves the alternatives considered.

**Date:** 2026-08-25
**Phase:** 8-export-and-the-canonical-arguments
**Areas discussed:** What the PNG contains, CSV columns and the recompute proof, The preset set itself, Preset plumbing and export affordances

---

## What the PNG contains

### Capture target

| Option | Description | Selected |
|--------|-------------|----------|
| The whole screenshot region | Rasterize the `.screenshot-region` DOM subtree. Needs DOM-to-image, not `canvas.toBlob()` | Y |
| Chart canvas only | `canvas.toBlob()`, zero dependency, but drops every receipt from the image | |
| Hand-composed export canvas | Redraw metrics as canvas text. No dependency, but a second rendering to keep in sync | |

**User's choice:** The whole screenshot region.

### Theme treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Current theme, opaque + framed | WYSIWYG plus an opaque background and visible edge so it reads as a card on any host page | Y |
| Always export light | One canonical picture, but breaks WYSIWYG for dark-theme users | |
| Offer both | Most flexible, but a second control and a second capture path inside the budget | |

**User's choice:** Current theme, opaque and framed.

### Output size

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed export width at 2x | ~1100-1200 CSS px regardless of viewport. Two people get the same picture | Y |
| Whatever is on screen | Simplest, but a phone export and a monitor export look nothing alike | |
| Clamp to a legible band | Pays the re-layout cost without buying comparability | |

**User's choice:** Fixed export width at 2x.

### Rasterizer

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled, escalate on a miss | Matches the project's hand-rolled pattern; style/font inlining is the real work | |
| Add html-to-image | ~5KB, already survived the foreignObject quirks. Bans in static-build.test.ts must be lifted | Y |
| Measure both first, then lock | Defers the choice into research | |

**User's choice:** Add html-to-image.
**Notes:** Claude flagged that `.claude/CLAUDE.md`'s claim that `canvas.toBlob()` is sufficient predates the screenshot region and is now wrong for the artifact being captured. Recorded as a correction in CONTEXT.md D-01.

---

## CSV columns and the recompute proof

### Column set

| Option | Description | Selected |
|--------|-------------|----------|
| Full recompute inputs + value | Date, index return, short rate, day counts, contribution flag, long-gap flag, value. All caller-side, kernel untouched | Y |
| Inputs, value, and per-bar cost split | Removes the recompute work, but those numbers exist nowhere and need either a parallel implementation or a kernel change | |
| Date and value only | Smallest file, proves nothing | |

**User's choice:** Full recompute inputs plus value.

### Parameters and provenance

| Option | Description | Selected |
|--------|-------------|----------|
| Commented preamble above the header row | Every parameter, bundle version, tier, date range, sources and the permalink. Excel/Sheets import `#` lines as data | Y |
| Constant columns repeated per row | Survives every importer, but inflates the file and looks awful | |
| Clean CSV, parameters in the filename | Imports perfectly, but filenames get renamed and cannot carry citations | |

**User's choice:** Commented preamble.

### Sweep-mode behaviour

| Option | Description | Selected |
|--------|-------------|----------|
| Single-run only | SHARE-05 says "a run's" daily series. Sweep users drill down via Phase 7 D-22 | Y |
| Also export the grid | Nearly free, but no requirement asks for it | |
| Export the crosshair cell's daily series | One path, but exports a run whose receipts are not on screen | |

**User's choice:** Single-run only.

### The 50ms budget

| Option | Description | Selected |
|--------|-------------|----------|
| CSV in a worker, PNG measured and escalated | Structural compliance for CSV; PNG cannot leave the main thread, so measure and escalate under PERF-01a | Y |
| Both on the main thread, chunked | One code path, but a chunk constant to tune per path | |
| Measure both first, then decide | No mechanism named up front for either path | |

**User's choice:** CSV in a worker, PNG measured and escalated.

---

## The preset set itself

### The TQQQ-from-2000 data gap

| Option | Description | Selected |
|--------|-------------|----------|
| NDX at 3x from March 2000, labelled synthetic | TQQQ data starts 2010-02-11; NDX total-return starts 1999-03-04 | Y |
| Real TQQQ from its 2010 inception | Real history, wrong argument: misses the dot-com drawdown entirely | |
| Both, as two presets | Honest contrast, one more preset | |

**User's choice:** Synthetic 3x NDX, labelled as such.

### The high-rate financing window

| Option | Description | Selected |
|--------|-------------|----------|
| 1979-1982, extended tier, caveat shown | Rate peaked near 20% in 1981. SPX total-return is strict only from 1988-01-05 | Y |
| 2022 onward, strict tier, no caveat | Cleaner, but a much milder effect | |
| Both windows | Shows the effect scales with the rate, but two differently-caveated presets of one idea | |

**User's choice:** 1979-1982, caveat shown.

### Result mode per preset

| Option | Description | Selected |
|--------|-------------|----------|
| Per preset, carried in the link | `mode` is already a permalink key (Phase 7 D-04), so this is free | Y |
| Always single run | Uniform, but no preset ever shows the sensitivity field | |
| Always sweep | Pre-answers "you cherry-picked the date", but ~800ms per click | |

**User's choice:** Per preset.

### Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Labelled with the outcome, unflattering first | Ordering is the argument; no headings | Y |
| Explicit fails/wins groupings | Countable balance, but states conclusions before the user runs anything | |
| Neutral labels, chronological | Instrument-like, but the balance becomes invisible | |

**User's choice:** Outcome-labelled, unflattering first.

### Set size

| Option | Description | Selected |
|--------|-------------|----------|
| Four to five | One per canonical argument, scannable without a scroll | |
| Three, the roadmap minimum | Smallest surface, no real-fund preset | |
| Eight or more, a fuller library | Covers far more arguments; needs a scroll or a disclosure | Y |

**User's choice:** Eight or more.

### Where the list lives

| Option | Description | Selected |
|--------|-------------|----------|
| Always-visible rail in the parameter column | One click from every state, costs real vertical space | |
| Landing-state panel | Room to present the set, but disappears after first interaction | |
| Scenarios overlay behind one button | Scales to any number, costs almost no layout. Two clicks, a literal criterion-3 miss | Y |

**User's choice:** Scenarios overlay.
**Notes:** Claude flagged the two-click miss against criterion 3 in the option description; the user chose it knowingly, then closed the gap in the next question.

### Closing the one-click gap

| Option | Description | Selected |
|--------|-------------|----------|
| Featured row inline, full library in the overlay | Headline presets genuinely one click; library still exists | Y |
| Overlay only, amend the criterion | Records a miss on a requirement nothing forced | |
| Overlay only, opens on landing | An interstitial in front of a permalink-first tool | |

**User's choice:** Featured row plus overlay.

### Outcome figures in the overlay

| Option | Description | Selected |
|--------|-------------|----------|
| Live at open | Nine real backtests on overlay open | |
| Hardcoded in the definition | Zero compute, drifts on the next bundle refresh | |
| Names only | Reader guesses then clicks; balance not verifiable without nine clicks | |
| **Build-time generated + CI-pinned (user's proposal)** | `scripts/compute-presets.ts` emits `src/app/presets.generated.ts`; pinning test fails CI on drift | Y |

**User's choice:** Build-time generation, following the `extended-tier-bias.generated.ts` precedent.
**Notes:** The user asked for a text mockup of the overlay before answering, then rejected all three options offered in favour of computing at build time: "the only time this would change is if the bundle changes, and the results shouldn't ever change on a same-version of the app". Claude verified an exact existing precedent in the repo (`scripts/measure-extended-tier-bias.ts` -> `src/validation/extended-tier-bias.generated.ts`, pinned by `tests/validation/extended-tier-bias.test.ts`) and confirmed the proposal is strictly better than either option offered.

### Contribution schedule

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, one DCA preset | Most common real-world case; exercises IRR and the over-budget `solveIrr` branch | Y |
| No, lump sum only | Uniform and comparable, but never demonstrates the contribution feature | |
| Two or more DCA presets | Best comparison, doubles the set, more of the slow branch | |

**User's choice:** One DCA preset.

### The featured four

| Option | Description | Selected |
|--------|-------------|----------|
| 3 bad windows + the flattering one (1929, 2000, 1981, 2010s) | Criterion 3's own list verbatim | |
| One per mechanism | Same windows, labelled by mechanism | |
| Two bad, one good, one DCA | Puts DCA in the one-click row | |
| **Real TQQQ COVID, real UPRO COVID, real UPRO since inception, 3x SPX from March 2000 (user's set)** | Two real-fund crash presets, one real-fund flattering preset, one synthetic historical window | Y |

**User's choice:** The user's own set.
**Notes:** Stated rationale: "I would add something in the covid era... I think that's more important than featuring 1929, 1929 is interesting but not worth inline. The people using this are mostly going to talk about whether UPRO or TQQQ are good investments and how 'safe' they are." The user also asked that promoting and demoting presets stay simple, and raised in-tool preset authoring as a possible nice-to-have. Claude confirmed the set is buildable against the manifest, and surfaced two consequences: real-fund presets must set expense ratio to 0 as well as leverage to 1 (the kernel's expense term is not leverage-scaled, so the fund's own fee would be charged twice), and all four windows criterion 3 names by name are now behind the Scenarios button.

---

## Preset plumbing and export affordances

### Permalink staleness

| Option | Description | Selected |
|--------|-------------|----------|
| Parameters in the definition, URL built at runtime | `bundleVersion` filled from the live manifest, so a preset cannot go stale | Y |
| Full URLs generated at build time | A preset is literally a link, but two representations to keep in sync | |
| Hardcoded URLs, checked by a test | The test reports the break, it does not fix it | |

**User's choice:** Parameters, URL at runtime.

### Button placement

| Option | Description | Selected |
|--------|-------------|----------|
| Export row in the result column, outside the region | No chrome can leak into the image, no filter pass needed | Y |
| Inside the region, stripped at capture | Most discoverable, but its failure mode is invisible until someone pastes the image | |
| In the parameter column with Copy link | No result-column change, but the actions sit far from the result | |

**User's choice:** Export row outside the region.

### Copy link relocation

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, move it | Three share actions in one place; relocates a shipped Phase 4 control | Y |
| No, leave it | No churn, but the actions sit in two places for no visible reason | |
| Mirror it in both | No relocation, but two identical controls | |

**User's choice:** Move it.

### Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| PNG to clipboard with download fallback, CSV as download | Removes the save-then-attach round trip for the common case | Y |
| Both as downloads | One code path, friction on the most common action | |
| Both offer both destinations | Four controls, and CSV-on-clipboard is mostly noise | |

**User's choice:** PNG to clipboard, CSV downloads.

---

## Claude's Discretion

- Exact export width within the 1100-1200px band, and the frame or margin treatment.
- Filename conventions for both exports.
- CSV column order, header naming, number formatting and date format, subject to the no-rounding-before-render rule.
- The full library list beyond the featured four and the named entries, including exact entry dates and holding periods.
- Whether the crosshair overlay and hover readout appear in a sweep-mode PNG capture.
- Export button labelling and disabled-state behaviour during load, mid-sweep, or on an invalid run.

## Deferred Ideas

- A sweep-mode grid CSV (one row per cell, every METR-06 metric).
- In-tool preset authoring, promotion and demotion by the user.
- Per-bar cost decomposition columns in the CSV.
- A DCA counterpart for every flagship window.
- Keeping the last N data bundles deployed and addressable.
- A global "reset everything to defaults" control (deferred from Phase 5 D-22 to this phase, still not in scope).

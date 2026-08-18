# Phase 3: Simulation Kernel and the UPRO/TQQQ Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-18
**Phase:** 03-simulation-kernel-and-the-upro-tqqq-gate
**Areas discussed:** Day-count conventions, What 1x means, Tracking-error gate, No-fitting enforcement, Ruin semantics, Contribution calendar, Data-edge policy and kernel boundary

---

## Area selection

All seven offered gray areas were selected. Nothing was left to planner discretion at the
selection stage.

---

## Day-count conventions

Opened by presenting three conflicting statements found in the repo: PROJECT.md (financing /360,
ER /365), PITFALLS A1/A4 (flat /252 for both), and the Phase 1 spike kernel (calendar /365
financing, flat /252 ER). Two supporting facts were measured from the compiled calendar first:
zero Saturday sessions exist in the bundle, and only two gaps in 98 years exceed 5 calendar days.

### Financing annualization basis

| Option | Description | Selected |
|--------|-------------|----------|
| actual/360 calendar | USD money-market convention, what PROJECT.md states; differs from /365 by 1.39%, ~15bp/yr at 3x in a 5% regime | ✓ |
| actual/365 calendar | What the Phase 1 spike used; slightly understates real financing | |
| flat /252 per bar | What PITFALLS A1/A4 suggest; ignores calendar elapse, the pitfall A8 names | |

**User's choice:** actual/360 calendar.

### Expense ratio accrual basis

| Option | Description | Selected |
|--------|-------------|----------|
| actual/365 calendar | How prospectuses accrue internally per PITFALLS A4; totals to exactly ER/yr regardless of bar count | ✓ |
| flat /252 per bar | Phase 1 spike's approach; drifts with the 249-252 bars/yr variation | |
| Same basis as financing | Simpler to document, but PITFALLS A8 argues against conflating the two | |

**User's choice:** actual/365 calendar.

### Entry bar cost treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Cost-free anchor | Bar 0 sets value, no return, no cost; costs start bar 1 | ✓ |
| Charge one day | Overstates cost on every run | |

**User's choice:** Cost-free anchor.

### Long closures (1933 bank holiday, 9/11)

| Option | Description | Selected |
|--------|-------------|----------|
| Full accrual, no cap | Interest runs whether or not the exchange is open | |
| Full accrual + flag | Same math, plus exposure of outsized-gap bars for Phase 5 labelling | ✓ |
| Cap at a maximum gap | Understates real cost | |

**User's choice:** Full accrual + flag, after asking a follow-up.

**Notes:** The user did not accept the recommendation directly. They said they wanted option 1 but
asked "is that what actually happened?" The investigation that followed established: 9/11 accrual
is unambiguous (banks and Fedwire operated; the bundle carries observed DFF at 2.13%), while the
1933 case rests on an interpolated NBER monthly rate (0.938% at the 1933-03-15 bar, manifest seam
`degradesToNonDaily: true`) over the most dislocated fortnight in the series. That finding
upgraded the recommendation from option 1 to option 2, and produced findings F-03 and F-04 in
CONTEXT.md. It is also concrete evidence for Phase 2's D-17.

---

## What 1x means

Opened by establishing that bit-for-bit reproduction is not achievable over 24,773 bars, so
SIM-04's "exactly" needs a number.

### Cost model gate at 1x

| Option | Description | Selected |
|--------|-------------|----------|
| No special case in kernel | Financing zeroes via (L-1); ER is caller's; invariant test passes ER=0 | ✓ |
| Gate on leverage === 1 | Brittle magic constant, creates a discontinuity at 1.0001x | |
| ER scales with (L-1) | Economically wrong; funds charge ER on NAV | |

**User's choice:** No special case in kernel.

### SIM-04 exactness tolerance

| Option | Description | Selected |
|--------|-------------|----------|
| 1e-12 relative | Originally offered as the recommendation | |
| 1e-9 relative | ~200x above the float floor, ~800x below the smallest real bug | ✓ |
| 1e-10 relative | Tighter, still above the floor | |

**User's choice:** 1e-9 relative, after asking what SIM-04 is and whether the tolerance is an
error bar for floating point.

**Notes:** The user did not know what SIM-04 referred to and asked directly. Answering it surfaced
an error in the original option set: 1e-12 sits *below* the ~5e-12 float64 accumulation floor and
would risk false failures. The question was re-asked with corrected options. The distinction that
resolved it: the float floor is ~5e-12 while the smallest possible real bug (one day of a 0.03%
fee) is ~8e-7, a gap of roughly 160,000x, so any threshold in that dead zone works.

### 1x semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Bare index, ER default 0 | PITFALLS A10's reading of PROJECT.md | ✓ |
| Index fund, ER ~0.03% | Fairer comparison but breaks the SIM-04 invariant | |

**User's choice:** Bare index, ER default 0.

### Sub-1x negative financing

| Option | Description | Selected |
|--------|-------------|----------|
| Intended: interest earned on cash | Falls out of the formula, economically correct | ✓ |
| Clamp to zero below 1x | Models cash in a mattress | |
| Reject sub-1x | Removes a free capability | |

**User's choice:** Intended, plus an explicit test. The user asked what the financing rate
actually is and where the short rate comes from.

**Notes:** Answering that question produced the rate-provenance table now in CONTEXT.md (NBER
monthly interpolated pre-1934, TB3MS 1934-1954 interpolated, DTB3 1954, DFF 1954-present) and
surfaced finding F-02: the bundle stores percent-annualized values, not fractions, and the Phase 1
spike kernel does not convert. That led to an additional question.

### Rate unit conversion

| Option | Description | Selected |
|--------|-------------|----------|
| Kernel takes fractions, caller converts | One conversion site, kernel stays format-agnostic | ✓ |
| Kernel divides by 100 internally | Bakes a data assumption into the module SIM-10 protects | |
| Kernel asserts units at the boundary | Catches the 100x error loudly | |

**User's choice:** Kernel takes fractions, caller converts.

---

## Tracking-error gate

Opened by stating that no trial tracking error would be computed during the discussion, because
VALID-03 forbids anchoring the tolerance to a measured fit.

### Series pair

| Option | Description | Selected |
|--------|-------------|----------|
| Index PR vs fund TR | Both funds track price indices and both distribute | ✓ |
| Index PR vs fund PR | Distribution yield would appear as phantom underperformance | |
| Index TR vs fund TR | Wrong benchmark; neither fund tracks a TR index | |

**User's choice:** Index PR vs fund TR.

### Gating statistic

| Option | Description | Selected |
|--------|-------------|----------|
| Two gates: daily TE and annual drift | Separates mechanism errors from cost-model errors | ✓ |
| Cumulative path max deviation | Conflates precision and bias | |
| Terminal value gap | Weakest; a doubly-wrong model can pass | |

**User's choice:** Two gates.

### Tolerance derivation

| Option | Description | Selected |
|--------|-------------|----------|
| From un-modelled mechanisms, written first | Enumerate, cite, sum, commit before running | ✓ |
| From the fund's published tracking data | Measures the wrong quantity | |
| A round engineering number | Honest but underived | |

**User's choice:** From un-modelled mechanisms, written first.

### Windows

| Option | Description | Selected |
|--------|-------------|----------|
| Gate full window, report rate regimes | PITFALLS A6: spread errors are regime-dependent | ✓ |
| Gate full window only | A regime-dependent error passes cleanly | |
| Gate every sub-window | Multiplies red builds without per-era tolerances | |

**User's choice:** Gate full window, report rate regimes.

---

## No-fitting enforcement

### Expense ratio default source

| Option | Description | Selected |
|--------|-------------|----------|
| Per-fund for validation, generic for hypothetical | Two different questions, two numbers, both labelled | ✓ |
| One generic default everywhere | Gate would test model plus a known-wrong fee | |
| Per-fund everywhere | Indices have no ER, so the question returns | |

**User's choice:** Per-fund for validation, generic for hypothetical.

### Financing spread sourcing

| Option | Description | Selected |
|--------|-------------|----------|
| Cited range, midpoint as default | Bounds become the sensitivity story, not a hidden knob | ✓ |
| PROJECT.md's 0.5% with back-filled derivation | Number first, justification second | |
| Derive by fitting to UPRO | Offered only to be rejected on the record | |

**User's choice:** Cited range, midpoint as default.

### No-tuning mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Separate earlier commit plus pinned test | Makes ROADMAP criterion 2's git-history claim literally true | ✓ |
| Pinned test only | Establishes no ordering | |
| CI check on commit ordering | Brittle against rebases and squashes | |

**User's choice:** Separate earlier commit plus pinned test.

### Expense ratio over time

| Option | Description | Selected |
|--------|-------------|----------|
| Constant at inception-era figure | Later fee cuts show as a known-direction residual | ✓ |
| Time-varying from prospectus history | Most accurate; touches SIM-11's preallocation contract | |
| Constant at today's figure | Biases toward flattering leverage | |
| Constant, time-weighted average | Fitted-looking, matches no document | |

**User's choice:** Constant at inception-era figure. Time-varying recorded as deferred.

### First-run gate failure protocol

| Option (first offering) | Description | Selected |
|--------|-------------|----------|
| Investigate structure, never parameters | Original recommendation | |
| Investigate, then accept a documented residual | Risks waving a real bug through | |
| Escalate to the user | Blocking checkpoint mid-execution | |

**User's response:** Objected rather than selecting. Quoted: "I'm a little bit confused as to why
we're being so pedantic on this. My worry is that we're gonna [come out] on the other side of this
and we're gonna fix a bug that isn't actually a bug."

**Notes:** The objection was correct and the original option 1 had the hole it identified. It
treated a failed gate as necessarily meaning the code is wrong, ignoring the third possibility
that the tolerance was derived too tight. The no-fitting rule protects against tuning parameters,
which are free variables; it does not protect a wrong tolerance. The area was re-asked with a
revised protocol built around diagnosing the residual's *pattern* against PITFALLS' documented
signatures, which makes the diagnosis procedural rather than a judgment call, and which explicitly
names "small, stable, patternless" as the expected outcome of an honest two-parameter model rather
than as something to chase.

| Option (revised offering) | Description | Selected |
|--------|-------------|----------|
| Diagnose by residual pattern, three outcomes | Structure / un-enumerated cost / accept, parameters untouched in all three | ✓ |
| Same, but escalate before widening | One blocking checkpoint | |
| Report and move on, no build failure | Would be a scope change against criterion 1 | |

**User's choice:** Diagnose by residual pattern, three outcomes.

### Tolerance revisability

| Option | Description | Selected |
|--------|-------------|----------|
| Written before, revisable after by naming a mechanism | Preserves criterion 2 while avoiding phantom bug hunts | ✓ |
| Written before, frozen | The trap the user described | |

**User's choice:** Before, revisable after.

---

## Ruin semantics

Opened by noting the Phase 1 spike kernel drops post-ruin contributions silently.

### Post-ruin contributions

| Option | Description | Selected |
|--------|-------------|----------|
| Dropped, and counted separately | Keeps METR-03's denominator unambiguous | ✓ |
| Dropped silently | What the spike does; leaves the denominator undefined | |
| Starts a fresh position | PITFALLS A7 requires a separate labelled curve; Phase 4 or 5 | |

**User's choice:** Dropped, and counted separately.

### Downstream metric treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Ruin flag categorical, metrics still computed | ROADMAP criterion 3's absorbing-state wording | ✓ |
| Null or NaN when ruined | NaN through the Phase 7 sweep is its own bug class | |
| Flag only, consumers decide | Two consumers deciding separately is how implementations drift | |

**User's choice:** Flag categorical, metrics still computed.

### Ruin threshold

| Option | Description | Selected |
|--------|-------------|----------|
| value <= 0 after costs | Exactly PITFALLS A7 | ✓ |
| value <= 0 or below an epsilon | Fabricated parameter that changes results | |
| value <= 0 before costs | Lets costs push a position negative after the check | |

**User's choice:** value <= 0 after costs.

### Ruin bar value

| Option | Description | Selected |
|--------|-------------|----------|
| Clamped to exactly 0 | No negative number anywhere, PITFALLS A7's warning sign | ✓ |
| Clamped, pre-clamp value reported separately | One more output field | |

**User's choice:** Clamped to exactly 0.

---

## Contribution calendar

Opened by noting the spike kernel used bar counting, which drifts over long runs.

### Frequency semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Calendar date anchored to entry date | No drift, matches a real recurring transfer | ✓ |
| Fixed bar count | 21 bars is not a month | |
| First trading day of each period | First contribution lands at an arbitrary distance from entry | |

**User's choice:** Calendar date anchored to entry date.

### Non-trading-day handling

| Option | Description | Selected |
|--------|-------------|----------|
| Next trading day | Business-day-following; never places money before it existed | ✓ |
| Previous trading day | Wrong across a year boundary | |
| Skip the period | Loses roughly a fifth of scheduled contributions | |

**User's choice:** Next trading day.

### Month-end handling

| Option | Description | Selected |
|--------|-------------|----------|
| Clamp to last day of month, then roll | Keeps exactly one contribution per period | ✓ |
| Roll into the next month | Produces months with zero and months with two | |

**User's choice:** Clamp, then roll.

### Entry-bar contribution

| Option | Description | Selected |
|--------|-------------|----------|
| No, initial investment covers it | Keeps the two parameters distinct | ✓ |
| Yes, both on bar 0 | Makes off-by-ones harder to spot | |

**User's choice:** No.

---

## Data-edge policy and kernel boundary

Opened with the measured fact that the rate series ends 2026-08-14 while price series end
2026-08-17.

### Missing trailing rate

| Option | Description | Selected |
|--------|-------------|----------|
| Data layer truncates the run | Kernel needs no branch; matches Phase 2 D-12 reasoning | ✓ |
| Carry the last rate forward | Would be a silent carry-forward, which Phase 2 D-09 forbids | |
| Treat missing as zero | A free-leverage day in the flattering direction | |

**User's choice:** Data layer truncates the run.

### Kernel arguments

| Option | Description | Selected |
|--------|-------------|----------|
| Typed arrays and scalars only | Satisfies SIM-10 literally | ✓ |
| Params object plus bundle handle | Imports the data layer, which SIM-10 forbids | |

**User's choice:** Typed arrays and scalars only.

### calendarDaysElapsed source

| Option | Description | Selected |
|--------|-------------|----------|
| Precomputed once by the caller | Sweep computes it once total, not once per cell | ✓ |
| Kernel derives from a passed calendar array | Repeats identical work across 10,000 cells | |
| Compiler emits it as a bundle field | Reopens Phase 2's format for a load-time derivation | |

**User's choice:** Precomputed once by the caller.

### Holding period overrun

| Option | Description | Selected |
|--------|-------------|----------|
| Caller rejects before calling, kernel asserts | Phase 4 criterion 3 puts the check at the boundary | ✓ |
| Kernel truncates and reports | The silent coercion criterion 3 prohibits | |
| Kernel throws | Bad failure mode inside a 10,000-cell sweep | |

**User's choice:** Caller rejects before calling.

---

## Wrap-up

Offered a further round covering attribution-in-kernel-pass, the dividend toggle's mechanics, and
whether the criterion-4 script is permanent. User chose to proceed to context.

## Claude's Discretion

Ten items, listed in CONTEXT.md under `### Claude's Discretion`. Summary: kernel output array set,
single function versus family, buffer ownership and how the no-allocation claim is verified,
tracking-error module placement, test file organization, the numeric threshold for the long-gap
flag, whether the end-to-end script is permanent, contribution date resolution structure, whether
PERF-02's bench row replaces or supplements the spike row, and the dividend-toggle series lookup.

## Deferred Ideas

- Time-varying expense ratio stepped at documented fee-change dates.
- Post-ruin restart as a separately labelled position (Phase 4 or 5).
- Correcting Phase 2's D-08 Saturday-session rationale (finding F-01).
- Restating Phase 5 criterion 4's extended-tier bias claim (finding F-03).
- Whether the kernel computes attribution components in the same pass (Phase 5, touches PERF-02).

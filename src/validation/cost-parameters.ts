/**
 * src/validation/cost-parameters.ts
 *
 * D-19: the sourced cost parameters and their citations, committed in one atomic commit that
 * precedes every other file under src/validation/. This ordering, together with
 * tests/validation/cost-parameters.test.ts's pinning assertions in the same commit, is the git-
 * history evidence ROADMAP criterion 2 asks for: no cost parameter here was chosen or adjusted
 * after seeing a measured tracking error, because no tracking-error code exists yet anywhere in
 * this repository at the point this commit lands.
 *
 * ## No-fitting protocol (D-14 through D-20)
 *
 * A second commit to this same file (03-03-PLAN.md Task 3) adds the tracking-error tolerance
 * derivation (`TOLERANCE_MECHANISMS`, `RETURN_DRIFT_TOLERANCE`, `TRACKING_ERROR_TOLERANCE`),
 * summed from enumerated un-modelled mechanisms rather than measured from a trial run. No trial
 * tracking error is computed before that derivation is written -- doing so would anchor the
 * tolerance to the fit, which is exactly the fitting VALID-03 exists to prevent (D-14).
 *
 * Explicitly rejected on the record (D-18): solving for the financing spread that fits UPRO
 * over some window and reusing it elsewhere. That is precisely the fitting VALID-03 prohibits.
 * Also explicitly rejected: a WebSearch-sourced "SOFR + 3.7% to 4.5%" financing-spread figure
 * (attributed to a single non-authoritative blog post, an order of magnitude above every other
 * signal found) -- flagged so it is not rediscovered later and mistaken for a stronger source.
 *
 * D-15's revision rule: a tolerance may be revised after the first gate measurement, but only by
 * naming a mechanism and adding or repricing a row in `TOLERANCE_MECHANISMS`, never by picking a
 * replacement number directly. Cost parameters (`COST_PARAMETERS`) never change in response to a
 * measured tracking error, in any outcome below.
 *
 * D-20's first-run failure protocol -- classify the residual's pattern against this table before
 * changing anything, and cost parameters stay untouched in all three permitted outcomes:
 *
 * | Residual pattern                                              | Cause                        | Outcome                        |
 * |-----------------------------------------------------------------|-------------------------------|---------------------------------|
 * | Steady ~0.3-0.5%/yr gap, uncorrelated with rate regime           | ER or day-count (A4)          | Fix structure                   |
 * | Divergence concentrated in the high-rate era                    | Spread mis-calibration (A6)   | Widen tolerance, Key Decision   |
 * | Bias tracking the count of 3-day weekends per year               | Calendar accrual (A8)         | Fix structure                   |
 * | Synthetic far too pessimistic overall                           | Wrong rate type, retail (A3)  | Fix structure                   |
 * | Small, stable, patternless                                      | Genuinely un-modelled cost    | Accept, record the number       |
 *
 * The last row is load-bearing: a small stable patternless residual is the expected result of an
 * honest two-parameter model, and this protocol says so out loud so nobody chases it.
 *
 * ## Retrieval note (03-03-PLAN.md Task 1 checkpoint resolution)
 *
 * 03-RESEARCH.md's session recorded every sec.gov fetch returning HTTP 403. That was an
 * environment artifact of that research session, not a standing block: this plan's execution
 * verified SEC EDGAR (data.sec.gov, www.sec.gov/Archives, www.sec.gov/cgi-bin/browse-edgar) is
 * directly reachable, and retrieved both funds' launch-prospectus fee tables from primary EDGAR
 * filings. Both expense-ratio entries below are therefore `CITED`, not `ASSUMED`, upgraded from
 * 03-RESEARCH.md's placeholder tags with the filing accession numbers in the same diff (SIM-09).
 * The financing-spread range remains `ASSUMED`: EDGAR was reachable and two N-CSR annual reports
 * (2010 and 2024, spanning the pre- and post-2022-derivatives-rule eras) were read directly and
 * searched for an itemized swap-financing spread figure; neither itemizes one. This corroborates
 * PITFALLS A9's prediction directly, at higher confidence than 03-RESEARCH.md's WebSearch-only
 * corroboration, but it does not produce a citable number -- see the ASSUMED entries' citation
 * text for the exact routes tried and what each returned.
 */

/** `VERIFIED` requires an unambiguous primary-source figure with no residual reading judgment.
 * `CITED` requires a specific primary document (with a filing accession number or archive
 * timestamp) that was actually retrieved and read this session, but may carry a reading judgment
 * (e.g. choosing the post-waiver "net" fee-table line over the pre-waiver "gross" line, as
 * documented in the two expense-ratio entries below). `ASSUMED` means no primary document could
 * be found to name the figure; the entry's citation records every retrieval route attempted and
 * what each one returned. */
export type CostParameterConfidence = 'VERIFIED' | 'CITED' | 'ASSUMED'

/** The five sourced cost constants this phase's UPRO/TQQQ gate and hypothetical-run defaults
 * depend on. `financing-spread-lower`/`financing-spread-upper` are their own entries (not folded
 * into a single "range" entry) so each bound carries its own citation independently, per D-18's
 * "the bounds become the sensitivity story rather than a hidden knob." */
export type CostParameterId =
  | 'upro-inception-era-expense-ratio'
  | 'tqqq-inception-era-expense-ratio'
  | 'generic-3x-expense-ratio'
  | 'financing-spread-lower'
  | 'financing-spread-upper'

/** One sourced constant. `value` is always a fraction (D-09) -- 0.0095, never 0.95 or "0.95%".
 * `citation` names the source document; for a `CITED` entry it also names the filing's accession
 * number and the retrieval date; for an `ASSUMED` entry it names every retrieval route attempted
 * and the outcome of each, so an unsourced figure can never masquerade as merely undocumented
 * (SIM-09's prohibition on upgrading a confidence tag without adding the citation in the same
 * diff). */
export interface CostParameter {
  id: CostParameterId
  /** A fraction in (0, 1), never a percentage (D-09). E.g. 0.0095 for "0.95%". */
  value: number
  description: string
  citation: string
  /** ISO `YYYY-MM-DD`. For a `CITED` entry, the filing's own effective/prospectus date. For an
   * `ASSUMED` entry, the date this session's retrieval attempts were made. */
  sourceDate: string
  confidence: CostParameterConfidence
  /** Present only when a later, more authoritative figure has been found but this entry is
   * deliberately still held at the earlier value (e.g. D-17's inception-era-not-current-figure
   * rule) -- documents that the newer figure was seen and consciously not used, rather than
   * missed. */
  supersededBy?: string
}

export const COST_PARAMETERS: Record<CostParameterId, CostParameter> = {
  'upro-inception-era-expense-ratio': {
    id: 'upro-inception-era-expense-ratio',
    value: 0.0095,
    description:
      "UPRO's (ProShares UltraPro S&P500) held-constant expense ratio for the D-16/D-17 gate " +
      'run, per fund inception (2009-06-23): the "Total Net Annual Fund Operating Expenses" ' +
      'line, i.e. the figure actually charged to shareholders under ProShare Advisors LLC\'s ' +
      'contractual fee waiver, not the pre-waiver "Total Annual Fund Operating Expenses" line ' +
      '(1.24% gross: 0.75% Investment Advisory Fee + 0.00% 12b-1 + 0.49% Other Expenses, less a ' +
      '-0.29% Fee Waiver/Reimbursement = 0.95% net). The net figure is the economically ' +
      "meaningful, apples-to-apples comparison against today's published net figure (below), " +
      "which is what D-17's later-fee-cut narrative actually compares.",
    citation:
      'ProShares Trust Form 485BPOS, filed 2009-06-23, SEC EDGAR accession 0001193125-09-135520 ' +
      '(https://www.sec.gov/Archives/edgar/data/1174610/000119312509135520/d485bpos.htm), CIK ' +
      '0001174610 "ProShares Trust" (not CIK 1415311 "ProShares Trust II"), "ProShares UltraPro ' +
      'S&P500" fee table: "Total Annual Fund Operating Expenses 1.24%", "Fee ' +
      'Waivers/Reimbursements -0.29%", "Total Net Annual Fund Operating Expenses 0.95%". ' +
      'Retrieved directly (HTTP 200) 2026-08-18 via `curl` against www.sec.gov/Archives with a ' +
      'descriptive User-Agent, during 03-03-PLAN.md Task 2 execution -- the SEC EDGAR access ' +
      'that blocked every fetch during 03-RESEARCH.md\'s prior research session was reachable ' +
      'this run. Context, not held constant: ProShares\' own current UPRO fact sheet, "As of ' +
      '6/30/2026" (fetched and read directly during 03-RESEARCH.md\'s session), states Gross ' +
      '0.91%, Net 0.91% (no active waiver) -- a small decrease from the 0.95% inception-era net ' +
      "figure, consistent with D-17's expected direction.",
    sourceDate: '2009-06-23',
    confidence: 'CITED',
  },
  'tqqq-inception-era-expense-ratio': {
    id: 'tqqq-inception-era-expense-ratio',
    value: 0.0095,
    description:
      "TQQQ's (ProShares UltraPro QQQ) held-constant expense ratio for the D-16/D-17 gate run, " +
      "per fund inception (2010-02-09): the \"Total Net Annual Fund Operating Expenses After " +
      'Fee Waivers and Expense Reimbursements" line (1.31% gross: 0.75% Investment Advisory ' +
      'Fees + 0.56% Other Expenses, less a -0.36% Fee Waiver/Reimbursement = 0.95% net), for the ' +
      "same net-vs-net reasoning as UPRO's entry above.",
    citation:
      'ProShares Trust Form 485BPOS, filed 2010-02-05 ("Prospectus February 9, 2010" -- TQQQ\'s ' +
      'own launch date -- printed on the document\'s cover), SEC EDGAR accession ' +
      '0001193125-10-023274 ' +
      '(https://www.sec.gov/Archives/edgar/data/1174610/000119312510023274/d485bpos.htm), CIK ' +
      '0001174610 "ProShares Trust". Explanatory Note on the filing\'s cover states it "relates ' +
      'only to the following new series of ProShares Trust: ProShares UltraPro QQQ, ...", and ' +
      'the "ProShares UltraPro QQQ" fee table (the first fund listed) reads: "Investment ' +
      'Advisory Fees 0.75%", "Other Expenses 0.56%", "Total Annual Fund Operating Expenses ' +
      'Before Fee Waivers and Expense Reimbursements 1.31%", "Fee Waiver/Reimbursement -0.36%", ' +
      '"Total Net Annual Fund Operating Expenses After Fee Waivers and Expense Reimbursements ' +
      '0.95%". Retrieved directly (HTTP 200) 2026-08-18 via `curl` against www.sec.gov/Archives ' +
      'with a descriptive User-Agent, during 03-03-PLAN.md Task 2 execution. Context, not held ' +
      "constant: ProShares' own current TQQQ fact sheet, \"As of 6/30/2026\" (fetched and read " +
      'directly during 03-RESEARCH.md\'s session), states Gross 0.97%, Net 0.84% (contractual ' +
      'waiver active through 2026-09-30) -- a larger decrease than UPRO\'s from the 0.95% ' +
      "inception-era net figure, still consistent with D-17's expected direction.",
    sourceDate: '2010-02-09',
    confidence: 'CITED',
  },
  'generic-3x-expense-ratio': {
    id: 'generic-3x-expense-ratio',
    value: 0.009,
    description:
      "D-16's generic expense-ratio default for a hypothetical leveraged run that is not the " +
      'UPRO/TQQQ gate itself -- explicitly labelled as representative of real 3x products ' +
      "rather than either specific fund's figure.",
    citation:
      '.planning/PROJECT.md, "Expense ratio and financing spread are user-editable, defaulting ' +
      'to values sourced from real products (roughly 0.90% ER and ~0.5% over the short rate)" -- ' +
      "this project's own pre-existing placeholder, adopted unchanged as the generic default " +
      "per this plan's fallback instruction.",
    sourceDate: '2026-08-18',
    confidence: 'CITED',
  },
  'financing-spread-lower': {
    id: 'financing-spread-lower',
    value: 0.002,
    description:
      "D-18's lower bound of the researched financing-spread range, whose midpoint becomes " +
      'FINANCING_SPREAD_DEFAULT.',
    citation:
      'ASSUMED -- no fund itemizes swap financing spread in any public disclosure found this ' +
      'session, corroborating PITFALLS A9. Retrieval routes attempted 2026-08-18, all reachable ' +
      '(SEC EDGAR was NOT blocked this session, contrary to 03-RESEARCH.md\'s prior finding): ' +
      '(1) data.sec.gov/submissions/CIK0001174610.json plus the three older filing-history ' +
      'shards -> HTTP 200, used to enumerate every N-CSR/N-CSRS filing 2007-2026, no itemized ' +
      'rate found in the index itself; (2) ProShares Trust N-CSR filed 2010-08-09, accession ' +
      '0001104659-10-043192 ' +
      '(https://www.sec.gov/Archives/edgar/data/1174610/000110465910043192/a10-5627_1ncsr.htm) ' +
      '-> HTTP 200, fetched and read directly in full (47MB); its "Costs of Leveraged and ' +
      'Inverse Exposure" narrative states "Each Ultra and UltraPro Fund essentially pays one and ' +
      'two times [the one-week LIBOR benchmark] rate plus a spread" but gives no numeric spread; ' +
      "UPRO's own Schedule of Portfolio Investments in the same filing lists only overnight " +
      'repurchase agreements for the period shown, no itemized swap-rate schedule; searched the ' +
      'full document text for "basis points", "plus 0.XX%", "+ 0.XX%" and "Total Return Swap ' +
      'Agreements" -- zero matches for any of them; (3) ProShares Trust N-CSR filed 2024-08-08, ' +
      'accession 0001398344-24-014116 ' +
      '(https://www.sec.gov/Archives/edgar/data/1174610/000139834424014116/primary-document.htm) ' +
      '-> HTTP 200, fetched and read (93MB, post-Rule-18f-4 derivatives-disclosure era); its ' +
      'per-fund performance narratives repeatedly cite "financing rates paid or earned" as a ' +
      'return driver but state no number; searched for "SOFR", "basis points" and "Total Return ' +
      'Swap" -- effectively no matches; (4) www.sec.gov/cgi-bin/browse-edgar (N-CSR filing list ' +
      'for CIK 1174610) -> HTTP 200, used only to enumerate filings, confirms no itemized-swap ' +
      'source among them; (5) Direxion Investments FAQ, via WebSearch synthesis during ' +
      "03-RESEARCH.md's prior session (not re-verified this session): \"[t]he spread varies by " +
      'both Fund and counterparty and is a function of market demand, hedging costs, access to ' +
      'balance sheet, borrow volatility, current counterparty exposure and administrative ' +
      'costs" -- corroborating, no number given. Given the absence of any itemized public ' +
      'figure across five routes, this range retains .planning/PROJECT.md\'s own placeholder ' +
      '("~0.5% over the short rate") as its center: lower bound 20bp, upper bound 80bp, a ' +
      'plausible band for institutional broad-market-index total-return swap spreads per ' +
      "general market-structure commentary. Explicitly not used: a WebSearch-derived \"SOFR + " +
      '3.7% to 4.5%" figure attributed to a single non-authoritative blog post, an order of ' +
      'magnitude above every other signal found and with no established fund, underlying or ' +
      'period -- flagged here so it is not rediscovered later and mistaken for a stronger source.',
    sourceDate: '2026-08-18',
    confidence: 'ASSUMED',
  },
  'financing-spread-upper': {
    id: 'financing-spread-upper',
    value: 0.008,
    description:
      "D-18's upper bound of the researched financing-spread range, whose midpoint becomes " +
      'FINANCING_SPREAD_DEFAULT.',
    citation:
      'Same five retrieval routes as the \'financing-spread-lower\' entry -- ' +
      'data.sec.gov/submissions/CIK0001174610.json (HTTP 200); ProShares Trust N-CSR filed ' +
      '2010-08-09, accession 0001104659-10-043192 ' +
      '(https://www.sec.gov/Archives/edgar/data/1174610/000110465910043192/a10-5627_1ncsr.htm, ' +
      'HTTP 200, read in full, no itemized spread found); ProShares Trust N-CSR filed ' +
      '2024-08-08, accession 0001398344-24-014116 ' +
      '(https://www.sec.gov/Archives/edgar/data/1174610/000139834424014116/primary-document.htm, ' +
      'HTTP 200, read in full, no itemized spread found); ' +
      'www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1174610&type=N-CSR (HTTP 200, ' +
      'filing index only); Direxion Investments FAQ (WebSearch synthesis, prior session, ' +
      'corroborating, no number given). Same outcome and the same resulting band as the ' +
      "'financing-spread-lower' entry's citation -- see that entry for the full narrative. " +
      'This bound: upper 80bp over the short rate.',
    sourceDate: '2026-08-18',
    confidence: 'ASSUMED',
  },
}

/** D-17: UPRO's own inception-era (2009) net expense ratio, held constant for the gate run. */
export const UPRO_INCEPTION_ERA_EXPENSE_RATIO = COST_PARAMETERS['upro-inception-era-expense-ratio'].value

/** D-17: TQQQ's own inception-era (2010) net expense ratio, held constant for the gate run. */
export const TQQQ_INCEPTION_ERA_EXPENSE_RATIO = COST_PARAMETERS['tqqq-inception-era-expense-ratio'].value

/** D-16: the generic expense-ratio default for a hypothetical (non-gate) leveraged run. */
export const GENERIC_3X_EXPENSE_RATIO = COST_PARAMETERS['generic-3x-expense-ratio'].value

/** D-18: the researched, cited financing-spread range. Both bounds are read off COST_PARAMETERS
 * so the range can never drift from its own cited entries. */
export const FINANCING_SPREAD_RANGE = {
  lower: COST_PARAMETERS['financing-spread-lower'].value,
  upper: COST_PARAMETERS['financing-spread-upper'].value,
} as const

/** D-18: the default financing spread is the midpoint of FINANCING_SPREAD_RANGE, computed here
 * rather than written as an independent literal, so the default can never drift from the range
 * it is supposed to be the center of. */
export const FINANCING_SPREAD_DEFAULT = (FINANCING_SPREAD_RANGE.lower + FINANCING_SPREAD_RANGE.upper) / 2

// --- Compile-time exhaustiveness check ---------------------------------------------------
// COST_PARAMETERS is declared as Record<CostParameterId, CostParameter>, so TypeScript already
// rejects a missing or extra key in the object literal above at compile time. This assignment
// makes that guarantee explicit and readable at the point a future reader asks "what stops an
// entry from being silently dropped?" -- mirroring perf-budgets.ts's exhaustiveness pattern.
type CostParameterIdsPresent = keyof typeof COST_PARAMETERS
type _AssertAllCostParameterIdsPresent = CostParameterId extends CostParameterIdsPresent ? true : never
type _AssertNoExtraCostParameterIds = CostParameterIdsPresent extends CostParameterId ? true : never
const _costParameterExhaustivenessCheck: [_AssertAllCostParameterIdsPresent, _AssertNoExtraCostParameterIds] = [
  true,
  true,
]
void _costParameterExhaustivenessCheck

// --- D-14: tracking-error tolerance derivation, from enumerated un-modelled mechanisms ---------

/** Which of the two D-11 gates a mechanism's magnitude contributes to. `'both'` contributes to
 * both sums. Precision (`'tracking-error'`, Gate 1, the annualized stdev of daily return
 * differences) and drift (`'drift'`, Gate 2, the annualized return difference) are priced from
 * separate mechanism lists, because a bias mechanism does not necessarily produce daily
 * dispersion and vice versa. */
export type ToleranceMechanismScope = 'tracking-error' | 'drift' | 'both'

/** `'one-directional'`: always pushes the synthetic the same way relative to the real fund (e.g.
 * a cost the model omits that the fund pays, or a benefit the fund earns that the model doesn't
 * credit). `'bidirectional'`: sign varies by period or is not knowable in advance. */
export type ToleranceMechanismDirection = 'one-directional' | 'bidirectional'

/** One enumerated un-modelled mechanism (D-14): something the two-parameter cost model does not
 * capture, with a reasoned or cited annualized magnitude. `basisPointsPerYear` must be strictly
 * positive -- a mechanism priced at exactly zero contributes nothing and does not belong in the
 * list; if a mechanism is judged negligible, its magnitude should still be a small positive
 * number reflecting genuine, if slight, uncertainty, not a bare zero standing in for "ignore
 * this." */
export interface ToleranceMechanism {
  id: string
  appliesTo: ToleranceMechanismScope
  direction: ToleranceMechanismDirection
  basisPointsPerYear: number
  /** The reasoning or citation that produced `basisPointsPerYear`. Never a number alone: D-15's
   * revision rule requires every mechanism to be named, not just quantified. */
  basis: string
  confidence: CostParameterConfidence
  /** `true` when `basisPointsPerYear` was read off a dataset rather than reasoned to. A measured
   * row is EXCLUDED from TOLERANCE_SAFETY_FACTOR by `sumMechanismsForScope`, because that factor
   * exists solely to carry margin for a reasoned estimate being off by half (see its own doc
   * comment) -- inflating a measurement by 1.5x would not add rigour, it would just slacken the
   * gate by 50% and let a real regression hide inside the margin. A measured row must still name
   * its measurement in `basis` so the figure is reproducible, and it is still revisable only
   * under D-15. Omitted (undefined) means reasoned, which is the default and the common case. */
  measured?: boolean
}

/**
 * D-14's enumerated mechanisms. No trial tracking error was computed before this list was
 * written or priced -- see this module's header comment. Every magnitude below is a reasoned
 * order-of-magnitude estimate, not a measurement; TOLERANCE_SAFETY_FACTOR below exists
 * specifically because these are reasoning, not measurements.
 *
 * Five mechanisms are scoped to drift (Gate 2, the D-11 bias measure) and four to precision
 * (Gate 1, the D-11 dispersion measure), per 03-RESEARCH.md's "Tracking-Error Tolerance
 * Derivation" section and PITFALLS §A, with 03-RESEARCH.md's own directional placeholders
 * replaced by this task's reasoned bp/yr figures (03-RESEARCH.md's table is explicit that its
 * numbers are "for the plan to refine, not adopt verbatim").
 */
export const TOLERANCE_MECHANISMS: readonly ToleranceMechanism[] = [
  {
    id: 'er-365-day-internal-accrual-approximation',
    appliesTo: 'drift',
    direction: 'bidirectional',
    basisPointsPerYear: 2,
    basis:
      "The model applies D-02's actual/365 calendar-day accrual, matching PITFALLS A4's " +
      'recorded fund-prospectus convention; this residual covers the small gap between that ' +
      "daily approximation and each fund's own internal NAV-accrual mechanics, which are not " +
      'independently disclosed at daily granularity. Small because D-02 already uses the ' +
      'recommended convention; not zero because "already uses the recommended convention" is ' +
      'not the same claim as "reproduces the fund\'s internal accrual bit-for-bit."',
    confidence: 'ASSUMED',
  },
  {
    id: 'swap-dealer-spread-variation-over-time',
    appliesTo: 'drift',
    direction: 'bidirectional',
    basisPointsPerYear: 25,
    basis:
      "D-18's FINANCING_SPREAD_DEFAULT is a single constant over the full 17-year gate window; " +
      "real swap dealer spreads move with counterparty balance-sheet cost (Direxion's own FAQ: " +
      '"varies by both Fund and counterparty and is a function of market demand, hedging costs, ' +
      'access to balance sheet, borrow volatility, current counterparty exposure and ' +
      'administrative costs"), plausibly by tens of bp/yr concentrated in stressed or high-rate ' +
      "periods (PITFALLS A6). D-13's rate-regime sub-window reporting exists specifically to " +
      'surface this mechanism if it dominates the residual.',
    confidence: 'ASSUMED',
  },
  {
    id: 'fund-trading-and-rebalance-costs',
    appliesTo: 'drift',
    direction: 'one-directional',
    basisPointsPerYear: 3,
    basis:
      'Every real leveraged fund crosses a bid-ask spread rebalancing its swap/futures notional ' +
      'daily to maintain constant leverage; this model charges no transaction cost at all. ' +
      'One-directional (only ever costs the fund, never the synthetic) and scales with ' +
      'underlying volatility, so it is larger in volatile sub-periods than the flat annualized ' +
      'figure implies (PITFALLS A2/A12).',
    confidence: 'ASSUMED',
  },
  {
    id: 'securities-lending-revenue-not-credited',
    appliesTo: 'drift',
    direction: 'one-directional',
    basisPointsPerYear: 2,
    basis:
      'Real funds may earn securities-lending revenue on assets held as swap/futures collateral, ' +
      'offsetting some of their expense ratio; this model credits none. One-directional (only ' +
      'ever helps the fund, never the synthetic). Not independently quantified for UPRO/TQQQ ' +
      'specifically this session -- priced small and flagged as the weakest-evidence mechanism ' +
      'in this list, pending a fund-specific citation.',
    confidence: 'ASSUMED',
  },
  {
    id: 'inception-era-expense-ratio-residual-uncertainty',
    appliesTo: 'drift',
    direction: 'bidirectional',
    basisPointsPerYear: 3,
    basis:
      "03-RESEARCH.md flagged this as potentially the single largest term, because its 0.95% " +
      'inception-era figure for both funds came from an unconfirmed WebSearch synthesis. This ' +
      "plan's Task 2 resolved that: both UPRO_INCEPTION_ERA_EXPENSE_RATIO and " +
      'TQQQ_INCEPTION_ERA_EXPENSE_RATIO are now CITED to the actual launch-prospectus fee ' +
      'tables (SEC EDGAR accessions 0001193125-09-135520 and 0001193125-10-023274), which ' +
      'confirmed the 0.95% figure exactly. This row is priced small, per that resolved outcome ' +
      '(not per the larger, unresolved risk 03-RESEARCH.md was hedging against): the residual ' +
      'here reflects only the judgment call of holding the post-waiver net line constant rather ' +
      'than the pre-waiver gross line (see both entries\' citations in COST_PARAMETERS), plus ' +
      'ordinary transcription risk against the source HTML.',
    confidence: 'CITED',
  },
  {
    id: 'intraday-rebalance-timing-vs-close-to-close-bars',
    appliesTo: 'tracking-error',
    direction: 'bidirectional',
    basisPointsPerYear: 20,
    basis:
      "Real funds rebalance notional exposure continuously or at multiple points intraday to " +
      'manage tracking within the trading day; this model rebalances exactly once per bar at the ' +
      'close. On volatile days the two paths diverge before reconverging at the close, ' +
      'contributing to daily return-difference dispersion (Gate 1) without necessarily biasing ' +
      'the annualized total (Gate 2).',
    confidence: 'ASSUMED',
  },
  {
    id: 'fund-nav-vs-market-close-pricing-basis',
    appliesTo: 'tracking-error',
    direction: 'bidirectional',
    basisPointsPerYear: 352,
    basis:
      'REPRICED under D-15 after plan 03-06 first ran the gate, from a reasoned 15 bp/yr to a ' +
      'measured 352 bp/yr. Two things were wrong with the original entry. First, its factual ' +
      "claim: it described the comparison target as the fund's own NAV and distribution " +
      "history, but the manifest records UPRO/* and TQQQ/* as Yahoo Finance chart-endpoint " +
      'series, which are distribution-adjusted MARKET CLOSES, not NAV strikes. A leveraged ' +
      "ETF's market close carries premium/discount and close-timing noise against the index " +
      'close that a NAV series would not. Second, its magnitude, which that mistake made far ' +
      'too small. The measurement: for each fund, take its own realized daily return minus 3x ' +
      "its own benchmark index's daily return over the full overlap -- NO cost model of any " +
      'kind applied -- then take the sample standard deviation and annualize by sqrt(252). ' +
      'That yields 3.198%/yr for UPRO (n=4311) and 3.519%/yr for TQQQ (n=4151). This row is ' +
      'priced at the worse of the two, 352 bp. It is broad-based rather than outlier-driven: ' +
      'excluding the worst 1% of days only brings the pair to 2.282% and 2.743%. Because this ' +
      'dispersion exists in the reference series BEFORE any model touches it, no cost model can ' +
      'reduce Gate 1 below it, and the pre-measurement 66 bp tolerance was unreachable by ' +
      'construction. Nothing in COST_PARAMETERS was changed to reach this figure and nothing ' +
      'was fitted to the gate: the measurement never references the synthetic. See ' +
      '.planning/phases/03-simulation-kernel-and-the-upro-tqqq-gate/03-GATE-DIAGNOSIS.md. ' +
      'What would shrink this row: sourcing true daily NAV history for both funds in place of ' +
      'Yahoo market closes, which would remove the premium/discount component outright.',
    confidence: 'VERIFIED',
    measured: true,
  },
  {
    id: 'discrete-swap-reset-dates-vs-continuous-daily-accrual',
    appliesTo: 'tracking-error',
    direction: 'bidirectional',
    basisPointsPerYear: 8,
    basis:
      'This model accrues financing continuously, once per calendar day elapsed (D-01). Real ' +
      'swap contracts reset and settle financing on their own discrete schedule, which need not ' +
      'align with every trading day, producing small day-to-day dispersion around the same ' +
      'annualized total.',
    confidence: 'ASSUMED',
  },
  {
    id: 'ragged-right-edge-truncation',
    appliesTo: 'tracking-error',
    direction: 'one-directional',
    basisPointsPerYear: 1,
    basis:
      "D-29: the rate series currently ends one trading day before the price series, so the " +
      "gate's run is truncated at the last fully-supported bar rather than the very last priced " +
      'bar. This affects at most one bar out of the full multi-thousand-bar overlap window, so ' +
      'its contribution to the annualized dispersion figure is small but not exactly zero -- ' +
      'the offset changes with every data refresh, so it cannot be assumed away structurally.',
    confidence: 'CITED',
  },
]

/** D-14: the enumerated-mechanism magnitudes above are reasoning, not measurements -- each is an
 * order-of-magnitude estimate of a real but unquantified effect, not a number read off a
 * dataset. This factor exists so the derived tolerance carries margin for that reasoning being
 * off by half, exactly mirroring perf-budgets.ts's ESCALATION_TRIGGER_RATIO in spirit (a
 * declared, named safety margin rather than an unstated fudge baked into the mechanism figures
 * themselves). */
export const TOLERANCE_SAFETY_FACTOR = 1.5

/** Sums every mechanism whose `appliesTo` matches the given scope (`'both'` mechanisms count
 * toward every scope). TOLERANCE_SAFETY_FACTOR is applied to the REASONED rows only; rows marked
 * `measured: true` are added at face value afterwards. The factor's own doc comment states its
 * single purpose -- margin for a reasoned order-of-magnitude estimate being off by half -- and a
 * measured row has no such uncertainty to cover, so multiplying it would slacken the gate by 50%
 * for no epistemic gain and let a genuine regression hide inside the margin. Used to compute both
 * RETURN_DRIFT_TOLERANCE and TRACKING_ERROR_TOLERANCE below from TOLERANCE_MECHANISMS, and
 * reused by the pinning test to recompute both independently -- so neither tolerance can ever be
 * written as a literal that silently drifts from its own inputs. */
function sumMechanismsForScope(scope: 'tracking-error' | 'drift'): number {
  const inScope = TOLERANCE_MECHANISMS.filter((m) => m.appliesTo === scope || m.appliesTo === 'both')
  const reasonedBasisPoints = inScope
    .filter((m) => m.measured !== true)
    .reduce((sum, m) => sum + m.basisPointsPerYear, 0)
  const measuredBasisPoints = inScope
    .filter((m) => m.measured === true)
    .reduce((sum, m) => sum + m.basisPointsPerYear, 0)
  return ((reasonedBasisPoints * TOLERANCE_SAFETY_FACTOR) + measuredBasisPoints) / 10_000
}

/** D-11 Gate 2's build-failing tolerance: the annualized return-difference (drift/bias) bound,
 * as an annualized fraction (never basis points or a percentage). Computed from
 * TOLERANCE_MECHANISMS and TOLERANCE_SAFETY_FACTOR, never written as a literal, so a mechanism
 * added later mechanically widens this bound in the same diff that names it -- D-15's revision
 * rule made structural. */
export const RETURN_DRIFT_TOLERANCE = sumMechanismsForScope('drift')

/** D-11 Gate 1's build-failing tolerance: the annualized tracking-error (precision/dispersion)
 * bound, as an annualized fraction. Same computation discipline as RETURN_DRIFT_TOLERANCE. */
export const TRACKING_ERROR_TOLERANCE = sumMechanismsForScope('tracking-error')

// No trial tracking error was computed before RETURN_DRIFT_TOLERANCE or TRACKING_ERROR_TOLERANCE
// were derived above. Both are revisable after the first gate measurement (plan 03-06), but only
// by adding or repricing a named row in TOLERANCE_MECHANISMS -- never by editing either exported
// constant directly, and never in response to tuning a cost parameter in COST_PARAMETERS, which
// VALID-03 prohibits in every one of D-20's three permitted outcomes.

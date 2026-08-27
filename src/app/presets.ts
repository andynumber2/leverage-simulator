/**
 * src/app/presets.ts
 *
 * 08-03-PLAN.md Task 2, SHARE-06: the canonical-argument library, declared as DATA -- ten typed
 * parameter sets, never URL strings (D-19). `bundleVersion` is deliberately absent from
 * `PresetDefinition`: it is filled in from the live manifest when a preset is applied, so a
 * preset cannot go stale by construction, and "Copy link" on an applied preset produces a
 * normal, correct permalink. Applying a preset writes its `request` through the same validated
 * store setters any parameter control uses (plan 08-04's job); this module owns only the values.
 *
 * Ordering is D-13's argument made mechanical: entries are declared UNFLATTERING-FIRST, so a
 * reader sees the tool leading with its own worst results before being asked to. The four
 * `featured: true` entries (D-15, D-20) fall at positions 4, 5, 6 and 10 -- filtering by
 * `featured` in declaration order yields exactly `tqqq-covid-crash`, `upro-covid-crash`,
 * `spx-3x-2000-peak`, `upro-since-inception`, matching 08-UI-SPEC.md's featured-row order with no
 * second list to keep in sync. `PRESET_DEFINITIONS` is declared `as const` and never sorted by
 * any consumer: the render order IS the declaration order (edge probe SHARE-06 ordering).
 *
 * D-16 (load-bearing): every preset built on a real leveraged ETF (TQQQ, UPRO) sets `leverage`
 * to exactly 1.0 and `expenseRatioPercent` to exactly 0. `src/kernel/backtest.ts`'s financing
 * term is scaled by `(leverage - 1)`, so it zeroes itself at 1.0 structurally -- but its
 * `expenseCost` term is NOT leverage-scaled, so a non-zero expense ratio would charge the fund's
 * own fee a second time on top of the fee already embedded in its price. Asserted by a test
 * (`tests/app/presets.test.ts`), not left to these definitions being written correctly once.
 *
 * Every headline outcome figure for these definitions is computed at BUILD time by
 * `scripts/compute-presets.ts` against the compiled bundle and emitted into
 * `src/app/presets.generated.ts` (D-18) -- never computed live, never hand-authored.
 */

import type { Tier } from './bounds.ts'
import type { PermalinkMetric, PermalinkMode, PermalinkScale } from './permalink.ts'
import type { BacktestRequest } from '../data/kernel-inputs.ts'

/** D-10/D-11: `'synthetic'` marks a preset whose price series is a synthetic construction rather
 * than a real fund's own history (the 2000-peak NDX preset, D-10); `'extended-tier'` marks a
 * preset whose window necessarily falls outside the strict tier and so carries
 * `ExtendedTierWarning` (the 1929 and 1979 presets, D-11). A preset may carry neither, either, or
 * (in principle) both. */
export type PresetTag = 'synthetic' | 'extended-tier'

/** Which of a completed run's metrics this preset's headline figure names -- matches
 * `DerivedMetrics`'s `finalValueMultiple`/`irr`/`cagr` plus `KernelResult.maxDrawdown`, the four
 * figures a run can headline (METR-01 through METR-06). */
export type PresetOutcomeMetric = 'finalValueMultiple' | 'irr' | 'cagr' | 'maxDrawdown'

/**
 * One named canonical argument. Every field the request needs to reproduce the run lives here
 * directly (D-19) -- there is deliberately no `bundleVersion` field; that is filled in from the
 * live manifest at apply time.
 */
export interface PresetDefinition {
  id: string
  title: string
  /** D-13/Phase 4 D-18/CRED-05: why this specific window was chosen and what it demonstrates,
   * stated in the definition itself -- the same "every default carries its source inline"
   * discipline this project applies everywhere else. Never states a verdict (D-13): names the
   * window and what the model computed, does not argue it. */
  whyThisWindow: string
  /** Which computed figure this preset headlines (F-07: read by both the overlay/inline row and
   * the build-time generator, so the two can never disagree about which metric is being shown). */
  outcomeMetric: PresetOutcomeMetric
  /** D-20: one boolean, read by both the inline featured row and the Scenarios overlay.
   * Promoting or demoting a preset is a one-line edit plus a regenerate. */
  featured: boolean
  tags: readonly PresetTag[]
  request: BacktestRequest
  tier: Tier
  scale: PermalinkScale
  mode: PermalinkMode
  metric: PermalinkMetric
}

/** Fields shared by every entry below unless a row states otherwise -- declared once so each
 * definition states only what makes it distinct. */
const COMMON_REQUEST_FIELDS = {
  initialInvestment: 10_000,
  contributionAmount: 0,
  contributionFrequency: 'none',
  dividendReinvest: true,
} as const

const COMMON_FIELDS = {
  scale: 'log',
  metric: 'multiple',
} as const

/** D-09/F-02 defaults: matches `DEFAULT_REQUEST` in `src/app/state.ts` -- the same generic 3x
 * cost parameters every other-than-real-fund preset in this library uses unless a row states
 * otherwise. Real-fund presets (D-16) override both to 0 explicitly. */
const DEFAULT_EXPENSE_RATIO_PERCENT = 0.91
const DEFAULT_FINANCING_SPREAD_PERCENT = 0.5

/**
 * D-13's unflattering-first order, decided once here. Rows 1 through 6 are the unflattering
 * cases; rows 7 and 8 are mixed (a DCA comparison and an entry-sensitivity sweep); rows 9 and 10
 * are the flattering ones. This ordering IS the argument: a reader sees the tool leading with its
 * own worst results before being asked to (see this module's header).
 */
export const PRESET_DEFINITIONS: readonly PresetDefinition[] = Object.freeze([
  {
    id: 'spx-3x-1929',
    title: '3x S&P 500 from the 1929 peak',
    whyThisWindow:
      'The single most-cited leveraged-ETF cautionary window in any online argument about holding leverage ' +
      'through a generational crash. Necessarily extended tier (SPX/total-return strict starts 1988-01-05), ' +
      'so this run carries the interpolated pre-dividend-data caveat.',
    outcomeMetric: 'finalValueMultiple',
    featured: false,
    tags: ['extended-tier'],
    request: {
      ...COMMON_REQUEST_FIELDS,
      symbol: 'SPX',
      leverage: 3,
      entryDate: '1929-09-16',
      holdingPeriodBars: null,
      expenseRatioPercent: DEFAULT_EXPENSE_RATIO_PERCENT,
      financingSpreadPercent: DEFAULT_FINANCING_SPREAD_PERCENT,
    },
    tier: 'extended',
    mode: 'single',
    ...COMMON_FIELDS,
  },
  {
    id: 'ndx-3x-2000-peak',
    title: 'Synthetic 3x Nasdaq-100 from the March 2000 peak',
    whyThisWindow:
      'D-10: this substitutes for roadmap criterion 3\'s "TQQQ from 2000" -- TQQQ/total-return starts ' +
      '2010-02-11, so no real TQQQ data reaches the dot-com peak. NDX/total-return starts 1999-03-04, so a ' +
      'synthetic 3x NDX reaches it instead. Labelled synthetic deliberately: the fund did not exist to take ' +
      'this loss, which is the more damning framing, not a softer one.',
    outcomeMetric: 'finalValueMultiple',
    featured: false,
    tags: ['synthetic'],
    request: {
      ...COMMON_REQUEST_FIELDS,
      symbol: 'NDX',
      leverage: 3,
      entryDate: '2000-03-27',
      holdingPeriodBars: null,
      expenseRatioPercent: DEFAULT_EXPENSE_RATIO_PERCENT,
      financingSpreadPercent: DEFAULT_FINANCING_SPREAD_PERCENT,
    },
    tier: 'strict',
    mode: 'single',
    ...COMMON_FIELDS,
  },
  {
    id: 'spx-3x-high-rate-1979',
    title: '3x S&P 500 into the 1979-1982 rate peak',
    whyThisWindow:
      'D-11: the short rate peaked near 20% in 1981, which at 3x is roughly 40%/yr of financing before the ' +
      'index does anything -- the most vivid available demonstration of the mechanism this tool exists to ' +
      'name. Necessarily extended tier, and the ExtendedTierWarning is shown rather than avoided (the ' +
      'skeptic gets the criticism, not a window that dodges it).',
    outcomeMetric: 'finalValueMultiple',
    featured: false,
    tags: ['extended-tier'],
    request: {
      ...COMMON_REQUEST_FIELDS,
      symbol: 'SPX',
      leverage: 3,
      entryDate: '1979-01-02',
      holdingPeriodBars: 1008,
      expenseRatioPercent: DEFAULT_EXPENSE_RATIO_PERCENT,
      financingSpreadPercent: DEFAULT_FINANCING_SPREAD_PERCENT,
    },
    tier: 'extended',
    mode: 'single',
    ...COMMON_FIELDS,
  },
  {
    id: 'tqqq-covid-crash',
    title: 'TQQQ through the COVID crash',
    whyThisWindow:
      'D-15: real TQQQ history through the fastest bear market in the fund\'s life -- the audience for this ' +
      'tool argues about whether TQQQ is safe, so its own real crash earns a one-click featured slot over a ' +
      'historical stand-in.',
    outcomeMetric: 'maxDrawdown',
    featured: true,
    tags: [],
    request: {
      ...COMMON_REQUEST_FIELDS,
      symbol: 'TQQQ',
      leverage: 1,
      entryDate: '2020-02-19',
      holdingPeriodBars: 252,
      // D-16: real-fund preset -- leverage 1.0 AND expense ratio exactly 0, asserted by test.
      expenseRatioPercent: 0,
      financingSpreadPercent: 0,
    },
    tier: 'strict',
    mode: 'single',
    ...COMMON_FIELDS,
  },
  {
    id: 'upro-covid-crash',
    title: 'UPRO through the COVID crash',
    whyThisWindow:
      'D-15: real UPRO history through the same crash as the TQQQ preset above, so the two can be compared ' +
      'directly -- the audience for this tool argues about whether UPRO is safe as much as TQQQ.',
    outcomeMetric: 'maxDrawdown',
    featured: true,
    tags: [],
    request: {
      ...COMMON_REQUEST_FIELDS,
      symbol: 'UPRO',
      leverage: 1,
      entryDate: '2020-02-19',
      holdingPeriodBars: 252,
      // D-16: real-fund preset -- leverage 1.0 AND expense ratio exactly 0, asserted by test.
      expenseRatioPercent: 0,
      financingSpreadPercent: 0,
    },
    tier: 'strict',
    mode: 'single',
    ...COMMON_FIELDS,
  },
  {
    id: 'spx-3x-2000-peak',
    title: '3x S&P 500 from the March 2000 peak',
    whyThisWindow:
      'D-15: the strict-tier synthetic counterpart to the dot-com crash -- unlike the extended-tier 1929 ' +
      'and 1979 presets above, SPX/total-return strict reaches back to 1988-01-05, so this window carries ' +
      'no interpolation caveat at all, and still lands unflattering.',
    outcomeMetric: 'finalValueMultiple',
    featured: true,
    tags: [],
    request: {
      ...COMMON_REQUEST_FIELDS,
      symbol: 'SPX',
      leverage: 3,
      entryDate: '2000-03-24',
      holdingPeriodBars: null,
      expenseRatioPercent: DEFAULT_EXPENSE_RATIO_PERCENT,
      financingSpreadPercent: DEFAULT_FINANCING_SPREAD_PERCENT,
    },
    tier: 'strict',
    mode: 'single',
    ...COMMON_FIELDS,
  },
  {
    id: 'spx-3x-dca-2000',
    title: 'Dollar-cost averaging into 3x S&P 500 from the 2000 peak',
    whyThisWindow:
      'D-17: dollar-cost averaging into leverage is the most common real-world version of this argument, ' +
      'and the case where the answer genuinely differs -- contributions buy the crash. This preset is the ' +
      "one entry in the library that exercises IRR (solveIrr) rather than CAGR, over the same window row 6 " +
      'runs as a lump sum, so the two can be compared directly.',
    outcomeMetric: 'irr',
    featured: false,
    tags: [],
    request: {
      symbol: 'SPX',
      dividendReinvest: true,
      leverage: 3,
      entryDate: '2000-03-24',
      holdingPeriodBars: null,
      initialInvestment: 10_000,
      contributionAmount: 500,
      contributionFrequency: 'monthly',
      expenseRatioPercent: DEFAULT_EXPENSE_RATIO_PERCENT,
      financingSpreadPercent: DEFAULT_FINANCING_SPREAD_PERCENT,
    },
    tier: 'strict',
    // F-04: deliberately `single`, never `sweep` -- a single run calls solveIrr exactly once, so
    // this preset does not put the sweep's over-budget contribution branch in front of a user.
    mode: 'single',
    ...COMMON_FIELDS,
  },
  {
    id: 'spx-3x-entry-sensitivity',
    title: '3x S&P 500: does your entry date decide the answer?',
    whyThisWindow:
      'D-12: the one preset in the library that opens the sweep rather than a single defensible answer -- ' +
      "its whole argument is that the result is not cherry-picked, which a single entry date cannot itself " +
      'demonstrate.',
    outcomeMetric: 'finalValueMultiple',
    featured: false,
    tags: [],
    request: {
      ...COMMON_REQUEST_FIELDS,
      symbol: 'SPX',
      leverage: 3,
      entryDate: '1988-01-05',
      holdingPeriodBars: null,
      expenseRatioPercent: DEFAULT_EXPENSE_RATIO_PERCENT,
      financingSpreadPercent: DEFAULT_FINANCING_SPREAD_PERCENT,
    },
    tier: 'strict',
    mode: 'sweep',
    scale: 'log',
    metric: 'multiple',
  },
  {
    id: 'spx-3x-2010s',
    title: '3x S&P 500 through the 2010s in isolation',
    whyThisWindow:
      "Roadmap criterion 3's flattering window: a decade-long bull run with no crash inside it, isolated so " +
      "it cannot be read as cherry-picked from a longer, harder-to-verify span.",
    outcomeMetric: 'finalValueMultiple',
    featured: false,
    tags: [],
    request: {
      ...COMMON_REQUEST_FIELDS,
      symbol: 'SPX',
      leverage: 3,
      entryDate: '2010-01-04',
      holdingPeriodBars: 2516,
      expenseRatioPercent: DEFAULT_EXPENSE_RATIO_PERCENT,
      financingSpreadPercent: DEFAULT_FINANCING_SPREAD_PERCENT,
    },
    tier: 'strict',
    mode: 'single',
    ...COMMON_FIELDS,
  },
  {
    id: 'upro-since-inception',
    title: 'UPRO since inception',
    whyThisWindow:
      'D-15: the fourth featured slot and the one flattering real-fund entry in the featured row -- real ' +
      "UPRO history from its own first trading day, no synthetic construction anywhere in the run.",
    outcomeMetric: 'finalValueMultiple',
    featured: true,
    tags: [],
    request: {
      ...COMMON_REQUEST_FIELDS,
      symbol: 'UPRO',
      leverage: 1,
      entryDate: '2009-06-25',
      holdingPeriodBars: null,
      // D-16: real-fund preset -- leverage 1.0 AND expense ratio exactly 0, asserted by test.
      expenseRatioPercent: 0,
      financingSpreadPercent: 0,
    },
    tier: 'strict',
    mode: 'single',
    ...COMMON_FIELDS,
  },
])

/** Looks up a preset definition by id, or `undefined` when no preset carries that id. */
export function presetById(id: string): PresetDefinition | undefined {
  return PRESET_DEFINITIONS.find((preset) => preset.id === id)
}

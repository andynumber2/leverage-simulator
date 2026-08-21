/**
 * src/app/parameter-defaults.ts
 *
 * CRED-05/D-22: one registry naming every shipped default and how to return to it, so a control's
 * "default" badge and its "Reset" affordance can never drift from each other or from what the
 * store was actually seeded with (T-05-23). Every entry but `entryDate` reads/writes
 * `backtestRequest()`/`updateBacktestRequest()` (or `activeTier()`/`setActiveTier()` for `tier`)
 * directly against `DEFAULT_REQUEST` -- the same store-level constant `src/app/state.ts` seeds
 * itself from, now exported so this file never re-declares a literal default value of its own.
 * `reset()` always writes through the same store setter an edit to that value would use
 * (T-05-22), never a raw write, so it can never itself produce an invalid state.
 *
 * `entryDate` is the one exception in kind, not in discipline (05-08-PLAN.md Task 1): its shipped
 * default is not a literal but a manifest-resolved date -- the STRICT tier's earliest date for the
 * current symbol and dividend mode, matching `applyLoadedBundle`'s own default-landing-run
 * resolution (05-05/A4: always the strict tier, regardless of the currently selected
 * `activeTier()`, so the badge can never disagree with what a fresh landing run would compute).
 * `resolveEntryDateDefaultBounds`/`entryDateIsDefault` are exported as plain functions that take
 * the manifest explicitly, so they are unit-testable against a synthetic manifest fixture without
 * booting the whole app (`tests/app/parameter-defaults.test.ts`); `PARAMETER_DEFAULTS.entryDate`
 * is a thin wrapper over them that reads the live `loadedBundle()`/`backtestRequest()` signals, the
 * same way every other entry reads `backtestRequest()` directly.
 */

import type { Manifest } from '../../tools/bundle-compiler/src/manifest.ts'
import { resolveEntryDateBounds, type EntryDateBoundsResult } from './bounds.ts'
import { activeTier, backtestRequest, DEFAULT_REQUEST, loadedBundle, setActiveTier, updateBacktestRequest } from './state.ts'

/** D-22's ten defaulted parameters: leverage, entry date, holding mode, initial investment,
 * contribution amount, contribution frequency, tier, dividend mode, expense ratio and financing
 * spread -- every parameter D-22 names, none more, none fewer. `Record<ParameterId, ...>` below
 * makes TypeScript reject a missing or extra member if this union ever changes. */
export type ParameterId =
  | 'leverage'
  | 'entryDate'
  | 'holdingMode'
  | 'initialInvestment'
  | 'contributionAmount'
  | 'contributionFrequency'
  | 'tier'
  | 'dividendMode'
  | 'expenseRatio'
  | 'financingSpread'

export interface ParameterDefaultEntry {
  /** True when the live store currently holds this parameter's shipped default. */
  isDefault: () => boolean
  /** Writes the shipped default back through the same validated setter an edit to that value
   * would use (T-05-22). Never throws: a parameter whose default cannot currently be resolved
   * (only possible for `entryDate`, before a manifest has loaded or for a series lacking a
   * strict-tier range) is a no-op rather than a partial or thrown write. */
  reset: () => void
}

/** `entryDate`'s exception (see module header): resolved against the STRICT tier always, never
 * the live `activeTier()` -- mirrors `applyLoadedBundle`'s own A4 anchor so the badge/reset can
 * never disagree with what a fresh landing run resolves to. Returns `null` rather than throwing
 * when no manifest is loaded yet; delegates the "series exists / has a strict range" cases to
 * `resolveEntryDateBounds`'s own discriminated result, which already returns `{ ok: false }`
 * rather than throwing for either miss (D-32's "explicit sentinel for an expected edge" split). */
export function resolveEntryDateDefaultBounds(
  manifest: Manifest | null,
  symbol: string,
  dividendReinvest: boolean,
): EntryDateBoundsResult | null {
  if (manifest === null) return null
  return resolveEntryDateBounds(manifest, symbol, dividendReinvest, 'strict')
}

/** True exactly when `entryDate` equals the manifest-resolved strict-tier earliest date for
 * `symbol`/`dividendReinvest` -- false (never a throw) when no manifest is loaded, the symbol has
 * no such series, or the series carries no strict-tier range at all. */
export function entryDateIsDefault(
  manifest: Manifest | null,
  symbol: string,
  dividendReinvest: boolean,
  entryDate: string,
): boolean {
  const resolved = resolveEntryDateDefaultBounds(manifest, symbol, dividendReinvest)
  return resolved !== null && resolved.ok && resolved.firstDate === entryDate
}

export const PARAMETER_DEFAULTS: Record<ParameterId, ParameterDefaultEntry> = {
  leverage: {
    isDefault: () => backtestRequest().leverage === DEFAULT_REQUEST.leverage,
    reset: () => updateBacktestRequest({ leverage: DEFAULT_REQUEST.leverage }),
  },
  entryDate: {
    isDefault: () => {
      const request = backtestRequest()
      return entryDateIsDefault(
        loadedBundle()?.manifest ?? null,
        request.symbol,
        request.dividendReinvest,
        request.entryDate,
      )
    },
    reset: () => {
      const request = backtestRequest()
      const resolved = resolveEntryDateDefaultBounds(
        loadedBundle()?.manifest ?? null,
        request.symbol,
        request.dividendReinvest,
      )
      if (resolved !== null && resolved.ok) {
        updateBacktestRequest({ entryDate: resolved.firstDate })
      }
    },
  },
  holdingMode: {
    isDefault: () => backtestRequest().holdingPeriodBars === DEFAULT_REQUEST.holdingPeriodBars,
    reset: () => updateBacktestRequest({ holdingPeriodBars: DEFAULT_REQUEST.holdingPeriodBars }),
  },
  initialInvestment: {
    isDefault: () => backtestRequest().initialInvestment === DEFAULT_REQUEST.initialInvestment,
    reset: () => updateBacktestRequest({ initialInvestment: DEFAULT_REQUEST.initialInvestment }),
  },
  contributionAmount: {
    isDefault: () => backtestRequest().contributionAmount === DEFAULT_REQUEST.contributionAmount,
    // Mirrors ContributionControl's own empty-input path (UI-SPEC E4 empty): clearing the amount
    // resets the frequency alongside it -- an amount with no frequency selected is unreachable,
    // the same invariant this write preserves rather than leaving frequency stranded off-default.
    reset: () =>
      updateBacktestRequest({
        contributionAmount: DEFAULT_REQUEST.contributionAmount,
        contributionFrequency: DEFAULT_REQUEST.contributionFrequency,
      }),
  },
  contributionFrequency: {
    isDefault: () => backtestRequest().contributionFrequency === DEFAULT_REQUEST.contributionFrequency,
    reset: () => updateBacktestRequest({ contributionFrequency: DEFAULT_REQUEST.contributionFrequency }),
  },
  tier: {
    isDefault: () => activeTier() === 'strict',
    reset: () => setActiveTier('strict'),
  },
  dividendMode: {
    isDefault: () => backtestRequest().dividendReinvest === DEFAULT_REQUEST.dividendReinvest,
    reset: () => updateBacktestRequest({ dividendReinvest: DEFAULT_REQUEST.dividendReinvest }),
  },
  expenseRatio: {
    isDefault: () => backtestRequest().expenseRatioPercent === DEFAULT_REQUEST.expenseRatioPercent,
    reset: () => updateBacktestRequest({ expenseRatioPercent: DEFAULT_REQUEST.expenseRatioPercent }),
  },
  financingSpread: {
    isDefault: () => backtestRequest().financingSpreadPercent === DEFAULT_REQUEST.financingSpreadPercent,
    reset: () => updateBacktestRequest({ financingSpreadPercent: DEFAULT_REQUEST.financingSpreadPercent }),
  },
}

// --- Compile-time exhaustiveness check, mirroring cost-parameters.ts's own pattern -------------
type ParameterIdsPresent = keyof typeof PARAMETER_DEFAULTS
type _AssertAllParameterIdsPresent = ParameterId extends ParameterIdsPresent ? true : never
type _AssertNoExtraParameterIds = ParameterIdsPresent extends ParameterId ? true : never
const _parameterDefaultsExhaustivenessCheck: [_AssertAllParameterIdsPresent, _AssertNoExtraParameterIds] = [true, true]
void _parameterDefaultsExhaustivenessCheck

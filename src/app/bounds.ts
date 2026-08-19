/**
 * src/app/bounds.ts
 *
 * Pure resolution of the symbol list, dividend-mode availability and entry-date bounds from the
 * manifest (D-09, D-12). No I/O and no Solid import: every export is a pure function over a
 * decoded `Manifest`. An unknown symbol or an absent series returns a discriminated result rather
 * than throwing, so a hand-edited permalink routes to the explanation path instead of crashing
 * the app -- matching the repo's existing "explicit sentinel for an expected edge, thrown Error
 * for a programmer error" split (`src/data/kernel-inputs.ts`'s SIM-07 miss).
 */

import type { Manifest } from '../../tools/bundle-compiler/src/manifest.ts'

/** The shared short-rate series (scope '@rate') is not a selectable symbol; excluded by its
 * leading '@' rather than by name, so any future shared, non-selectable scope is excluded the
 * same way without a second special case. */
const NON_SELECTABLE_SCOPE_PREFIX = '@'

/**
 * The selectable bundled universe: every distinct `series[].scope` except a scope beginning with
 * '@' (e.g. '@rate'), deduplicated and sorted ascending. The sort is the ordering contract D-12/
 * DATA-08 requires: it is stable and value-derived, so the symbol select renders identically on
 * every load and two screenshots of the same bundle agree.
 */
export function listSymbols(manifest: Manifest): string[] {
  const scopes = new Set<string>()
  for (const series of manifest.series) {
    if (series.scope.startsWith(NON_SELECTABLE_SCOPE_PREFIX)) continue
    scopes.add(series.scope)
  }
  return Array.from(scopes).sort()
}

/** Which of a symbol's two dividend-mode series the manifest actually carries. */
export interface DividendModes {
  totalReturn: boolean
  priceReturn: boolean
}

/**
 * Reports which of `${symbol}/total-return` and `${symbol}/price-return` the manifest carries,
 * so `SymbolControl`'s dividend toggle can be disabled with a stated reason rather than offering a
 * mode that resolves to nothing (UI-SPEC E1 partial).
 */
export function dividendModesFor(manifest: Manifest, symbol: string): DividendModes {
  return {
    totalReturn: manifest.series.some((s) => s.id === `${symbol}/total-return`),
    priceReturn: manifest.series.some((s) => s.id === `${symbol}/price-return`),
  }
}

/** D-09: Phase 4 pins 'strict' throughout, but the type carries both members from day one so
 * Phase 5 adds a tier-selector control over an existing parameter rather than migrating one in. */
export type Tier = 'strict' | 'extended'

export type EntryDateBoundsResult =
  | { ok: true; firstDate: string; lastDate: string }
  | { ok: false; reason: string }

/**
 * Resolves the selected series' `tiers[tier]` range. An unknown symbol, a symbol lacking the
 * requested dividend mode, or a series whose requested tier is `null` (`computeTierRanges` can
 * return `null` when no in-range data survives the tier's narrowing) all return `{ ok: false }`
 * naming the cause, never throw.
 */
export function resolveEntryDateBounds(
  manifest: Manifest,
  symbol: string,
  dividendReinvest: boolean,
  tier: Tier,
): EntryDateBoundsResult {
  const seriesId = `${symbol}/${dividendReinvest ? 'total-return' : 'price-return'}`
  const entry = manifest.series.find((s) => s.id === seriesId)
  if (entry === undefined) {
    const existingIds = manifest.series.map((s) => s.id).sort()
    return {
      ok: false,
      reason:
        `bounds: no series named "${seriesId}" in the loaded bundle manifest; existing series ids: ` +
        existingIds.join(', '),
    }
  }

  const range = entry.tiers[tier]
  if (range === null) {
    return {
      ok: false,
      reason: `bounds: series "${seriesId}" has no ${tier}-tier date range in the loaded bundle manifest`,
    }
  }

  return { ok: true, firstDate: range.firstDate, lastDate: range.lastDate }
}

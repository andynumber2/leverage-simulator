/**
 * tests/app/parameter-defaults.test.ts
 *
 * 05-08-PLAN.md Task 1's case list, run in the Node `unit` project. `PARAMETER_DEFAULTS`'s nine
 * store-backed entries are exercised directly against the real `src/app/state.ts` singleton (the
 * same module every control imports) -- `requestAnimationFrame` is stubbed to a no-op so
 * `updateBacktestRequest`/`setActiveTier`'s `scheduleRun()` call never tries to run a recompute
 * against a bundle this suite never loads (mirrors `permalink-methodology.test.ts`'s own stub).
 * The tenth, `entryDate`, is the one exception in kind (`parameter-defaults.ts`'s module header):
 * its exported pure functions (`resolveEntryDateDefaultBounds`/`entryDateIsDefault`) are tested
 * directly against a synthetic manifest fixture built here, so its manifest-resolution behavior is
 * covered without booting a real bundle fetch; its registry-entry form
 * (`PARAMETER_DEFAULTS.entryDate`) is exercised in the one state that requires no bundle at all --
 * `loadedBundle()` staying `null` for this suite's whole run -- to prove `isDefault`/`reset` degrade
 * to false/no-op rather than throwing when no manifest has loaded yet.
 */

import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'

import type { Manifest } from '../../tools/bundle-compiler/src/manifest.ts'
import {
  entryDateIsDefault,
  PARAMETER_DEFAULTS,
  resolveEntryDateDefaultBounds,
  type ParameterId,
} from '../../src/app/parameter-defaults.ts'
import {
  activeTier,
  backtestRequest,
  DEFAULT_REQUEST,
  resetAppState,
  resultMode,
  setActiveTier,
  setResultMode,
  updateBacktestRequest,
} from '../../src/app/state.ts'

beforeAll(() => {
  // updateBacktestRequest/setActiveTier both call scheduleRun(), which schedules a
  // requestAnimationFrame callback that never needs to run in this suite (no bundle is ever
  // loaded here) -- stubbed to a no-op so the Node `unit` project, which has no DOM, does not
  // throw on the missing global.
  ;(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0
})

beforeEach(() => {
  resetAppState()
})

afterEach(() => {
  resetAppState()
})

function buildManifestFixture(overrides: {
  seriesId?: string
  strictFirstDate?: string
  strictLastDate?: string
  hasStrictTier?: boolean
} = {}): Manifest {
  const seriesId = overrides.seriesId ?? 'SPX/total-return'
  const hasStrictTier = overrides.hasStrictTier ?? true
  const firstDate = overrides.strictFirstDate ?? '1988-01-05'
  const lastDate = overrides.strictLastDate ?? '2026-01-01'
  return {
    formatVersion: 1,
    bundleVersion: 'test-fixture',
    calendar: { file: 'calendar.bin', bytes: 0, length: 0, firstDate, lastDate },
    assets: [],
    series: [
      {
        id: seriesId,
        scope: seriesId.split('/')[0]!,
        kind: 'total-return',
        asset: 'spx-total-return.bin',
        calendarStartIndex: 0,
        length: 100,
        firstDate,
        lastDate,
        units: 'index',
        sources: [],
        seams: [],
        tiers: {
          strict: hasStrictTier ? { firstDate, lastDate } : null,
          extended: null,
        },
      },
    ],
    calendarExceptions: [],
  }
}

test('PARAMETER_DEFAULTS has exactly eleven entries: one per D-22 parameter, plus 07-06-PLAN.md Task 2\'s resultMode', () => {
  expect(Object.keys(PARAMETER_DEFAULTS).length).toBe(11)
})

const STORE_BACKED_CASES: Array<{
  id: ParameterId
  offDefault: () => void
  isNowDefault: () => boolean
}> = [
  {
    id: 'leverage',
    offDefault: () => updateBacktestRequest({ leverage: 5 }),
    isNowDefault: () => backtestRequest().leverage === 3,
  },
  {
    id: 'holdingMode',
    offDefault: () => updateBacktestRequest({ holdingPeriodBars: 252 }),
    isNowDefault: () => backtestRequest().holdingPeriodBars === null,
  },
  {
    id: 'initialInvestment',
    offDefault: () => updateBacktestRequest({ initialInvestment: 50_000 }),
    isNowDefault: () => backtestRequest().initialInvestment === 10_000,
  },
  {
    id: 'contributionAmount',
    offDefault: () => updateBacktestRequest({ contributionAmount: 200, contributionFrequency: 'monthly' }),
    isNowDefault: () => backtestRequest().contributionAmount === 0,
  },
  {
    id: 'contributionFrequency',
    offDefault: () => updateBacktestRequest({ contributionAmount: 200, contributionFrequency: 'yearly' }),
    isNowDefault: () => backtestRequest().contributionFrequency === 'none',
  },
  {
    id: 'tier',
    offDefault: () => setActiveTier('extended'),
    isNowDefault: () => activeTier() === 'strict',
  },
  {
    id: 'dividendMode',
    offDefault: () => updateBacktestRequest({ dividendReinvest: false }),
    isNowDefault: () => backtestRequest().dividendReinvest === true,
  },
  {
    id: 'expenseRatio',
    offDefault: () => updateBacktestRequest({ expenseRatioPercent: 1.5 }),
    isNowDefault: () => backtestRequest().expenseRatioPercent === DEFAULT_REQUEST.expenseRatioPercent,
  },
  {
    id: 'financingSpread',
    offDefault: () => updateBacktestRequest({ financingSpreadPercent: 1.2 }),
    isNowDefault: () => backtestRequest().financingSpreadPercent === DEFAULT_REQUEST.financingSpreadPercent,
  },
  {
    id: 'resultMode',
    offDefault: () => setResultMode('sweep'),
    isNowDefault: () => resultMode() === 'single',
  },
]

for (const { id, offDefault, isNowDefault } of STORE_BACKED_CASES) {
  test(`${id}: at-default predicate is true for the shipped default and false off it, and reset returns it to true`, () => {
    expect(PARAMETER_DEFAULTS[id].isDefault()).toBe(true)

    offDefault()
    expect(PARAMETER_DEFAULTS[id].isDefault()).toBe(false)

    PARAMETER_DEFAULTS[id].reset()
    expect(PARAMETER_DEFAULTS[id].isDefault()).toBe(true)
    expect(isNowDefault()).toBe(true)
  })
}

test('contributionAmount reset also clears contributionFrequency back to none, mirroring the control\'s own empty-input path', () => {
  updateBacktestRequest({ contributionAmount: 300, contributionFrequency: 'quarterly' })
  expect(backtestRequest().contributionFrequency).toBe('quarterly')

  PARAMETER_DEFAULTS.contributionAmount.reset()

  expect(backtestRequest().contributionAmount).toBe(0)
  expect(backtestRequest().contributionFrequency).toBe('none')
})

test('reset from an arbitrary off-default numeric value never throws and always lands on the shipped default', () => {
  updateBacktestRequest({ leverage: 19.99, initialInvestment: 999_999, expenseRatioPercent: 4.4, financingSpreadPercent: 3.3 })

  expect(() => {
    PARAMETER_DEFAULTS.leverage.reset()
    PARAMETER_DEFAULTS.initialInvestment.reset()
    PARAMETER_DEFAULTS.expenseRatio.reset()
    PARAMETER_DEFAULTS.financingSpread.reset()
  }).not.toThrow()

  expect(backtestRequest().leverage).toBe(DEFAULT_REQUEST.leverage)
  expect(backtestRequest().initialInvestment).toBe(DEFAULT_REQUEST.initialInvestment)
  expect(backtestRequest().expenseRatioPercent).toBe(DEFAULT_REQUEST.expenseRatioPercent)
  expect(backtestRequest().financingSpreadPercent).toBe(DEFAULT_REQUEST.financingSpreadPercent)
})

// --- entryDate: the manifest-resolved exception, tested against a synthetic manifest fixture ---

test('entryDateIsDefault is true for exactly the manifest-resolved strict-tier earliest date', () => {
  const manifest = buildManifestFixture({ strictFirstDate: '1988-01-05' })

  expect(entryDateIsDefault(manifest, 'SPX', true, '1988-01-05')).toBe(true)
  expect(entryDateIsDefault(manifest, 'SPX', true, '1990-01-02')).toBe(false)
})

test('entryDateIsDefault returns false, not a throw, when no manifest is loaded', () => {
  expect(() => entryDateIsDefault(null, 'SPX', true, '1988-01-05')).not.toThrow()
  expect(entryDateIsDefault(null, 'SPX', true, '1988-01-05')).toBe(false)
})

test('entryDateIsDefault returns false, not a throw, when the series carries no strict-tier range', () => {
  const manifest = buildManifestFixture({ hasStrictTier: false })

  expect(() => entryDateIsDefault(manifest, 'SPX', true, '1988-01-05')).not.toThrow()
  expect(entryDateIsDefault(manifest, 'SPX', true, '1988-01-05')).toBe(false)
})

test('entryDateIsDefault returns false, not a throw, for a symbol/dividend-mode combination the manifest does not carry', () => {
  const manifest = buildManifestFixture({ seriesId: 'SPX/total-return' })

  expect(() => entryDateIsDefault(manifest, 'SPX', false, '1988-01-05')).not.toThrow()
  expect(entryDateIsDefault(manifest, 'SPX', false, '1988-01-05')).toBe(false)
})

test('resolveEntryDateDefaultBounds resolves the strict tier regardless of what the extended tier carries', () => {
  const manifest = buildManifestFixture({ strictFirstDate: '1988-01-05', strictLastDate: '2026-01-01' })

  const resolved = resolveEntryDateDefaultBounds(manifest, 'SPX', true)
  expect(resolved).not.toBeNull()
  expect(resolved?.ok).toBe(true)
  if (resolved?.ok === true) {
    expect(resolved.firstDate).toBe('1988-01-05')
  }
})

test('resolveEntryDateDefaultBounds returns null (not a throw) for a null manifest', () => {
  expect(resolveEntryDateDefaultBounds(null, 'SPX', true)).toBeNull()
})

test('PARAMETER_DEFAULTS.entryDate.isDefault is false, and .reset is a no-op that never throws, while no bundle has loaded', () => {
  expect(PARAMETER_DEFAULTS.entryDate.isDefault()).toBe(false)

  const before = backtestRequest().entryDate
  expect(() => PARAMETER_DEFAULTS.entryDate.reset()).not.toThrow()
  expect(backtestRequest().entryDate).toBe(before)
})

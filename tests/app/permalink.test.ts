/**
 * tests/app/permalink.test.ts
 *
 * 04-07-PLAN.md Task 2: the fast-check round-trip property over the generated `PermalinkParams`
 * space (D-16's first half), the negative-case battery from <behavior> (T-04-01/T-04-03's total-
 * function proof), and four committed golden URLs run end to end against the real bundle, each
 * asserting IRR, CAGR, maximum drawdown and final value within a named tolerance (D-16's second
 * half -- the half a round-trip property alone cannot catch, since it never touches the kernel).
 *
 * 07-06-PLAN.md Task 1: extends the round-trip arbitrary and the negative-case battery to cover
 * `mode`/`metric`, and adds the backward-compatibility proof that a query string carrying neither
 * key (every golden fixture below, and every link generated before this plan shipped) still
 * decodes to `'ok'`, landing on Single run / the multiple-of-contributed metric (D-18).
 */

import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import { runBacktest } from '../../src/kernel/backtest.ts'
import { buildKernelInputs, type BacktestRequest } from '../../src/data/kernel-inputs.ts'
import { loadBundleFromDisk } from '../../src/data/load-bundle-node.ts'
import { buildCashFlows, solveIrr } from '../../src/metrics/irr.ts'
import { solveCagr } from '../../src/metrics/cagr.ts'
import { toDaysSinceEpoch } from '../../tools/bundle-compiler/src/calendar.ts'
import {
  decodeParams,
  encodeParams,
  PERMALINK_KEYS,
  type DecodeParamsResult,
  type PermalinkParams,
} from '../../src/app/permalink.ts'

// ---------------------------------------------------------------------------------------------
// Fast-check arbitraries
//
// Money/leverage/percent fields are generated as integer cents (or basis points) divided down to
// the field's own canonical decimal count, never as raw doubles snapped after the fact --
// `(cents / 100).toFixed(2)` and `Number(...)` are then genuinely stable inverses of one another
// for every value the arbitrary can produce, which is what makes the strict `toEqual` round-trip
// assertion below hold for the *entire* generated space rather than only by chance.
// ---------------------------------------------------------------------------------------------

function centsToAmount(cents: number): number {
  return cents / 100
}

function basisPointsToPercent(bp: number): number {
  return bp / 10_000
}

const leverageArb = fc.integer({ min: 1, max: 2000 }).map(centsToAmount) // 0.01 .. 20.00
const moneyArb = (maxCents: number) => fc.integer({ min: 0, max: maxCents }).map(centsToAmount)
const percentArb = fc.integer({ min: 0, max: 1_000_000 }).map(basisPointsToPercent) // 0.0000 .. 100.0000

const isoDateArb = fc
  .date({ min: new Date(Date.UTC(1900, 0, 1)), max: new Date(Date.UTC(2100, 11, 31)), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10))

const HEX_CHARS = '0123456789abcdef'.split('')
const bundleVersionArb = fc
  .array(fc.constantFrom(...HEX_CHARS), { minLength: 12, maxLength: 12 })
  .map((chars) => chars.join(''))

const holdModeAndBarsArb = fc.oneof(
  fc.record({
    holdMode: fc.constant('fixed' as const),
    holdingPeriodBars: fc.integer({ min: 0, max: 50_000 }),
  }),
  fc.record({
    holdMode: fc.constant('end-of-data' as const),
    holdingPeriodBars: fc.constant(null),
  }),
)

const permalinkParamsArb: fc.Arbitrary<PermalinkParams> = fc
  .record({
    symbol: fc.constantFrom('SPX', 'NDX', 'QQQ', 'TQQQ', 'UPRO', 'A', 'ZZZZZZZZZZ'),
    dividendReinvest: fc.boolean(),
    leverage: leverageArb,
    entryDate: isoDateArb,
    holdAndBars: holdModeAndBarsArb,
    resolvedEndDate: isoDateArb,
    initialInvestment: moneyArb(100_000_000_00),
    contributionAmount: moneyArb(1_000_000_00),
    contributionFrequency: fc.constantFrom('none', 'daily', 'monthly', 'quarterly', 'yearly'),
    expenseRatioPercent: percentArb,
    financingSpreadPercent: percentArb,
    tier: fc.constantFrom('strict', 'extended'),
    scale: fc.constantFrom('log', 'linear'),
    bundleVersion: bundleVersionArb,
    mode: fc.constantFrom('single', 'sweep'),
    metric: fc.constantFrom('multiple', 'drawdown', 'annualized'),
  })
  .map(({ holdAndBars, ...rest }) => ({ ...rest, ...holdAndBars }) as PermalinkParams)

/** A concrete `PermalinkParams` in "fixed" mode -- exercises all seventeen keys, including the
 * conditional `holdingPeriodBars`. Reused by several structural tests below. */
function fixedModeExample(overrides: Partial<PermalinkParams> = {}): PermalinkParams {
  return {
    symbol: 'SPX',
    dividendReinvest: true,
    leverage: 3,
    entryDate: '1990-01-02',
    holdingPeriodBars: 2520,
    initialInvestment: 10_000,
    contributionAmount: 0,
    contributionFrequency: 'none',
    expenseRatioPercent: 0.9,
    financingSpreadPercent: 0.5,
    holdMode: 'fixed',
    resolvedEndDate: '1999-12-20',
    tier: 'strict',
    scale: 'log',
    bundleVersion: '45a9f1ae6444',
    mode: 'single',
    metric: 'multiple',
    ...overrides,
  }
}

/** The same example in "end-of-data" mode -- `holdingPeriodBars` is `null` and must not appear on
 * the wire at all. */
function endOfDataExample(overrides: Partial<PermalinkParams> = {}): PermalinkParams {
  return {
    ...fixedModeExample(),
    holdMode: 'end-of-data',
    holdingPeriodBars: null,
    resolvedEndDate: '2026-08-14',
    ...overrides,
  }
}

describe('property: decodeParams(encodeParams(p)) round trip', () => {
  test('deep-equals the original params for every generated parameter set, in both hold modes', () => {
    fc.assert(
      fc.property(permalinkParamsArb, (params) => {
        const encoded = encodeParams(params)
        const decoded: DecodeParamsResult = decodeParams(encoded)
        expect(decoded.status).toBe('ok')
        if (decoded.status === 'ok') {
          expect(decoded.params).toEqual(params)
        }
      }),
      { numRuns: 300 },
    )
  })

  test('an explicit constant set of awkward values round-trips cleanly', () => {
    const awkward: PermalinkParams[] = [
      // A leverage arriving as a value that would round-trip differently through a bare
      // `toString` (Pitfall 5): `toFixed(2)` normalizes it to the canonical "3.00", and decoding
      // that canonical string gives back exactly 3 -- proving the fixed decimal count is what
      // the round trip actually depends on, not the original float's raw bit pattern.
      fixedModeExample({ leverage: 2.9999999999999996 }),
      // Float64 extremes for the money fields.
      endOfDataExample({ initialInvestment: Number.MAX_VALUE, contributionAmount: 0 }),
      // Zero contribution, explicitly.
      endOfDataExample({ contributionAmount: 0, contributionFrequency: 'none' }),
      // Earliest and latest dates this arbitrary space covers.
      fixedModeExample({ entryDate: '1900-01-01', resolvedEndDate: '1900-01-01' }),
      fixedModeExample({ entryDate: '2100-12-31', resolvedEndDate: '2100-12-31' }),
    ]

    for (const params of awkward) {
      const encoded = encodeParams(params)
      const decoded = decodeParams(encoded)
      expect(decoded.status).toBe('ok')
      if (decoded.status === 'ok') {
        // The normalized leverage case intentionally does not compare bit-for-bit against the
        // original 2.9999999999999996 -- `toFixed(2)` normalizing it to "3.00" is the documented
        // point of the fixed decimal count, not a bug the round trip should paper over.
        if (params.leverage === 2.9999999999999996) {
          expect(decoded.params.leverage).toBe(3)
        } else {
          expect(decoded.params).toEqual(params)
        }
      }
    }
  })
})

describe('permalink: tier round-trips independently of every other field', () => {
  test('a permalink carrying tier "strict" round-trips to tier "strict"', () => {
    const params = fixedModeExample({ tier: 'strict' })
    const decoded = decodeParams(encodeParams(params))
    expect(decoded.status).toBe('ok')
    if (decoded.status === 'ok') expect(decoded.params.tier).toBe('strict')
  })

  test('a permalink carrying tier "extended" round-trips to tier "extended"', () => {
    const params = fixedModeExample({ tier: 'extended' })
    const decoded = decodeParams(encodeParams(params))
    expect(decoded.status).toBe('ok')
    if (decoded.status === 'ok') expect(decoded.params.tier).toBe('extended')
  })

  test('a permalink carrying the extended tier decodes to the extended tier while every other decoded parameter is unaffected', () => {
    const strictDecoded = decodeParams(encodeParams(fixedModeExample({ tier: 'strict' })))
    const extendedDecoded = decodeParams(encodeParams(fixedModeExample({ tier: 'extended' })))
    expect(strictDecoded.status).toBe('ok')
    expect(extendedDecoded.status).toBe('ok')
    if (strictDecoded.status === 'ok' && extendedDecoded.status === 'ok') {
      expect(extendedDecoded.params.tier).toBe('extended')
      // Swap the tier back and the two decoded objects must be identical -- proving tier is the
      // one field that differs and no other field was disturbed by the tier change.
      expect({ ...extendedDecoded.params, tier: strictDecoded.params.tier }).toEqual(strictDecoded.params)
    }
  })
})

describe('encodeParams: determinism and key order', () => {
  test('called twice on the same parameter set produces byte-identical query strings', () => {
    const params = fixedModeExample()
    const first = encodeParams(params).toString()
    const second = encodeParams(params).toString()
    expect(first).toBe(second)
  })

  test('emits all seventeen keys, in PERMALINK_KEYS order, in "fixed" hold mode', () => {
    const encoded = encodeParams(fixedModeExample())
    expect(Array.from(encoded.keys())).toEqual([...PERMALINK_KEYS])
  })

  test('omits holdingPeriodBars, emitting the other sixteen keys in PERMALINK_KEYS order, in "end-of-data" hold mode', () => {
    const encoded = encodeParams(endOfDataExample())
    const expectedKeys = PERMALINK_KEYS.filter((key) => key !== 'holdingPeriodBars')
    expect(Array.from(encoded.keys())).toEqual([...expectedKeys])
    expect(encoded.has('holdingPeriodBars')).toBe(false)
  })

  test('PERMALINK_KEYS carries exactly the seventeen keys the checkpoint decided plus 07-06\'s mode/metric extension', () => {
    expect(PERMALINK_KEYS.length).toBe(17)
    expect(PERMALINK_KEYS).toContain('mode')
    expect(PERMALINK_KEYS).toContain('metric')
  })
})

describe('permalink: mode/metric (07-06-PLAN.md Task 1, D-04)', () => {
  test('round-trips every mode-by-metric combination (2 modes x 3 metrics = 6 cases)', () => {
    const modes = ['single', 'sweep'] as const
    const metrics = ['multiple', 'drawdown', 'annualized'] as const
    for (const mode of modes) {
      for (const metric of metrics) {
        const params = fixedModeExample({ mode, metric })
        const decoded = decodeParams(encodeParams(params))
        expect(decoded.status).toBe('ok')
        if (decoded.status === 'ok') {
          expect(decoded.params.mode).toBe(mode)
          expect(decoded.params.metric).toBe(metric)
        }
      }
    }
  })

  test('a URL with no "mode" key decodes to Single run (D-18) -- every link shared before this plan keeps working', () => {
    const qs = encodeParams(fixedModeExample({ mode: 'sweep' }))
    qs.delete('mode')
    const decoded = decodeParams(qs)
    expect(decoded.status).toBe('ok')
    if (decoded.status === 'ok') expect(decoded.params.mode).toBe('single')
  })

  test('a URL with no "metric" key decodes to the multiple-of-contributed default', () => {
    const qs = encodeParams(fixedModeExample({ metric: 'drawdown' }))
    qs.delete('metric')
    const decoded = decodeParams(qs)
    expect(decoded.status).toBe('ok')
    if (decoded.status === 'ok') expect(decoded.params.metric).toBe('multiple')
  })

  test('a URL carrying neither "mode" nor "metric" (pre-07-06 shape) still decodes to "ok"', () => {
    const qs = encodeParams(fixedModeExample())
    qs.delete('mode')
    qs.delete('metric')
    const decoded = decodeParams(qs)
    expect(decoded.status).toBe('ok')
    if (decoded.status === 'ok') {
      expect(decoded.params.mode).toBe('single')
      expect(decoded.params.metric).toBe('multiple')
    }
  })

  test('an unrecognized mode value is rejected loudly, naming the offending value', () => {
    const qs = encodeParams(fixedModeExample())
    qs.set('mode', 'both')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toContain('mode')
      expect(result.error).toContain('both')
    }
  })

  test('an unrecognized metric value is rejected loudly, naming the offending value', () => {
    const qs = encodeParams(fixedModeExample())
    qs.set('metric', 'sharpe')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toContain('metric')
      expect(result.error).toContain('sharpe')
    }
  })

  test('a duplicated "mode" key decodes to a named error identifying the duplicated key', () => {
    const qs = encodeParams(fixedModeExample())
    qs.append('mode', 'sweep')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('mode')
  })

  test('no key is added for the zoom or pan viewport (D-35)', () => {
    expect(PERMALINK_KEYS).not.toContain('zoom')
    expect(PERMALINK_KEYS).not.toContain('pan')
    expect(PERMALINK_KEYS).not.toContain('viewport')
  })
})

describe('decodeParams: the empty-query "use the default landing run" signal', () => {
  test('an empty URLSearchParams decodes to a named "no parameters" result, not a partially defaulted object', () => {
    const result = decodeParams(new URLSearchParams())
    expect(result.status).toBe('empty')
  })
})

describe('decodeParams: negative cases, each naming the offending key', () => {
  function encodedFixed(): URLSearchParams {
    return encodeParams(fixedModeExample())
  }

  test('a query string missing a required key decodes to a named error identifying that key', () => {
    const qs = encodedFixed()
    qs.delete('symbol')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('symbol')
  })

  test('a query string carrying one key twice decodes to a named error identifying the duplicated key', () => {
    const qs = encodedFixed()
    qs.append('leverage', '5.00')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('leverage')
  })

  test('a query string carrying an unknown extra key decodes to a named error identifying it, rather than ignoring it', () => {
    const qs = encodedFixed()
    qs.set('bogusKey', 'x')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('bogusKey')
  })

  test('an unrecognized holdMode value is rejected loudly rather than silently defaulted', () => {
    const qs = encodedFixed()
    qs.set('holdMode', 'today')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('holdMode')
  })

  test('holdMode "fixed" without holdingPeriodBars decodes to a named error identifying it', () => {
    const qs = encodedFixed()
    qs.delete('holdingPeriodBars')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('holdingPeriodBars')
  })

  test('holdMode "end-of-data" carrying a holdingPeriodBars decodes to a named error identifying it', () => {
    const qs = encodeParams(endOfDataExample())
    qs.set('holdingPeriodBars', '10')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('holdingPeriodBars')
  })

  test('a leverage of exactly 0 decodes to a named error', () => {
    const qs = encodedFixed()
    qs.set('leverage', '0.00')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('leverage')
  })

  test('a negative leverage decodes to a named error', () => {
    const qs = encodedFixed()
    qs.set('leverage', '-3.00')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('leverage')
  })

  test('a non-numeric leverage decodes to a named error', () => {
    const qs = encodedFixed()
    qs.set('leverage', 'not-a-number')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('leverage')
  })

  test('an out-of-band date decodes to a named error', () => {
    const qs = encodedFixed()
    qs.set('entryDate', '2024-02-30')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('entryDate')
  })

  test('a malformed bundleVersion decodes to a named error', () => {
    const qs = encodedFixed()
    qs.set('bundleVersion', 'not-hex!')
    const result = decodeParams(qs)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toContain('bundleVersion')
  })

  test('never throws for a battery of adversarial input, including prototype-polluting key names', () => {
    const adversarialQueryStrings = [
      '__proto__=x&constructor=y&prototype=z',
      'symbol=SPX&__proto__[polluted]=true',
      'a=b&c=d&e=f',
      'holdMode=fixed',
      'leverage=%00%00%00',
      'entryDate=' + 'A'.repeat(10_000),
      '=&=&=',
    ]

    for (const raw of adversarialQueryStrings) {
      let threw = false
      let result: DecodeParamsResult | undefined
      try {
        result = decodeParams(new URLSearchParams(raw))
      } catch {
        threw = true
      }
      expect(threw).toBe(false)
      expect(result).toBeDefined()
      expect(['empty', 'error', 'ok']).toContain(result!.status)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// Golden runs (D-16's second half): each URL below is a full, byte-fixed permalink. Decoding it,
// loading the real committed bundle, running the kernel end to end and deriving the metrics must
// reproduce the recorded numbers within GOLDEN_TOLERANCE / GOLDEN_FINAL_VALUE_RELATIVE_TOLERANCE
// -- values computed once against this repo's committed public/data bundle and pinned here.
// ---------------------------------------------------------------------------------------------

/** Absolute tolerance for the three fractional metrics (IRR, CAGR, max drawdown), all bounded
 * within roughly [-1, 10]. Float64 kernel arithmetic is deterministic within a single JS engine
 * but not guaranteed bit-identical across engines (D-16), so golden assertions compare within
 * this tolerance rather than requiring exact equality. */
const GOLDEN_METRIC_TOLERANCE = 1e-6

/** Relative tolerance for the final portfolio value, which spans a few thousand dollars to
 * several million depending on the run -- a single absolute tolerance would be either too loose
 * for a small run or unreasonably tight for a large one. */
const GOLDEN_FINAL_VALUE_RELATIVE_TOLERANCE = 1e-9

interface GoldenFixture {
  name: string
  url: string
  expected: {
    finalValue: number
    maxDrawdown: number
    irr: number | null
    cagr: number | null
  }
}

const GOLDEN_FIXTURES: GoldenFixture[] = [
  {
    // Default landing run: SPX 3x, dividends reinvested, hold to end of data.
    name: 'default landing run (SPX 3x, hold to end of data)',
    url:
      'https://leverage-simulator.example/?symbol=SPX&dividendReinvest=true&leverage=3.00&entryDate=1988-01-05' +
      '&holdMode=end-of-data&resolvedEndDate=2026-08-14&initialInvestment=10000.00&contributionAmount=0.00' +
      '&contributionFrequency=none&expenseRatioPercent=0.9000&financingSpreadPercent=0.5000&tier=strict' +
      '&scale=log&bundleVersion=45a9f1ae6444',
    expected: {
      finalValue: 2836207.487403993,
      maxDrawdown: 0.9820252916133559,
      irr: 0.15741301159885368,
      cagr: 0.157413011598855,
    },
  },
  {
    // Monthly-contribution run, fixed 10-year holding period: IRR and CAGR genuinely differ
    // because of the recurring $500/mo contributions weighing IRR's money-weighted return down
    // relative to CAGR's beginning-to-end growth figure.
    name: 'monthly contribution run (SPX 2x, fixed 10y, $500/mo)',
    url:
      'https://leverage-simulator.example/?symbol=SPX&dividendReinvest=true&leverage=2.00&entryDate=2000-01-03' +
      '&holdMode=fixed&holdingPeriodBars=2520&resolvedEndDate=2010-01-08&initialInvestment=10000.00' +
      '&contributionAmount=500.00&contributionFrequency=monthly&expenseRatioPercent=0.9000' +
      '&financingSpreadPercent=0.5000&tier=strict&scale=log&bundleVersion=45a9f1ae6444',
    expected: {
      finalValue: 50574.635256014095,
      maxDrawdown: 0.8100573656613681,
      irr: -0.05856793435322866,
      cagr: 0.17554518433399813,
    },
  },
  {
    // High-leverage, dot-com-crash-entry run that ruins: pins the -100% IRR and the drawdown of 1
    // the D-08/kernel ruin convention guarantees.
    name: 'high leverage ruin (NDX 20x, entered 2000-03-24, hold to end of data)',
    url:
      'https://leverage-simulator.example/?symbol=NDX&dividendReinvest=false&leverage=20.00&entryDate=2000-03-24' +
      '&holdMode=end-of-data&resolvedEndDate=2026-08-14&initialInvestment=10000.00&contributionAmount=0.00' +
      '&contributionFrequency=none&expenseRatioPercent=0.9000&financingSpreadPercent=0.5000&tier=strict' +
      '&scale=log&bundleVersion=45a9f1ae6444',
    expected: {
      finalValue: 0,
      maxDrawdown: 1,
      irr: -1,
      cagr: -1,
    },
  },
  {
    // Fixed-holding-period run: exercises the "fixed" holdMode/holdingPeriodBars branch on a run
    // that neither ruins nor overruns the data.
    name: 'fixed holding period run (SPX 3x, entered 1990-01-02, 2520 bars)',
    url:
      'https://leverage-simulator.example/?symbol=SPX&dividendReinvest=true&leverage=3.00&entryDate=1990-01-02' +
      '&holdMode=fixed&holdingPeriodBars=2520&resolvedEndDate=1999-12-20&initialInvestment=10000.00' +
      '&contributionAmount=0.00&contributionFrequency=none&expenseRatioPercent=0.9000' +
      '&financingSpreadPercent=0.5000&tier=strict&scale=log&bundleVersion=45a9f1ae6444',
    expected: {
      finalValue: 204038.15743983054,
      maxDrawdown: 0.5166979825611135,
      irr: 0.3532157378294841,
      cagr: 0.35321573782947335,
    },
  },
]

describe('golden runs: a committed permalink URL reproduces its recorded metrics', () => {
  for (const fixture of GOLDEN_FIXTURES) {
    test(fixture.name, async () => {
      const url = new URL(fixture.url)
      const decoded = decodeParams(url.searchParams)
      expect(decoded.status).toBe('ok')
      if (decoded.status !== 'ok') return

      const { params } = decoded
      const request: BacktestRequest = {
        symbol: params.symbol,
        dividendReinvest: params.dividendReinvest,
        leverage: params.leverage,
        entryDate: params.entryDate,
        holdingPeriodBars: params.holdingPeriodBars,
        initialInvestment: params.initialInvestment,
        contributionAmount: params.contributionAmount,
        contributionFrequency: params.contributionFrequency,
        expenseRatioPercent: params.expenseRatioPercent,
        financingSpreadPercent: params.financingSpreadPercent,
      }

      const bundle = await loadBundleFromDisk()
      const inputs = buildKernelInputs(bundle, request)
      const result = runBacktest(inputs.params, inputs.series, inputs.outputs)

      const cashFlows = buildCashFlows(inputs.params, inputs.series, inputs.outputs, result)
      const irr = solveIrr(cashFlows)
      const calendarDays = toDaysSinceEpoch(inputs.window.lastDate) - toDaysSinceEpoch(inputs.window.firstDate)
      const cagr = solveCagr(inputs.params.initialInvestment, result.finalValue, calendarDays)

      const finalValueRelativeError =
        Math.abs(result.finalValue - fixture.expected.finalValue) / Math.max(1, Math.abs(fixture.expected.finalValue))
      expect(finalValueRelativeError).toBeLessThanOrEqual(GOLDEN_FINAL_VALUE_RELATIVE_TOLERANCE)

      expect(Math.abs(result.maxDrawdown - fixture.expected.maxDrawdown)).toBeLessThanOrEqual(GOLDEN_METRIC_TOLERANCE)

      expect(irr).not.toBeNull()
      expect(fixture.expected.irr).not.toBeNull()
      if (irr !== null && fixture.expected.irr !== null) {
        expect(Math.abs(irr - fixture.expected.irr)).toBeLessThanOrEqual(GOLDEN_METRIC_TOLERANCE)
      }

      expect(cagr).not.toBeNull()
      expect(fixture.expected.cagr).not.toBeNull()
      if (cagr !== null && fixture.expected.cagr !== null) {
        expect(Math.abs(cagr - fixture.expected.cagr)).toBeLessThanOrEqual(GOLDEN_METRIC_TOLERANCE)
      }
    })
  }
})

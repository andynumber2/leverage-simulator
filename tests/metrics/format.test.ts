/**
 * tests/metrics/format.test.ts
 *
 * 04-02-PLAN.md Task 2's formatting cases plus the never-NaN/never-Infinity guarantee over the
 * float64 extremes (mirroring the `fc.constantFrom(0, -0, Number.MAX_VALUE, -Number.MAX_VALUE,
 * Number.MIN_VALUE, -Number.MIN_VALUE)` generator already used in
 * `tools/bundle-compiler/tests/roundtrip.test.ts`).
 */

import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import { formatCurrency, formatMultiple, formatPercent, formatSignedCurrency, formatSignedPercent } from '../../src/metrics/format.ts'

describe('formatPercent', () => {
  test('renders 0.0342 as 3.42%', () => {
    expect(formatPercent(0.0342)).toBe('3.42%')
  })

  test('renders -1 as -100.00%, the total-loss boundary value', () => {
    expect(formatPercent(-1)).toBe('-100.00%')
  })

  test('renders null as the undefined placeholder', () => {
    expect(formatPercent(null)).not.toMatch(/NaN|Infinity/)
  })
})

describe('formatMultiple', () => {
  test('renders 1.5 as 1.50x', () => {
    expect(formatMultiple(1.5)).toBe('1.50x')
  })

  test('renders 4.2e7 as scientific notation rather than a fifteen-character integer', () => {
    const rendered = formatMultiple(4.2e7)
    expect(rendered).toMatch(/e\+?\d/)
    expect(rendered.length).toBeLessThan(15)
  })
})

describe('formatCurrency', () => {
  test('renders a grouped whole-dollar figure with no fractional cents', () => {
    expect(formatCurrency(10_000)).toBe('$10,000')
  })
})

describe('formatSignedCurrency', () => {
  test('renders a positive amount with a leading +', () => {
    expect(formatSignedCurrency(1234)).toBe('+$1,234')
  })

  test('renders a negative amount with a leading -, not "$-"', () => {
    expect(formatSignedCurrency(-1234)).toBe('-$1,234')
  })

  test('renders exactly zero with no sign', () => {
    expect(formatSignedCurrency(0)).toBe('$0')
  })

  test('renders -0 with no sign', () => {
    expect(formatSignedCurrency(-0)).toBe('$0')
  })

  test('renders null as the undefined placeholder', () => {
    expect(formatSignedCurrency(null)).not.toMatch(/NaN|Infinity/)
  })

  test('renders Infinity as the undefined placeholder, not "+Infinity"', () => {
    const rendered = formatSignedCurrency(Number.POSITIVE_INFINITY)
    expect(rendered).not.toMatch(/NaN|Infinity/)
  })
})

describe('formatSignedPercent', () => {
  test('renders a positive fraction with a leading +', () => {
    expect(formatSignedPercent(0.0342)).toBe('+3.42%')
  })

  test('renders a negative fraction with a leading -, not "-3.42%" doubled', () => {
    expect(formatSignedPercent(-0.0342)).toBe('-3.42%')
  })

  test('renders exactly zero with no sign', () => {
    expect(formatSignedPercent(0)).toBe('0.00%')
  })

  test('renders -0 with no sign', () => {
    expect(formatSignedPercent(-0)).toBe('0.00%')
  })

  test('renders null as the undefined placeholder', () => {
    expect(formatSignedPercent(null)).not.toMatch(/NaN|Infinity/)
  })

  test('renders Infinity as the undefined placeholder, not "+Infinity"', () => {
    const rendered = formatSignedPercent(Number.POSITIVE_INFINITY)
    expect(rendered).not.toMatch(/NaN|Infinity/)
  })
})

const FLOAT64_EXTREMES = fc.constantFrom(
  0,
  -0,
  Number.MAX_VALUE,
  -Number.MAX_VALUE,
  Number.MIN_VALUE,
  -Number.MIN_VALUE,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
)

describe('no formatter ever emits a string containing NaN or Infinity', () => {
  test('formatPercent over the float64 extremes and null', () => {
    fc.assert(
      fc.property(fc.option(FLOAT64_EXTREMES, { nil: null }), (value) => {
        expect(formatPercent(value)).not.toMatch(/NaN|Infinity/)
      }),
    )
  })

  test('formatMultiple over the float64 extremes and null', () => {
    fc.assert(
      fc.property(fc.option(FLOAT64_EXTREMES, { nil: null }), (value) => {
        expect(formatMultiple(value)).not.toMatch(/NaN|Infinity/)
      }),
    )
  })

  test('formatCurrency over the float64 extremes and null', () => {
    fc.assert(
      fc.property(fc.option(FLOAT64_EXTREMES, { nil: null }), (value) => {
        expect(formatCurrency(value)).not.toMatch(/NaN|Infinity/)
      }),
    )
  })

  test('formatSignedCurrency over the float64 extremes and null', () => {
    fc.assert(
      fc.property(fc.option(FLOAT64_EXTREMES, { nil: null }), (value) => {
        expect(formatSignedCurrency(value)).not.toMatch(/NaN|Infinity/)
      }),
    )
  })

  test('formatSignedPercent over the float64 extremes and null', () => {
    fc.assert(
      fc.property(fc.option(FLOAT64_EXTREMES, { nil: null }), (value) => {
        expect(formatSignedPercent(value)).not.toMatch(/NaN|Infinity/)
      }),
    )
  })
})

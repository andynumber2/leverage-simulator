/**
 * tests/calibration.test.ts — Task 1: fast Node unit coverage of bench/calibration.ts's floor
 * enforcement, the measureBatchedMinOfN amortization contract, and the calibration score guards.
 * Runs in the `unit` project, so every assertion here is independent of the browser-context bench
 * suite (`npm run bench`) and of any particular machine's true timing.
 */

import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  calibrationScore,
  measureBatchedMinOfN,
  measureMinOfN,
  MIN_MEASUREMENT_MS,
  normalize,
} from '../bench/calibration.ts'

/** Feeds a fixed sequence of `performance.now()` return values, one per call, so a repeat's
 * elapsed time is fully controlled rather than dependent on the real clock or real workload
 * cost, per the plan's instruction not to assert exact wall-clock equality against a real
 * timer. */
function mockPerformanceNowSequence(values: readonly number[]): void {
  let call = 0
  vi.spyOn(performance, 'now').mockImplementation(() => values[call++] ?? 0)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('measureMinOfN: floor enforcement', () => {
  test('rejects with a message containing the observed value and the floor value when the minimum repeat is below the floor', async () => {
    // A no-op function is definitionally under the floor on any real timer.
    await expect(measureMinOfN(5, () => {})).rejects.toThrow(new RegExp(String(MIN_MEASUREMENT_MS)))
  })

  test('does not throw when the minimum observed repeat is exactly equal to the floor', async () => {
    mockPerformanceNowSequence([0, MIN_MEASUREMENT_MS])
    await expect(measureMinOfN(1, () => {})).resolves.toBe(MIN_MEASUREMENT_MS)
  })

  test('throws when the minimum observed repeat is one unit below the floor', async () => {
    mockPerformanceNowSequence([0, MIN_MEASUREMENT_MS - 1])
    await expect(measureMinOfN(1, () => {})).rejects.toThrow(new RegExp(String(MIN_MEASUREMENT_MS)))
  })
})

describe('measureBatchedMinOfN: batch division and floor contract', () => {
  test('returns the batch minimum divided by the batch size', async () => {
    mockPerformanceNowSequence([0, 50])
    const result = await measureBatchedMinOfN(1, 500, () => {})
    expect(result).toBe(0.1)
  })

  test('enforces the floor against the batch minimum, not the returned per-call quotient: a batch minimum of 50 with batchSize 500 succeeds even though the 0.1 per-call result is below the floor', async () => {
    mockPerformanceNowSequence([0, 50])
    await expect(measureBatchedMinOfN(1, 500, () => {})).resolves.toBe(0.1)
  })

  test('inherits measureMinOfN\'s floor: a batch total below the floor throws, so no raw value under the floor can ever reach a caller', async () => {
    mockPerformanceNowSequence([0, 5])
    await expect(measureBatchedMinOfN(1, 100, () => {})).rejects.toThrow(
      new RegExp(String(MIN_MEASUREMENT_MS)),
    )
  })

  test.each([
    ['zero', 0],
    ['negative', -1],
    ['non-integer', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects for a %s batchSize, naming the offending value', async (_label, batchSize) => {
    await expect(measureBatchedMinOfN(1, batchSize, () => {})).rejects.toThrow(String(batchSize))
  })
})

describe('calibrationScore: floor and non-finite guards', () => {
  test('throws, naming calibration and REFERENCE_ITERATIONS rather than NOMINAL_REFERENCE_MS, when the minimum reference-loop repeat is below the floor', () => {
    // Five repeats (REPEAT_COUNT): each mocked to a 5ms elapsed span, below the 10ms floor.
    mockPerformanceNowSequence([0, 5, 0, 5, 0, 5, 0, 5, 0, 5])
    expect(() => calibrationScore()).toThrow(/calibration/i)
    expect(() => calibrationScore()).toThrow(/REFERENCE_ITERATIONS/)
  })

  test('throws when the minimum reference-loop repeat is non-finite', () => {
    // NaN elapsed values never satisfy `elapsed < min`, so min never leaves POSITIVE_INFINITY.
    mockPerformanceNowSequence([
      Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN,
      Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN,
    ])
    expect(() => calibrationScore()).toThrow(/calibration/i)
  })
})

describe('normalize: broken-input guards', () => {
  test('throws for a zero score rather than returning Infinity', () => {
    expect(() => normalize(1, 0)).toThrow(/calibration/i)
  })

  test('throws for a non-finite (NaN) score rather than returning NaN', () => {
    expect(() => normalize(1, Number.NaN)).toThrow(/calibration/i)
  })

  test('throws for a negative score', () => {
    expect(() => normalize(1, -1)).toThrow(/calibration/i)
  })

  test('throws when rawMs is non-finite', () => {
    expect(() => normalize(Number.NaN, 1)).toThrow(/rawMs/)
  })

  test('does not throw for a well-formed positive score and finite rawMs', () => {
    expect(normalize(10, 2)).toBe(5)
  })
})

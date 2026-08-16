/**
 * tests/accumulator-store.test.ts: coverage for bench/accumulator-store.ts's write-once
 * canonical calibration score contract (claimCalibrationScore / loadCalibrationScore). Proves
 * the per-run canonical score contract: the first caller to claim a score for a run wins, every
 * later caller (including a racing concurrent one) receives that same stored value, a stale
 * score never survives resetAccumulatorStore, and a broken sample is rejected before anything is
 * written. Runs in the fast Node `unit` project, independent of the browser-context bench suite.
 */

import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  claimCalibrationScore,
  loadCalibrationScore,
  resetAccumulatorStore,
} from '../bench/accumulator-store.ts'

const ORIGINAL_BENCH_RESULTS_DIR = process.env.BENCH_RESULTS_DIR

let testDir: string

beforeEach(() => {
  // A unique relative directory per test, so parallel unit files (and repeated cases within this
  // file) cannot collide, following the env-var save/restore pattern already used in
  // tests/report.test.ts.
  testDir = `.bench/tmp-calibration-${randomUUID()}`
  process.env.BENCH_RESULTS_DIR = testDir
})

afterEach(async () => {
  if (ORIGINAL_BENCH_RESULTS_DIR === undefined) {
    delete process.env.BENCH_RESULTS_DIR
  } else {
    process.env.BENCH_RESULTS_DIR = ORIGINAL_BENCH_RESULTS_DIR
  }
  await rm(testDir, { recursive: true, force: true })
})

describe('loadCalibrationScore: no claim yet', () => {
  test('resolves null when no score has been claimed', async () => {
    await expect(loadCalibrationScore()).resolves.toBeNull()
  })
})

describe('claimCalibrationScore: first-caller-wins write-once semantics', () => {
  test('a single claim resolves the submitted sample and is then readable', async () => {
    await expect(claimCalibrationScore(0.75)).resolves.toBe(0.75)
    await expect(loadCalibrationScore()).resolves.toBe(0.75)
  })

  test('a second claim after a first resolves the first value, not the second, and leaves the first stored', async () => {
    await expect(claimCalibrationScore(0.75)).resolves.toBe(0.75)
    await expect(claimCalibrationScore(9.5)).resolves.toBe(0.75)
    await expect(loadCalibrationScore()).resolves.toBe(0.75)
  })

  test('the stored artifact lands at <BENCH_RESULTS_DIR>/.raw/calibration.json', async () => {
    await claimCalibrationScore(1.25)
    const content = await readFile(
      join(process.cwd(), testDir, '.raw', 'calibration.json'),
      'utf8',
    )
    expect(JSON.parse(content)).toEqual({ calibrationScore: 1.25 })
  })
})

describe('claimCalibrationScore: write-once under concurrent callers', () => {
  // Repeated so a lost race is unlikely to pass by luck: a broken implementation (e.g. a plain
  // check-then-act existence test) would only intermittently produce more than one distinct
  // resolved value.
  test.each([1, 2, 3, 4, 5])('attempt %i: N=8 concurrent claims all resolve the same value', async () => {
    await resetAccumulatorStore()
    const samples = Array.from({ length: 8 }, (_, i) => i + 1)
    const results = await Promise.all(samples.map((sample) => claimCalibrationScore(sample)))

    const distinct = new Set(results)
    expect(distinct.size).toBe(1)

    const winner = results[0]
    expect(samples).toContain(winner)

    await expect(loadCalibrationScore()).resolves.toBe(winner)
  })
})

describe('resetAccumulatorStore: a stale score never survives into the next run', () => {
  test('a claimed score is cleared by resetAccumulatorStore', async () => {
    await claimCalibrationScore(3.5)
    await expect(loadCalibrationScore()).resolves.toBe(3.5)

    await resetAccumulatorStore()

    await expect(loadCalibrationScore()).resolves.toBeNull()
  })
})

describe('claimCalibrationScore: broken-sample guards', () => {
  test.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negative Infinity', Number.NEGATIVE_INFINITY],
    ['zero', 0],
    ['negative', -1],
  ])('rejects for a %s sample and leaves nothing stored', async (_label, sample) => {
    await expect(claimCalibrationScore(sample)).rejects.toThrow(String(sample))
    await expect(loadCalibrationScore()).resolves.toBeNull()
  })
})

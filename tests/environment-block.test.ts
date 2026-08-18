/**
 * tests/environment-block.test.ts: PERF-11, environment block field validation.
 *
 * Every measured figure must carry machine and core-count labels, making an
 * unlabelled figure structurally impossible. This test verifies that the
 * environment block's individual fields are non-empty and coherent, so a
 * malformed block (zero cores, empty OS, non-finite score, etc.) fails
 * immediately rather than producing a confusing unlabelled figure.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import type { EnvironmentBlock } from '../bench/environment-block.ts'
import { assertEnvironmentBlockComplete } from '../bench/environment-block.ts'

function validBlock(): EnvironmentBlock {
  return {
    hardwareConcurrency: 4,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    os: 'linux 7.1.4-200.fc44.aarch64',
    deviceMemory: 8,
    calibrationScore: 1.5,
    ci: true,
    timestamp: '2026-08-16T00:00:00.000Z',
  }
}

describe('assertEnvironmentBlockComplete: PERF-11 field validation', () => {
  test('a well-formed block with all fields does not throw', () => {
    expect(() => assertEnvironmentBlockComplete(validBlock())).not.toThrow()
  })

  test('a well-formed block without optional deviceMemory does not throw', () => {
    const block = validBlock()
    delete block.deviceMemory
    expect(() => assertEnvironmentBlockComplete(block)).not.toThrow()
  })

  test('hardwareConcurrency=0 throws and names the field', () => {
    const block = validBlock()
    block.hardwareConcurrency = 0
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/hardwareConcurrency/i)
  })

  test('hardwareConcurrency negative throws and names the field', () => {
    const block = validBlock()
    block.hardwareConcurrency = -1
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/hardwareConcurrency/i)
  })

  test('hardwareConcurrency non-integer throws and names the field', () => {
    const block = validBlock()
    block.hardwareConcurrency = 4.5
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/hardwareConcurrency/i)
  })

  test('empty userAgent throws and names the field', () => {
    const block = validBlock()
    block.userAgent = ''
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/userAgent/i)
  })

  test('whitespace-only userAgent throws and names the field', () => {
    const block = validBlock()
    block.userAgent = '   '
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/userAgent/i)
  })

  test('empty os throws and names the field', () => {
    const block = validBlock()
    block.os = ''
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/validation: os /)
  })

  test('whitespace-only os throws and names the field', () => {
    const block = validBlock()
    block.os = '  \t  '
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/validation: os /)
  })

  test('calibrationScore=0 throws and names the field', () => {
    const block = validBlock()
    block.calibrationScore = 0
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/calibrationScore/i)
  })

  test('calibrationScore negative throws and names the field', () => {
    const block = validBlock()
    block.calibrationScore = -1.5
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/calibrationScore/i)
  })

  test('calibrationScore=NaN throws and names the field', () => {
    const block = validBlock()
    block.calibrationScore = NaN
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/calibrationScore/i)
  })

  test('calibrationScore=Infinity throws and names the field', () => {
    const block = validBlock()
    block.calibrationScore = Infinity
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/calibrationScore/i)
  })

  test('non-ISO timestamp throws and names the field', () => {
    const block = validBlock()
    block.timestamp = 'not-a-timestamp'
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/timestamp/i)
  })

  test('empty timestamp throws and names the field', () => {
    const block = validBlock()
    block.timestamp = ''
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/timestamp/i)
  })

  test('invalid ISO format throws and names the field', () => {
    const block = validBlock()
    block.timestamp = '2026-08-16'
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/timestamp/i)
  })

  test('deviceMemory=0 throws and names the field when present', () => {
    const block = validBlock()
    block.deviceMemory = 0
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/deviceMemory/i)
  })

  test('deviceMemory negative throws and names the field', () => {
    const block = validBlock()
    block.deviceMemory = -1
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/deviceMemory/i)
  })

  test('deviceMemory non-integer throws and names the field', () => {
    const block = validBlock()
    block.deviceMemory = 4.5
    expect(() => assertEnvironmentBlockComplete(block)).toThrow()
    expect(() => assertEnvironmentBlockComplete(block)).toThrow(/deviceMemory/i)
  })
})

/**
 * The field validation above is only worth anything if bench/global-setup.ts actually calls
 * it. Asserting the function in isolation would still pass if the call were deleted from the
 * teardown, which is the same gate-rot failure mode D-09's spawned self-test exists to close.
 * These two tests drive the real teardown through the BENCH_RESULTS_DIR seam (plan 01-05) with
 * a planted environment.json, so the wiring itself is under test.
 */
describe('PERF-11 wiring: bench/global-setup.ts rejects a malformed block at teardown', () => {
  const TEST_RESULTS_DIR = '.bench-envwiring-test'
  const rawDir = resolve(process.cwd(), TEST_RESULTS_DIR, '.raw')
  let previousResultsDir: string | undefined

  beforeEach(() => {
    previousResultsDir = process.env.BENCH_RESULTS_DIR
    process.env.BENCH_RESULTS_DIR = TEST_RESULTS_DIR
  })

  afterEach(() => {
    if (previousResultsDir === undefined) {
      delete process.env.BENCH_RESULTS_DIR
    } else {
      process.env.BENCH_RESULTS_DIR = previousResultsDir
    }
    rmSync(resolve(process.cwd(), TEST_RESULTS_DIR), { recursive: true, force: true })
  })

  async function runTeardownWithEnvironment(block: EnvironmentBlock): Promise<void> {
    const setup = (await import('../bench/global-setup.ts')).default
    const teardown = await setup()
    // setup() resets the store, so the planted block has to land after it, not before.
    mkdirSync(rawDir, { recursive: true })
    writeFileSync(resolve(rawDir, 'environment.json'), JSON.stringify(block), 'utf8')
    await teardown()
  }

  test('a block with zero cores fails the run, naming hardwareConcurrency', async () => {
    const block = validBlock()
    block.hardwareConcurrency = 0
    await expect(runTeardownWithEnvironment(block)).rejects.toThrow(/hardwareConcurrency/)
  })

  test('a well-formed block passes the environment gate, so the rejection above is the field check and not an unrelated teardown failure', async () => {
    await expect(runTeardownWithEnvironment(validBlock())).rejects.not.toThrow(
      /environment block validation/,
    )
  })
})

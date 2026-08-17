import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

import {
  claimCalibrationScore,
  loadCalibrationScore,
  persistEnvironment,
  persistInfoLine,
  persistMeasurement,
} from './bench/accumulator-store.ts'
import type { BrowserCapturedEnvironment } from './bench/environment-block.ts'
import type { MeasurementRow } from './bench/report.ts'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts', 'tools/**/tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'bench',
          include: ['bench/**/*.bench.test.ts'],
          // D-02/D-03: no two timed measurements ever execute concurrently, so runner noise
          // from one measurement cannot bleed into another's wall-clock figure.
          fileParallelism: false,
          globalSetup: ['./bench/global-setup.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
            // The browser-to-Node bridge (RESEARCH.md's preferred mechanism over the stdout
            // marker-protocol fallback): a bench test calls `commands.recordMeasurement(row)` /
            // `commands.recordEnvironment(block)` from inside the browser context, and these
            // implementations (which run in the Node process hosting the browser instance)
            // persist the payload to `.bench/.raw/` via bench/accumulator-store.ts, which
            // bench/global-setup.ts's teardown reads back at run end. Persisting to disk (rather
            // than an in-memory module accumulator) is required here: the command
            // implementation and global-setup run as separate vite-node module instances even
            // within the same OS process, so a plain in-memory array does not survive the
            // boundary (verified empirically during implementation).
            commands: {
              recordMeasurement: async (_context, row: MeasurementRow) => {
                await persistMeasurement(row)
                return null
              },
              recordEnvironment: async (_context, block: BrowserCapturedEnvironment) => {
                await persistEnvironment(block)
                return null
              },
              // Task 2 (01-02): browser-context console.log does not reach `npm run bench`'s
              // stdout under the default reporter (verified empirically); this command routes
              // free-text reproducibility info (e.g. sweep worker/chunk counts) through the same
              // filesystem-backed bridge as recordMeasurement/recordEnvironment.
              recordInfoLine: async (_context, id: string, line: string) => {
                await persistInfoLine(id, line)
                return null
              },
              // Task 2 (quick-260816-p8z): readCalibration/claimCalibration back the run's
              // canonical calibration score (bench/canonical-calibration.ts). claimCalibration
              // returns the run's winning score, which may be a different value than the caller
              // submitted when another bench file's claim already won the race, and that is the
              // point of the command: every later caller converges on the one value that was
              // actually stored.
              readCalibration: async (_context) => loadCalibrationScore(),
              claimCalibration: async (_context, sample: number) => claimCalibrationScore(sample),
            },
          },
        },
      },
      {
        test: {
          // D-09: the gate-liveness self-test's harness command. Reuses bench/global-setup.ts
          // unchanged, so the deliberately over-budget fixture in bench/selftest/ goes through
          // the identical teardown, buildFullRowSet, and assertRunInvariants that
          // `npm run bench` uses. No browser block here: the browser plays no part in the
          // exit-code path this project proves, and adding one would put a Playwright startup on
          // every unit-suite run.
          name: 'bench-selftest',
          environment: 'node',
          include: ['bench/selftest/*.selftest.ts'],
          globalSetup: ['./bench/global-setup.ts'],
        },
      },
    ],
  },
})

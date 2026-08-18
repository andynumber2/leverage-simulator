/**
 * Module augmentation for Vitest's browser custom-commands API (declared in `vitest.config.ts`'s
 * `test.browser.commands`). Without this, `commands.recordMeasurement(...)` /
 * `commands.recordEnvironment(...)` (imported from `@vitest/browser/context` in
 * `*.bench.test.ts` files) type as `never` because `BrowserCommands` ships with only the
 * built-in `readFile`/`writeFile`/`removeFile` entries.
 */

import type { BundleBytes } from './bundle-bytes.ts'
import type { BrowserCapturedEnvironment } from './environment-block.ts'
import type { ProductionKernelSeriesPayload } from './kernel-series-bridge.ts'
import type { MeasurementRow } from './report.ts'

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    recordMeasurement: (row: MeasurementRow) => Promise<null>
    recordEnvironment: (block: BrowserCapturedEnvironment) => Promise<null>
    /** Task 2 (01-02): free-text reproducibility info line, keyed by `id`, printed by
     * bench/global-setup.ts alongside the measurement table. See bench/accumulator-store.ts's
     * `persistInfoLine` header comment for why this exists. */
    recordInfoLine: (id: string, line: string) => Promise<null>
    /** Task 2 (quick-260816-p8z): read the run's already-claimed canonical calibration score, or
     * `null` when no bench file has claimed one yet this run. See
     * bench/accumulator-store.ts's `claimCalibrationScore` header comment for why this exists. */
    readCalibration: () => Promise<number | null>
    /** Task 2 (quick-260816-p8z): submit a sampled score as this run's canonical calibration
     * score. Returns the run's winning score, which may differ from the submitted sample when
     * another caller's claim already won. */
    claimCalibration: (sample: number) => Promise<number>
    /** Task 3 (02-05, D-23): the compiled bundle's real on-disk raw and brotli-compressed byte
     * totals, measured Node-side by bench/bundle-bytes.ts's `measureBundleBytes` since the
     * browser context has no filesystem access to public/data/'s source directory. */
    readBundleBytes: () => Promise<BundleBytes>
    /** Task 1 (03-05, PERF-02): the real bundled SPX series and kernel params PERF-02 measures
     * `runBacktest` against, decoded Node-side from the committed bundle since the browser
     * context has no filesystem access to public/data/'s source directory. */
    readKernelSeries: () => Promise<ProductionKernelSeriesPayload>
  }
}

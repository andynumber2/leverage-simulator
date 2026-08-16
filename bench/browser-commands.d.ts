/**
 * Module augmentation for Vitest's browser custom-commands API (declared in `vitest.config.ts`'s
 * `test.browser.commands`). Without this, `commands.recordMeasurement(...)` /
 * `commands.recordEnvironment(...)` (imported from `@vitest/browser/context` in
 * `*.bench.test.ts` files) type as `never` because `BrowserCommands` ships with only the
 * built-in `readFile`/`writeFile`/`removeFile` entries.
 */

import type { BrowserCapturedEnvironment } from './environment-block.ts'
import type { MeasurementRow } from './report.ts'

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    recordMeasurement: (row: MeasurementRow) => Promise<null>
    recordEnvironment: (block: BrowserCapturedEnvironment) => Promise<null>
    /** Task 2 (01-02): free-text reproducibility info line, keyed by `id`, printed by
     * bench/global-setup.ts alongside the measurement table. See bench/accumulator-store.ts's
     * `persistInfoLine` header comment for why this exists. */
    recordInfoLine: (id: string, line: string) => Promise<null>
  }
}

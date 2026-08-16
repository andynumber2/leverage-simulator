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
  }
}

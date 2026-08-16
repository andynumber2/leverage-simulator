/**
 * bench/environment-block.ts — D-18: full environment stamping on every run.
 *
 * Criterion 1 requires a machine and core count attached to every reported figure, so an
 * unlabelled figure is structurally impossible. `captureEnvironment` runs inside the browser
 * test context (it reads `navigator`, which only exists there) and captures everything the
 * browser itself can see. The two fields that are genuinely Node-side concerns — the CI flag
 * (`process.env.CI`) and the host OS label — are filled in by `recordEnvironment` (bench/
 * report.ts), which runs as the Node-side implementation of the `browser.commands` bridge
 * declared in `vitest.config.ts`, not inside the browser bundle.
 */

export interface EnvironmentBlock {
  hardwareConcurrency: number
  userAgent: string
  os: string
  /** Only present where the browser exposes the (non-standard, Chromium-only)
   * `navigator.deviceMemory` API. */
  deviceMemory?: number
  calibrationScore: number
  ci: boolean
  timestamp: string
}

/** What `captureEnvironment` can genuinely observe from inside the browser context. `os` and
 * `ci` are added Node-side once this crosses the `commands` bridge. */
export type BrowserCapturedEnvironment = Omit<EnvironmentBlock, 'os' | 'ci'>

export function captureEnvironment(calibrationScore: number): BrowserCapturedEnvironment {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    hardwareConcurrency: navigator.hardwareConcurrency,
    userAgent: navigator.userAgent,
    deviceMemory: nav.deviceMemory,
    calibrationScore,
    timestamp: new Date().toISOString(),
  }
}

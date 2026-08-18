/**
 * bench/environment-block.ts: D-18, full environment stamping on every run.
 *
 * Criterion 1 requires a machine and core count attached to every reported figure, so an
 * unlabelled figure is structurally impossible. `captureEnvironment` runs inside the browser
 * test context (it reads `navigator`, which only exists there) and captures everything the
 * browser itself can see. The two fields that are genuinely Node-side concerns, the CI flag
 * (`process.env.CI`) and the host OS label, are filled in by `recordEnvironment` (bench/
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

/** Validates that an environment block's individual fields are complete and coherent,
 * so a malformed block (zero cores, empty OS, non-finite score, etc.) fails
 * immediately rather than producing a confusing unlabelled figure. Throws a message
 * naming the offending field when a check fails. */
export function assertEnvironmentBlockComplete(env: EnvironmentBlock): void {
  // hardwareConcurrency must be a positive integer
  if (!Number.isInteger(env.hardwareConcurrency) || env.hardwareConcurrency <= 0) {
    throw new Error(
      `environment block validation: hardwareConcurrency must be a positive integer, got ${env.hardwareConcurrency}`,
    )
  }

  // userAgent must not be empty or whitespace-only
  if (!env.userAgent || !env.userAgent.trim()) {
    throw new Error(
      `environment block validation: userAgent must not be empty or whitespace-only, got "${env.userAgent}"`,
    )
  }

  // os must not be empty or whitespace-only
  if (!env.os || !env.os.trim()) {
    throw new Error(
      `environment block validation: os must not be empty or whitespace-only, got "${env.os}"`,
    )
  }

  // calibrationScore must be a finite positive number
  if (!Number.isFinite(env.calibrationScore) || env.calibrationScore <= 0) {
    throw new Error(
      `environment block validation: calibrationScore must be a finite positive number, got ${env.calibrationScore}`,
    )
  }

  // timestamp must be a parseable ISO string with time component (e.g., 2026-08-16T00:00:00.000Z)
  // A valid ISO timestamp includes a 'T' separator and either 'Z' or an offset.
  if (!env.timestamp || !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(env.timestamp)) {
    throw new Error(
      `environment block validation: timestamp must be a parseable ISO string (with time), got "${env.timestamp}"`,
    )
  }
  const timestampDate = new Date(env.timestamp)
  if (Number.isNaN(timestampDate.getTime())) {
    throw new Error(
      `environment block validation: timestamp must be a parseable ISO string, got "${env.timestamp}"`,
    )
  }

  // deviceMemory, if present, must be a positive integer
  if (env.deviceMemory !== undefined) {
    if (!Number.isInteger(env.deviceMemory) || env.deviceMemory <= 0) {
      throw new Error(
        `environment block validation: deviceMemory, if present, must be a positive integer, got ${env.deviceMemory}`,
      )
    }
  }
}

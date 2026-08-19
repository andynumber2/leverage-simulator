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

/** Task 1 (04-03): the committed answer to RESEARCH.md Open Question 1. Four booleans and one
 * string, plus an optional error message when the probe's body threw. */
export interface BrowserContextProbeReport {
  /** Whether `context.context` is present at all on the command's first parameter. */
  hasContext: boolean
  /** Whether `typeof context.context.newPage` is `function`. */
  hasNewPage: boolean
  /** Whether `typeof context.context.browser` is `function` and calling it returned a non-null
   * `Browser`, the handle PERF-08's fresh-cache context (Task 2) needs. */
  hasBrowserHandle: boolean
  /** Whether a page opened from a freshly created context (via the `Browser` handle above)
   * could navigate to `about:blank` and read `document.readyState`. */
  canNavigateFreshContext: boolean
  /** The constructor name of `context.context`, or `'undefined'`/`'error'`. */
  constructorName: string
  /** Present only when the probe's body threw; the thrown error's message. */
  error?: string
}

/** Task 1 (04-06): the PERF-07a/07b figures plus reproducibility disclosure, measured from a
 * real Playwright pointer drag of the production leverage slider in a genuinely fresh browser
 * context. */
export interface InteractionTimingReport {
  /** The maximum single `longtask` entry duration observed during the drag -- PERF-07a's figure.
   * `0` when none fired, which is the passing outcome PERF-07a's budget asks for, not a broken
   * instrument. */
  maxLongTaskDurationMs: number
  /** The count of `longtask` entries observed during the drag. Reproducibility information only. */
  longTaskCount: number
  /** The maximum `app-recompute` performance-measure duration observed during the drag --
   * PERF-07b's figure: the coalesced run-and-repaint D-03 says the 16ms frame budget applies to,
   * not a raw frame delta that would also count browser compositing the app does not control. */
  maxRecomputeDurationMs: number
  /** The count of `app-recompute` measures observed during the drag. Strictly greater than 0 and
   * no greater than `stepCount` is what proves the drag reached the reactive path and that
   * coalescing did not increase the work (T-04-27). */
  recomputeCount: number
  /** The declared number of pointer-move steps the drag issued. */
  stepCount: number
  /** `navigator.hardwareConcurrency` as read in the measured page. */
  hardwareConcurrency: number
}

/** Task 2 (04-03): the three PERF-08 figures plus reproducibility disclosure, measured against a
 * production `vite preview` build in a genuinely fresh browser context. */
export interface AppLoadTimingReport {
  /** `app-data-ready`'s `startTime` on the cold (first) navigation -- PERF-08b's figure. */
  coldDataReadyMs: number
  /** `app-interactive`'s `startTime` on the cold (first) navigation -- PERF-08a's figure. */
  coldInteractiveMs: number
  /** `app-interactive`'s `startTime` on the warm (second, cache-warm) navigation --
   * PERF-08c's figure. */
  warmInteractiveMs: number
  /** The maximum `longtask` entry duration observed during the cold load, `0` when none fired.
   * Reproducibility information only. */
  maxLongTaskDurationMs: number
  /** The count of `longtask` entries observed during the cold load. */
  longTaskCount: number
  /** `navigator.hardwareConcurrency` as read in the measured page. */
  hardwareConcurrency: number
}

/** Task 2 (04-08, DATA-08): the offline-after-first-load report, measured against a production
 * `vite preview` build in a genuinely fresh browser context whose network is disabled at the
 * Playwright layer after the service worker precaches the whole bundled universe. */
export interface OfflineCheckReport {
  /** Whether the second, offline navigation reached the `app-interactive` mark. */
  reachedInteractive: boolean
  /** The count of requests that failed during the offline navigation -- 0 is the passing
   * outcome; a route the service worker did not precache surfaces here as a real failure. */
  failedRequestCount: number
  /** Up to the first ten failed requests' `"METHOD url"` strings, for a readable assertion
   * message. */
  failedRequests: string[]
  /** Whether a symbol OTHER than the default landing run's could be selected and computed while
   * offline -- what distinguishes precaching the whole universe (D-04) from precaching only the
   * symbol already opened. */
  nonDefaultSymbolComputed: boolean
}

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
    /** Task 1 (04-03): settles RESEARCH.md Open Question 1 -- whether the `context` object a
     * custom command receives exposes a real, unrestricted Playwright `BrowserContext`. See
     * `BrowserContextProbeReport`'s field comments for what each probed value means. */
    probeBrowserContext: () => Promise<BrowserContextProbeReport>
    /** Task 2 (04-03, PERF-08): measures cold and warm load timing against a production
     * `vite preview` build. See `AppLoadTimingReport`'s field comments for what each figure
     * measures. */
    measureAppLoadTiming: () => Promise<AppLoadTimingReport>
    /** Task 1 (04-06, PERF-07): measures a real Playwright pointer drag of the production
     * leverage slider. See `InteractionTimingReport`'s field comments for what each figure
     * measures. */
    measureInteractionTiming: () => Promise<InteractionTimingReport>
    /** Task 2 (04-08, DATA-08): the offline-after-first-load proof. See `OfflineCheckReport`'s
     * field comments for what each figure means. Declared on the `app` project's `browser.
     * commands` block in `vitest.config.ts`, not the `bench` project's -- the other commands
     * above are. */
    runOfflineCheck: () => Promise<OfflineCheckReport>
  }
}

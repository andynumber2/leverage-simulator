import path from 'node:path'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'

import {
  claimCalibrationScore,
  loadCalibrationScore,
  persistEnvironment,
  persistInfoLine,
  persistMeasurement,
} from './bench/accumulator-store.ts'
import { measureBundleBytes } from './bench/bundle-bytes.ts'
import type { BrowserCapturedEnvironment } from './bench/environment-block.ts'
import { readProductionKernelSeries } from './bench/kernel-series-bridge.ts'
import { withPreviewServer } from './bench/preview-server.ts'
import type { MeasurementRow } from './bench/report.ts'
import { readSweepFixtureBytes } from './bench/sweep-fixture-bridge.ts'

/** Convention this repo's compiler and CLI both follow (tools/bundle-compiler/src/cli.ts): the
 * compiled bundle always lands at "public/data" under the working directory. */
const COMPILED_BUNDLE_DIR = path.resolve(process.cwd(), 'public', 'data')

/** 06-01-PLAN.md Task 1(f): the committed Phase 6 design-pass fixture `scripts/
 * build-sweep-fixture.ts` writes and `bench/heatmap-form-2.bench.test.ts` reads through the
 * `readSweepFixture` command below -- the browser bench context has no filesystem access to this
 * path directly. */
const SWEEP_FIXTURE_PATH = path.resolve(
  process.cwd(),
  '.planning/phases/06-heatmap-design-pass/mockups/sweep-fixture.bin',
)

/** Task 1 (04-06, PERF-07): number of pointer-move steps `measureInteractionTiming`'s drag
 * issues. Each `page.mouse.move` call is a real CDP round trip, so the drag's actual wall-clock
 * duration is governed by host/runner speed, not a value this harness sets directly. A step
 * count this large is what makes D-03's coalescing claim testable regardless of that duration:
 * however long the drag turns out to take, 300 pointer-move events distributed across it are
 * overwhelmingly likely to land more than one to a single ~16.67ms (60Hz) animation-frame
 * window, which is the condition PERF-07b's "one coalesced recompute, not one per event" claim
 * needs in order to be exercised at all. */
const INTERACTION_DRAG_STEP_COUNT = 300

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts', 'tools/**/tests/**/*.test.ts'],
          // Scoped to the `.browser.test.ts` suffix, not the whole `tests/app/` directory, so a
          // plain `tests/app/*.test.ts` covering a pure app-layer module still runs here (in the
          // fast Node project) instead of silently matching neither project and never executing.
          // `exclude` replaces (not merges with) Vitest's own default exclude list, so the usual
          // defaults are repeated here alongside the new entry.
          exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/cypress/**',
            '**/.{idea,git,cache,output,temp}/**',
            '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
            'tests/app/**/*.browser.test.ts',
          ],
          // Task 2 (03-05, SIM-11): supplies --expose-gc to the unit project's worker processes
          // (Vitest's default pool is 'forks') so tests/kernel/allocation.test.ts's heap-delta
          // proof can force collection. Vitest 4's project-level `execArgv` (not a nested
          // `poolOptions.forks.execArgv`, which does not exist in this installed version) is
          // threaded straight into the forked worker's execArgv (see vitest/dist/chunks/
          // cli-api.*.js's project.config.execArgv wiring), so `npm run test` continues to be
          // the single command that runs this suite.
          execArgv: ['--expose-gc'],
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
              // D-23: bench/bundle-size.bench.test.ts's Node-side filesystem fact, the same
              // pattern readCalibration uses -- a browser-context test asks the Node process for
              // something only Node can measure (here, the compiled bundle's real on-disk bytes).
              readBundleBytes: async (_context) => measureBundleBytes(COMPILED_BUNDLE_DIR),
              // Task 1 (03-05): the same "browser-context test asks the Node host for something
              // only Node can do" pattern readBundleBytes uses, here decoding the committed
              // bundle into the real SPX series PERF-02 measures runBacktest against.
              readKernelSeries: async (_context) => readProductionKernelSeries(COMPILED_BUNDLE_DIR),
              // 06-01-PLAN.md Task 1(f): the committed sweep-fixture.bin's raw bytes, the same
              // "browser context has no filesystem access" pattern readBundleBytes/readKernelSeries
              // use, here handing the bytes to heatmap-form-2.bench.test.ts to decode with the
              // real decodeSweepFixture.
              readSweepFixture: async (_context) => readSweepFixtureBytes(SWEEP_FIXTURE_PATH),
              // Task 1 (04-03, RESEARCH.md Open Question 1): settles, rather than assumes, that
              // the `context` object a custom command receives exposes a real, unrestricted
              // Playwright `BrowserContext` at `context.context`. PERF-08's whole harness
              // (bench/preview-server.ts, bench/perf-08.bench.test.ts) depends on this being true.
              // The whole body is wrapped so a thrown error becomes a reported message rather than
              // an unhandled rejection that would crash the command bridge itself.
              probeBrowserContext: async (context) => {
                try {
                  const hasContext = context.context !== undefined
                  const hasNewPage = typeof context.context?.newPage === 'function'
                  let hasBrowserHandle = false
                  let browser: ReturnType<typeof context.context.browser> = null
                  if (typeof context.context?.browser === 'function') {
                    browser = context.context.browser()
                    hasBrowserHandle = browser !== null
                  }
                  let canNavigateFreshContext = false
                  if (browser !== null) {
                    // Pinned locale (matches the 'app' project's contextOptions below): this
                    // host's LANG/LC_* are unset (POSIX locale), which Chromium reports to
                    // Intl.NumberFormat as the invalid tag "en-US@posix" otherwise.
                    const freshContext = await browser.newContext({ locale: 'en-US' })
                    try {
                      const page = await freshContext.newPage()
                      await page.goto('about:blank')
                      const readyState = await page.evaluate(() => document.readyState)
                      canNavigateFreshContext = readyState === 'complete' || readyState === 'interactive'
                    } finally {
                      await freshContext.close()
                    }
                  }
                  const constructorName = context.context?.constructor?.name ?? 'undefined'
                  return {
                    hasContext,
                    hasNewPage,
                    hasBrowserHandle,
                    canNavigateFreshContext,
                    constructorName,
                  }
                } catch (error) {
                  return {
                    hasContext: false,
                    hasNewPage: false,
                    hasBrowserHandle: false,
                    canNavigateFreshContext: false,
                    constructorName: 'error',
                    error: error instanceof Error ? error.message : String(error),
                  }
                }
              },
              // Task 1 (08-05, PERF-07a/F-05/RESEARCH Pitfall 2/F-04): three real interactions
              // against the export and preset-apply paths in a genuinely fresh browser context
              // with clipboard and download permissions granted, so both the PNG clipboard path
              // and the CSV download path exercise their real branches rather than silently
              // falling through to a fallback. Mirrors measureInteractionTiming's fresh-context
              // plus buffered-longtask-observer mechanism exactly; the structural difference is
              // three independent measurements in sequence, clearing longTaskDurations
              // immediately before each, rather than one drag.
              measureExportTiming: async (context) =>
                withPreviewServer(async (origin) => {
                  const browser = context.context.browser()
                  if (browser === null) {
                    throw new Error(
                      'measureExportTiming: no Browser handle reachable from ' +
                        'context.context.browser() -- Task 1s probeBrowserContext must report ' +
                        'hasBrowserHandle=true for this command to run',
                    )
                  }
                  // Pinned locale, same reason as measureAppLoadTiming's fresh context above.
                  // Clipboard permissions and acceptDownloads let the PNG clipboard-write path
                  // and the CSV download path both exercise their real branches (T-08-21): if a
                  // future Playwright version stopped honoring `permissions` here, the runtime
                  // detection below (pngPathTaken) still labels whichever branch actually fired,
                  // rather than assuming the grant worked.
                  const freshContext = await browser.newContext({
                    locale: 'en-US',
                    permissions: ['clipboard-read', 'clipboard-write'],
                    acceptDownloads: true,
                  })
                  try {
                    const longTaskDurations: number[] = []
                    await freshContext.exposeFunction(
                      '__recordExportLongTask',
                      (duration: number) => {
                        longTaskDurations.push(duration)
                      },
                    )
                    // Installed before any navigation, per measureAppLoadTiming/
                    // measureInteractionTiming's own comment: observes the longtask entry type
                    // from the very first byte of the page this context loads.
                    await freshContext.addInitScript(() => {
                      new PerformanceObserver((list) => {
                        for (const entry of list.getEntries()) {
                          // @ts-expect-error -- injected by exposeFunction, not declared on window
                          window.__recordExportLongTask(entry.duration)
                        }
                      }).observe({ type: 'longtask', buffered: true })
                    })

                    const page = await freshContext.newPage()
                    try {
                      await page.goto(origin, { waitUntil: 'load' })
                      await page.waitForFunction(
                        () => performance.getEntriesByName('app-interactive').length > 0,
                      )

                      // --- 1. Export PNG: clipboard write, with a download fallback --------
                      longTaskDurations.length = 0
                      const pngButton = page.locator('[data-testid="export-png-button"]')
                      let pngDownloadFired = false
                      const onPngDownload = () => {
                        pngDownloadFired = true
                      }
                      page.once('download', onPngDownload)
                      await pngButton.click()
                      // The button only visibly leaves 'idle' on the clipboard-confirmed path
                      // (Copywriting Contract: the download fallback has no confirmed state), so
                      // this wait is allowed to time out harmlessly when the download branch is
                      // the one that actually fired.
                      await page
                        .waitForFunction(
                          () => {
                            const btn = document.querySelector(
                              '[data-testid="export-png-button"]',
                            )
                            return btn?.getAttribute('data-export-state') !== 'idle'
                          },
                          undefined,
                          { timeout: 1000 },
                        )
                        .catch(() => {})
                      if (!pngDownloadFired) {
                        await page
                          .waitForEvent('download', { timeout: 4000 })
                          .then(() => {
                            pngDownloadFired = true
                          })
                          .catch(() => {})
                      }
                      page.off('download', onPngDownload)
                      const pngStateAfter = await pngButton.getAttribute('data-export-state')
                      if (pngStateAfter === 'failed') {
                        throw new Error(
                          'measureExportTiming: PNG export entered its failed state -- the ' +
                            'clipboard write was rejected and the download fallback itself threw',
                        )
                      }
                      const pngPathTaken: 'clipboard' | 'download' =
                        pngStateAfter === 'confirmed' ? 'clipboard' : 'download'
                      if (pngPathTaken === 'download' && !pngDownloadFired) {
                        throw new Error(
                          'measureExportTiming: Export PNG never left its idle state and no ' +
                            'download fired -- the click likely missed rather than the work ' +
                            'being free',
                        )
                      }
                      const pngMaxLongTaskMs =
                        longTaskDurations.length > 0 ? Math.max(...longTaskDurations) : 0
                      const pngLongTaskCount = longTaskDurations.length

                      // --- 2. Export CSV: always a download (D-23) --------------------------
                      longTaskDurations.length = 0
                      const csvDownloadPromise = page.waitForEvent('download', { timeout: 10000 })
                      await page.locator('[data-testid="export-csv-button"]').click()
                      await csvDownloadPromise
                      const csvMaxLongTaskMs =
                        longTaskDurations.length > 0 ? Math.max(...longTaskDurations) : 0
                      const csvLongTaskCount = longTaskDurations.length

                      // --- 3. Apply the DCA preset from the Scenarios overlay (F-04) --------
                      longTaskDurations.length = 0
                      const headlineValue = page.locator('[data-testid="metric-headline-value"]')
                      const beforeHeadline = (await headlineValue.textContent()) ?? ''
                      await page.locator('[data-testid="scenarios-trigger"]').click()
                      await page.locator('[data-preset-id="spx-3x-dca-2000"]').click()
                      await page.waitForFunction(
                        (before) => {
                          const el = document.querySelector(
                            '[data-testid="metric-headline-value"]',
                          )
                          const text = el?.textContent?.trim() ?? ''
                          return (
                            text.length > 0 &&
                            text !== before &&
                            !text.toLowerCase().includes('computing')
                          )
                        },
                        beforeHeadline,
                        { timeout: 15000 },
                      )
                      const dcaApplyMaxLongTaskMs =
                        longTaskDurations.length > 0 ? Math.max(...longTaskDurations) : 0
                      const dcaApplyLongTaskCount = longTaskDurations.length

                      return {
                        pngMaxLongTaskMs,
                        csvMaxLongTaskMs,
                        dcaApplyMaxLongTaskMs,
                        pngPathTaken,
                        longTaskCounts: {
                          png: pngLongTaskCount,
                          csv: csvLongTaskCount,
                          dcaApply: dcaApplyLongTaskCount,
                        },
                      }
                    } finally {
                      await page.close()
                    }
                  } finally {
                    await freshContext.close()
                  }
                }),
              // Task 2 (04-03): PERF-08a/08b/08c's measurement. Runs Node-side, wrapped in
              // withPreviewServer so the measured origin is always the real production build,
              // never the dev server (RESEARCH.md Pitfall 2). Task 1's probe already proved
              // context.context.browser() reaches a real Browser handle, which is what this
              // command uses to create a genuinely fresh, cache-empty context -- never the test
              // runner's own context, whose cache is already warm from the run.
              measureAppLoadTiming: async (context) =>
                withPreviewServer(async (origin) => {
                  const browser = context.context.browser()
                  if (browser === null) {
                    throw new Error(
                      'measureAppLoadTiming: no Browser handle reachable from ' +
                        'context.context.browser() -- Task 1s probeBrowserContext must report ' +
                        'hasBrowserHandle=true for this command to run',
                    )
                  }
                  // Pinned locale (matches the 'app' project's contextOptions below): this
                  // host's LANG/LC_* are unset (POSIX locale), which Chromium reports to
                  // Intl.NumberFormat as the invalid tag "en-US@posix" otherwise, throwing
                  // inside uPlot's own module-level Intl.NumberFormat call on import.
                  const freshContext = await browser.newContext({ locale: 'en-US' })
                  try {
                    const longTaskDurations: number[] = []
                    await freshContext.exposeFunction(
                      '__recordLongTask',
                      (duration: number) => {
                        longTaskDurations.push(duration)
                      },
                    )
                    // Installed before any navigation in this context, so it observes the
                    // longtask entry type from the very first byte of every page this context
                    // ever loads, cold and warm alike. `buffered: true` catches entries that
                    // fired before the observer's own construction completed.
                    await freshContext.addInitScript(() => {
                      new PerformanceObserver((list) => {
                        for (const entry of list.getEntries()) {
                          // @ts-expect-error -- injected by exposeFunction, not declared on window
                          window.__recordLongTask(entry.duration)
                        }
                      }).observe({ type: 'longtask', buffered: true })
                    })

                    const page = await freshContext.newPage()
                    try {
                      // Cold load: the context's HTTP cache is genuinely empty (a freshly
                      // created context, never reused across measurements).
                      await page.goto(origin, { waitUntil: 'load' })
                      await page.waitForFunction(
                        () => performance.getEntriesByName('app-data-ready').length > 0,
                      )
                      const coldDataReadyMs = await page.evaluate(
                        () => performance.getEntriesByName('app-data-ready')[0]!.startTime,
                      )
                      await page.waitForFunction(
                        () => performance.getEntriesByName('app-interactive').length > 0,
                      )
                      const coldInteractiveMs = await page.evaluate(
                        () => performance.getEntriesByName('app-interactive')[0]!.startTime,
                      )
                      const hardwareConcurrency = await page.evaluate(
                        () => navigator.hardwareConcurrency,
                      )

                      // Warm load: a second navigation in the SAME context, whose HTTP cache is
                      // now warm. A new navigation's Performance timeline starts fresh, so
                      // entries read here belong only to this second load.
                      await page.goto(origin, { waitUntil: 'load' })
                      await page.waitForFunction(
                        () => performance.getEntriesByName('app-interactive').length > 0,
                      )
                      const warmInteractiveMs = await page.evaluate(
                        () => performance.getEntriesByName('app-interactive')[0]!.startTime,
                      )

                      const maxLongTaskDurationMs =
                        longTaskDurations.length > 0 ? Math.max(...longTaskDurations) : 0

                      return {
                        coldDataReadyMs,
                        coldInteractiveMs,
                        warmInteractiveMs,
                        maxLongTaskDurationMs,
                        longTaskCount: longTaskDurations.length,
                        hardwareConcurrency,
                      }
                    } finally {
                      await page.close()
                    }
                  } finally {
                    await freshContext.close()
                  }
                }),
              // Task 1 (04-06, PERF-07): a real Playwright pointer drag of the production
              // leverage slider (RESEARCH.md Architecture Patterns Pattern 6). Mirrors
              // measureAppLoadTiming's fresh-context + buffered-longtask-observer mechanism; the
              // structural difference is a single navigation (there is no cold/warm split for an
              // interaction measurement) followed by a real mouse drag instead of a second
              // page.goto. Never dispatches a synthetic 'input' event: the measured path must
              // include event dispatch, reactive propagation, the kernel run and the canvas
              // repaint, which a page-script synthetic-event-dispatch loop would skip the first of (and can
              // silently skip the frame boundary too).
              measureInteractionTiming: async (context) =>
                withPreviewServer(async (origin) => {
                  const browser = context.context.browser()
                  if (browser === null) {
                    throw new Error(
                      'measureInteractionTiming: no Browser handle reachable from ' +
                        'context.context.browser() -- Task 1s probeBrowserContext must report ' +
                        'hasBrowserHandle=true for this command to run',
                    )
                  }
                  // Pinned locale, same reason as measureAppLoadTiming's fresh context above.
                  const freshContext = await browser.newContext({ locale: 'en-US' })
                  try {
                    const longTaskDurations: number[] = []
                    await freshContext.exposeFunction(
                      '__recordInteractionLongTask',
                      (duration: number) => {
                        longTaskDurations.push(duration)
                      },
                    )
                    // Installed before any navigation, per measureAppLoadTiming's own comment:
                    // this observes the longtask entry type from the very first byte of the page
                    // this context loads. buffered: true catches entries fired before the
                    // observer's own construction completed.
                    await freshContext.addInitScript(() => {
                      new PerformanceObserver((list) => {
                        for (const entry of list.getEntries()) {
                          // @ts-expect-error -- injected by exposeFunction, not declared on window
                          window.__recordInteractionLongTask(entry.duration)
                        }
                      }).observe({ type: 'longtask', buffered: true })
                    })

                    const page = await freshContext.newPage()
                    try {
                      await page.goto(origin, { waitUntil: 'load' })
                      // Start from a fully loaded, idle page rather than racing initial load, so
                      // neither figure below carries load-time work PERF-08 already owns.
                      await page.waitForFunction(
                        () => performance.getEntriesByName('app-interactive').length > 0,
                      )
                      longTaskDurations.length = 0
                      await page.evaluate(() => {
                        performance.clearMeasures('app-recompute')
                      })

                      const slider = page.locator('[data-testid="leverage-slider"]')
                      const box = await slider.boundingBox()
                      if (box === null) {
                        throw new Error(
                          'measureInteractionTiming: leverage slider has no bounding box -- it ' +
                            'did not render',
                        )
                      }
                      const y = box.y + box.height / 2
                      const startX = box.x + 2
                      const endX = box.x + box.width - 2

                      // A real pointer drag: press on the track (which itself jumps the native
                      // range input's value, and starts a drag), move across the control's full
                      // width in INTERACTION_DRAG_STEP_COUNT steps, release. No synthetic event dispatch
                      // anywhere in this path -- the browser's own native slider handling is
                      // what turns these mouse events into 'input' events.
                      await page.mouse.move(startX, y)
                      await page.mouse.down()
                      for (let i = 1; i <= INTERACTION_DRAG_STEP_COUNT; i++) {
                        const x = startX + ((endX - startX) * i) / INTERACTION_DRAG_STEP_COUNT
                        // eslint-disable-next-line no-await-in-loop
                        await page.mouse.move(x, y)
                      }
                      await page.mouse.up()

                      // Let the drag's final coalesced recompute (scheduled for the next
                      // animation frame after the last input event) actually settle before
                      // reading measures back.
                      await page.evaluate(
                        () =>
                          new Promise<void>((resolve) => {
                            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
                          }),
                      )

                      const recompute = await page.evaluate(() => {
                        const measures = performance.getEntriesByName('app-recompute', 'measure')
                        return {
                          count: measures.length,
                          maxDurationMs:
                            measures.length > 0
                              ? Math.max(...measures.map((m) => m.duration))
                              : 0,
                        }
                      })
                      const hardwareConcurrency = await page.evaluate(
                        () => navigator.hardwareConcurrency,
                      )

                      return {
                        maxLongTaskDurationMs:
                          longTaskDurations.length > 0 ? Math.max(...longTaskDurations) : 0,
                        longTaskCount: longTaskDurations.length,
                        maxRecomputeDurationMs: recompute.maxDurationMs,
                        recomputeCount: recompute.count,
                        stepCount: INTERACTION_DRAG_STEP_COUNT,
                        hardwareConcurrency,
                      }
                    } finally {
                      await page.close()
                    }
                  } finally {
                    await freshContext.close()
                  }
                }),
            },
          },
        },
      },
      {
        plugins: [solid()],
        test: {
          name: 'app',
          include: ['tests/app/**/*.browser.test.ts'],
          // Each file drives a real browser page that fetches and decodes the full ~1.6 MB
          // bundle at least once. Running the files concurrently put four of those in flight at
          // the same time on a container with 2 GB of memory, and tests timed out at whichever
          // load happened to lose the race -- a different set every run, which made the suite's
          // result partly random and its greens worth little. Serializing files trades a little
          // wall clock for a deterministic verdict. Same reason the bench project sets it.
          fileParallelism: false,
          browser: {
            enabled: true,
            // This host's LANG/LC_* are unset (POSIX locale), which Chromium reports to
            // Intl.NumberFormat as an invalid tag ("en-US@posix") -- uPlot's own module-level
            // `new Intl.NumberFormat(navigator.language, ...)` call throws on import as a
            // result. Pinning the Playwright browser context's locale sidesteps the host's
            // malformed locale entirely, independent of what the CI/dev sandbox's env vars are.
            provider: playwright({ contextOptions: { locale: 'en-US' } }),
            headless: true,
            instances: [{ browser: 'chromium' }],
            commands: {
              // Task 2 (04-08, DATA-08): the offline-after-first-load proof. Same
              // withPreviewServer + fresh-BrowserContext pattern the bench project's
              // measureAppLoadTiming/measureInteractionTiming commands already use (a
              // Vitest-browser-mode test body has no direct access to Playwright's page/context,
              // so a Node-side custom command is the only way to navigate a FRESH page, disable
              // its network, and reload it). Run against a fresh page rather than the test
              // runner's own: taking the runner's own page offline would sever its connection to
              // the Vitest dev server and fail the test for the wrong reason.
              runOfflineCheck: async (context) =>
                withPreviewServer(async (origin) => {
                  const browser = context.context.browser()
                  if (browser === null) {
                    throw new Error(
                      'runOfflineCheck: no Browser handle reachable from ' +
                        'context.context.browser() -- see bench/vitest.config.ts probeBrowserContext ' +
                        'for the same requirement this command relies on',
                    )
                  }
                  const freshContext = await browser.newContext({ locale: 'en-US' })
                  try {
                    const page = await freshContext.newPage()
                    try {
                      const failedRequests: string[] = []
                      page.on('requestfailed', (request) => {
                        failedRequests.push(`${request.method()} ${request.url()}`)
                      })

                      // First, ONLINE load: registers the service worker and lets it precache the
                      // whole bundled universe (D-04) before the network is ever disabled.
                      await page.goto(origin, { waitUntil: 'load' })

                      // The worker must be BOTH active and actually controlling this page before
                      // the network is cut. This used to be a `waitForFunction` with an `async`
                      // predicate checking `registration.active.state === 'activated'`, and on the
                      // GitHub runner it did not hold: the state sampled a few lines below came
                      // back `active: null` with 17 of the 19 precache entries written, meaning
                      // the network was disabled while the worker was still installing. The
                      // offline reload then had no controller and died with
                      // ERR_INTERNET_DISCONNECTED. It passed locally purely because this machine
                      // finished precaching inside the `app-interactive` wait that follows.
                      //
                      // `navigator.serviceWorker.ready` is the correct condition and is awaited
                      // inside a single `page.evaluate`, which resolves the promise it returns
                      // rather than depending on how the polling wrapper treats an async
                      // predicate. `ready` resolves only once an active worker exists for this
                      // scope, and a worker cannot activate until its install handler settles,
                      // which is what writes the precache. Control is then awaited separately:
                      // `clientsClaim` takes control asynchronously after activation, so an
                      // activated worker is not yet a controlling one.
                      await page.evaluate(async () => {
                        if (navigator.serviceWorker === undefined) {
                          throw new Error('runOfflineCheck: no navigator.serviceWorker in this context')
                        }
                        const withTimeout = async (promise: Promise<unknown>, label: string) => {
                          let timer: ReturnType<typeof setTimeout> | undefined
                          const timeout = new Promise((_resolve, reject) => {
                            timer = setTimeout(() => reject(new Error(`runOfflineCheck: timed out waiting for ${label}`)), 30_000)
                          })
                          try {
                            await Promise.race([promise, timeout])
                          } finally {
                            if (timer !== undefined) clearTimeout(timer)
                          }
                        }

                        await withTimeout(navigator.serviceWorker.ready, 'the service worker to activate')

                        if (navigator.serviceWorker.controller === null) {
                          await withTimeout(
                            new Promise<void>((resolve) => {
                              navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
                              // Re-check after registering the listener: control can be taken in
                              // the gap between the check above and the subscription.
                              if (navigator.serviceWorker.controller !== null) resolve()
                            }),
                            'the service worker to take control of this page',
                          )
                        }
                      })

                      await page.waitForFunction(
                        () => performance.getEntriesByName('app-interactive').length > 0,
                      )

                      // Diagnostics sampled while still ONLINE, after the readiness wait above and
                      // before the network is cut, so a failure reports why rather than only that
                      // it happened. The reload's `catch` used to swallow its error entirely,
                      // which left the assertion able to say `expected false to be true` and
                      // nothing more. These fields are what distinguish "the worker never took
                      // control" from "it took control but a request escaped the precache", and
                      // `cachedEntryCount` is what exposed the partial precache on CI.
                      const swState = await page.evaluate(async () => {
                        const registration =
                          navigator.serviceWorker === undefined
                            ? undefined
                            : await navigator.serviceWorker.getRegistration()
                        const cacheNames = 'caches' in self ? await caches.keys() : []
                        let cachedEntryCount = 0
                        for (const name of cacheNames) {
                          const cache = await caches.open(name)
                          cachedEntryCount += (await cache.keys()).length
                        }
                        return {
                          controlled: navigator.serviceWorker?.controller != null,
                          scope: registration?.scope ?? null,
                          activeState: registration?.active?.state ?? null,
                          cacheNames,
                          cachedEntryCount,
                        }
                      })

                      // Second, OFFLINE load: same context (so its service-worker registration and
                      // cache storage persist), network genuinely disabled at the Playwright layer
                      // -- not merely a stubbed fetch -- so a route the service worker does NOT
                      // intercept would surface as a real failed request.
                      await freshContext.setOffline(true)
                      failedRequests.length = 0
                      await page.evaluate(() => performance.clearMarks('app-interactive'))

                      let reachedInteractive = true
                      let offlineFailure: string | null = null
                      try {
                        await page.reload({ waitUntil: 'load', timeout: 10_000 })
                        await page.waitForFunction(
                          () => performance.getEntriesByName('app-interactive').length > 0,
                          { timeout: 5_000 },
                        )
                      } catch (err) {
                        reachedInteractive = false
                        offlineFailure = err instanceof Error ? err.message : String(err)
                      }

                      // DATA-08 adjacency: a symbol OTHER than the default landing run's can be
                      // selected and computed while offline -- what distinguishes precaching the
                      // whole universe (D-04) from precaching only the symbol already opened.
                      // loadBundleFromSource (src/data/bundle-source.ts) already fetches every
                      // manifest.assets[] entry on the one initial load regardless of which
                      // symbol is selected, so switching symbols offline is a pure client-side
                      // recompute over data already in memory -- no further network request at
                      // all, let alone one the service worker would need to have precached.
                      //
                      // The default landing run's entry date is SPX's own earliest strict-tier
                      // date, which predates every OTHER bundled symbol's own strict tier -- so a
                      // bare symbol switch alone reliably hits D-12's eviction path (the entry
                      // date falls outside the new symbol's range) rather than a computed run.
                      // 2015-01-02 postdates every bundled symbol's strict-tier first date
                      // (latest is TQQQ/total-return at 2010-02-11), so setting it after the
                      // switch is what actually proves a fresh compute, not an evicted one.
                      let nonDefaultSymbolComputed = false
                      if (reachedInteractive) {
                        const select = page.locator('[data-testid="symbol-select"]')
                        const options = await select.locator('option').allTextContents()
                        const currentValue = await select.inputValue()
                        const nonDefault = options.find((option) => option !== currentValue)
                        if (nonDefault !== undefined) {
                          await select.selectOption(nonDefault)
                          try {
                            await page.waitForFunction(
                              (expected) => {
                                const el = document.querySelector('[data-testid="symbol-select"]')
                                return el instanceof HTMLSelectElement && el.value === expected
                              },
                              nonDefault,
                              { timeout: 2_000 },
                            )
                            await page.locator('[data-testid="entry-date-input"]').fill('2015-01-02')
                            await page.locator('[data-testid="entry-date-input"]').dispatchEvent('change')
                            await page.waitForSelector('[data-testid="metrics-panel"]', { timeout: 5_000 })
                            nonDefaultSymbolComputed = true
                          } catch {
                            nonDefaultSymbolComputed = false
                          }
                        }
                      }

                      return {
                        reachedInteractive,
                        offlineFailure,
                        swState,
                        failedRequestCount: failedRequests.length,
                        failedRequests: failedRequests.slice(0, 10),
                        nonDefaultSymbolComputed,
                      }
                    } finally {
                      await page.close()
                    }
                  } finally {
                    await freshContext.close()
                  }
                }),
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

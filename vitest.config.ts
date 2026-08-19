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

/** Convention this repo's compiler and CLI both follow (tools/bundle-compiler/src/cli.ts): the
 * compiled bundle always lands at "public/data" under the working directory. */
const COMPILED_BUNDLE_DIR = path.resolve(process.cwd(), 'public', 'data')

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
            },
          },
        },
      },
      {
        plugins: [solid()],
        test: {
          name: 'app',
          include: ['tests/app/**/*.browser.test.ts'],
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

/**
 * bench/playwright-context-probe.bench.test.ts: Task 1 (04-03), the committed answer to
 * RESEARCH.md Open Question 1 -- whether the Vitest custom-command `context` parameter exposes a
 * real, unrestricted Playwright `BrowserContext` at `context.context`, supporting `newPage()`
 * and, through it, navigation to an arbitrary URL. This is the load-bearing mechanism the whole
 * PERF-08 harness (bench/preview-server.ts, bench/perf-08.bench.test.ts) depends on: this file
 * pins it as a committed regression rather than a research assumption carried forward unproven.
 *
 * Not a throwaway: stays committed as the standing proof that a future Vitest or Playwright
 * upgrade removing this surface fails here, named, rather than inside a timing measurement.
 */

import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'

test('the Vitest custom-command context exposes a usable Playwright BrowserContext', async () => {
  // D-18: every bench run must stamp a full environment block, this file included, even though
  // it records no duration -- bench/global-setup.ts's teardown refuses to complete without one.
  const score = await resolveRunCalibration()
  await commands.recordEnvironment(captureEnvironment(score))

  const report = await commands.probeBrowserContext()

  // Recorded whether the probe succeeds or fails: the answer, not just the pass/fail outcome,
  // is what a future investigator needs, and infoLines survive in .bench/bench-results.json
  // after the terminal scrolls.
  await commands.recordInfoLine(
    'playwright-context-probe',
    `playwright-context-probe: hasContext=${report.hasContext} hasNewPage=${report.hasNewPage} ` +
      `hasBrowserHandle=${report.hasBrowserHandle} ` +
      `canNavigateFreshContext=${report.canNavigateFreshContext} ` +
      `constructorName=${report.constructorName}` +
      (report.error ? ` error=${report.error}` : ''),
  )

  expect(
    report.hasNewPage,
    'context.context.newPage must be a function for PERF-08 to open a fresh page against a ' +
      'preview-server origin',
  ).toBe(true)
  expect(
    report.hasBrowserHandle,
    'a Browser handle must be reachable from context.context.browser() so PERF-08 can create a ' +
      'genuinely fresh, cache-empty context',
  ).toBe(true)
  expect(
    report.canNavigateFreshContext,
    'a page opened from a freshly created context must be able to navigate and read document.readyState',
  ).toBe(true)
})

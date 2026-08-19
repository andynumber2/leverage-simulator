/**
 * tests/app/offline.browser.test.ts
 *
 * DATA-08/D-04: the offline-after-first-load proof. Calls `commands.runOfflineCheck`
 * (vitest.config.ts's `app` project), which loads the real production `dist/` build (via
 * `withPreviewServer`, never the dev server -- RESEARCH.md Pitfall 2) in a fresh, cache-empty
 * Playwright context, lets the service worker precache the whole bundled universe, disables the
 * network at the Playwright layer, reloads, and reports whether the offline reload still reaches
 * `app-interactive` with zero failed requests -- plus whether a symbol OTHER than the default
 * landing run's can be selected and computed offline, which is what distinguishes precaching the
 * whole universe (D-04) from precaching only the symbol already opened.
 */

import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

test('the offline reload reaches app-interactive with zero failed requests, and a non-default symbol computes offline', async () => {
  const result = await commands.runOfflineCheck()

  expect(result.reachedInteractive, `offline reload did not reach app-interactive`).toBe(true)
  expect(
    result.failedRequestCount,
    `offline reload had ${result.failedRequestCount} failed request(s): ${result.failedRequests.join(', ')}`,
  ).toBe(0)
  expect(
    result.nonDefaultSymbolComputed,
    'selecting a symbol other than the default landing run failed to compute while offline -- ' +
      'the whole bundled universe must be precached, not only the symbol already opened (D-04)',
  ).toBe(true)
})

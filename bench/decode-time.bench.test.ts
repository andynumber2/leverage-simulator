/**
 * bench/decode-time.bench.test.ts: DATA-BUNDLE-DECODE measurement (D-23).
 *
 * Locates the compiled bundle's manifest through the generated `MANIFEST_PATH` pointer (D-22,
 * Task 1's `src/data-bundle.generated.ts`), fetches it and every asset it names, and holds each
 * asset's `ArrayBuffer` outside the timed region so the measurement reflects decode alone, never
 * the network (per this plan's own action). Inside the timed function, for every series in the
 * manifest: decode the owning asset's header and construct the typed-array view over its value
 * run, touching one element of each view so the engine cannot prove the work dead.
 *
 * Measured with `measureBatchedMinOfN`, never `measureMinOfN`: a zero-copy view decode (D-19's
 * whole point) is exactly the sub-floor regime 02-RESEARCH.md's Pitfall 3 warns about, the same
 * regime that produced Phase 1's closed Gap 2 (a literal `0.00ms` reading). Batch size starts at
 * 500 -- the same value `bench/kernel.bench.test.ts`'s `PERF_02_BATCH_SIZE` settled on for its
 * own sub-floor call site -- and doubles until the batch minimum clears `MIN_MEASUREMENT_MS`.
 *
 * Runs in the same browser environment as every other bench figure (Phase 1's one-environment
 * rule): the assets are fetched by URL from the dev server's `public/` mount, not read through a
 * Node command. If the browser cannot reach the assets by URL, the fallback per this plan's
 * `<action>` is Vite's `?url` suffix on a static import -- not adopted here because the direct
 * fetch worked when this file was written; see the fallback note if that ever stops being true.
 */

import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

import { PERF_BUDGETS } from '../perf-budgets.ts'
import { BUNDLE_VERSION, MANIFEST_PATH } from '../src/data-bundle.generated.ts'
import { decodeHeader, seriesView, type AssetHeader } from '../tools/bundle-compiler/src/binary-format.ts'
import type { Manifest } from '../tools/bundle-compiler/src/manifest.ts'
import { MIN_MEASUREMENT_MS, REPEAT_COUNT, measureBatchedMinOfN, normalize } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'

/** Starting batch size, matching `bench/kernel.bench.test.ts`'s `PERF_02_BATCH_SIZE`: the value
 * Phase 1 settled on for its own sub-floor, zero-allocation call site. Doubled at runtime (never
 * hand-tuned in advance) until the batch minimum clears `MIN_MEASUREMENT_MS`. */
const INITIAL_DECODE_BATCH_SIZE = 500

/** Safety ceiling on the doubling loop so a pathological environment fails loudly (naming the
 * batch size reached) rather than looping toward `BENCH_TOTAL_RUNTIME_CAP_MS` silently. Eight
 * doublings from 500 reaches 128,000 calls per timed unit, far past anything this workload
 * (13 header decodes, 23 view constructions) should ever need to clear a 10ms floor. */
const MAX_DECODE_BATCH_SIZE = INITIAL_DECODE_BATCH_SIZE * 2 ** 8

async function fetchOrThrow(url: string): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`DATA-BUNDLE-DECODE: fetching "${url}" failed with status ${response.status}`)
  }
  return response
}

test('DATA-BUNDLE-DECODE: decoding every compiled asset into typed-array views stays under budget', async () => {
  const score = await resolveRunCalibration()

  const manifestResponse = await fetchOrThrow(MANIFEST_PATH)
  const manifest = (await manifestResponse.json()) as Manifest

  if (manifest.bundleVersion !== BUNDLE_VERSION) {
    throw new Error(
      `DATA-BUNDLE-DECODE: fetched manifest bundleVersion "${manifest.bundleVersion}" does not ` +
        `match the generated pointer module's BUNDLE_VERSION "${BUNDLE_VERSION}" (D-22): the ` +
        'committed bundle and the committed pointer module have drifted apart',
    )
  }

  // Every distinct asset file the manifest's series (and the shared calendar asset) reference,
  // fetched once and held as an ArrayBuffer outside the timed region below.
  const assetFiles = new Set<string>(manifest.series.map((s) => s.asset))
  assetFiles.add(manifest.calendar.file)

  const assetBuffers = new Map<string, ArrayBuffer>()
  for (const file of assetFiles) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetchOrThrow(`/data/${file}`)
    // eslint-disable-next-line no-await-in-loop
    assetBuffers.set(file, await response.arrayBuffer())
  }

  // The timed region: decode every asset's header (one decode per asset per call, matching what
  // a real decoder pays each load) and construct a Float64Array view over every series' value
  // run, touching one element of each view so the engine cannot prove the work dead (per this
  // plan's own instruction).
  function decodeAllOnce(): number {
    const headers = new Map<string, AssetHeader>()
    for (const [file, buffer] of assetBuffers) {
      headers.set(file, decodeHeader(buffer, manifest.bundleVersion))
    }
    let touchedSum = 0
    for (const seriesEntry of manifest.series) {
      const header = headers.get(seriesEntry.asset)
      if (header === undefined) {
        throw new Error(`DATA-BUNDLE-DECODE: no fetched asset for series "${seriesEntry.id}"`)
      }
      const descriptor = header.descriptors.find((d) => d.id === seriesEntry.id)
      if (descriptor === undefined) {
        throw new Error(`DATA-BUNDLE-DECODE: asset "${seriesEntry.asset}" carries no descriptor for "${seriesEntry.id}"`)
      }
      const view = seriesView(assetBuffers.get(seriesEntry.asset)!, header, descriptor)
      touchedSum += view[0] ?? 0
    }
    return touchedSum
  }

  let batchSize = INITIAL_DECODE_BATCH_SIZE
  let rawMs: number | undefined
  while (rawMs === undefined) {
    try {
      // eslint-disable-next-line no-await-in-loop
      rawMs = await measureBatchedMinOfN(REPEAT_COUNT, batchSize, decodeAllOnce)
    } catch (error) {
      const isFloorError = error instanceof Error && /below the .*timer-resolution floor/.test(error.message)
      if (!isFloorError) {
        throw error
      }
      if (batchSize >= MAX_DECODE_BATCH_SIZE) {
        throw new Error(
          `DATA-BUNDLE-DECODE: batch size reached ${batchSize} (the declared ceiling) without ` +
            `clearing the ${MIN_MEASUREMENT_MS}ms timer-resolution floor: ${(error as Error).message}`,
        )
      }
      batchSize *= 2
    }
  }
  const batchMinMs = rawMs * batchSize
  const normalizedMs = normalize(rawMs, score)

  await commands.recordEnvironment(captureEnvironment(score))

  // Reproducibility (T-01-14, RESEARCH.md Pitfall 3): the batch size, the batch minimum and the
  // per-call figure it was derived from, disclosed exactly like bench/kernel.bench.test.ts's
  // PERF-02 info line, so a sub-millisecond decode can never be reported as a bare, undisclosed
  // number.
  await commands.recordInfoLine(
    'DATA-BUNDLE-DECODE-info',
    `DATA-BUNDLE-DECODE batch: batchSize=${batchSize} batchMinMs=${batchMinMs.toFixed(4)} perCallMs=${rawMs.toFixed(4)}`,
  )

  const budget = PERF_BUDGETS['DATA-BUNDLE-DECODE']
  const row: MeasurementRow = {
    budgetId: budget.id,
    requirementId: budget.requirementId,
    measuredMs: rawMs,
    normalizedMs,
    budgetMs: budget.thresholdMs,
    anchorMs: budget.anchorMs,
    anchorLabel: budget.anchorLabel,
    // 'production': this decodes the real compiled bundle (Task 1's committed public/data/),
    // not throwaway spike code against synthetic input.
    source: 'production',
    verdict: checkBudget({ normalizedMs, budgetMs: budget.thresholdMs }),
  }
  await commands.recordMeasurement(row)

  expect(() => assertWithinBudget(row)).not.toThrow()
})

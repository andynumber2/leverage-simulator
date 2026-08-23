/**
 * bench/heatmap-panzoom.bench.test.ts: 07-10-PLAN.md Task 3, PERF-09 measurement.
 *
 * The SINGLE recorder of the PERF-09 `MeasurementRow` (`grep -rlc "budgetId: 'PERF-09'"
 * bench/*.bench.test.ts` must list exactly this file). Requires PAN and ZOOM measured TOGETHER:
 * both arms run against the real committed sweep fixture, adapted to a live `SweepGrid` the exact
 * same way `bench/heatmap-form-2.bench.test.ts` already does (`toSweepGrid`), at the SHIPPED
 * `HeatmapPanel.tsx` field geometry (800x240, D-12) so the measured cost reflects the real panel,
 * not an arbitrary bench size.
 *
 * `repaintUnderViewport` below is the EXACT technique `HeatmapPanel.tsx`'s own `repaint()`
 * uses: `ctx.translate(offsetX, offsetY); ctx.scale(scale, scale)` immediately before
 * `paintSweepField`, then `ctx.restore()`. This is deliberate, not a re-implementation of
 * production code for the bench's own convenience -- `src/heatmap/paint-contour.ts` was not
 * modified by 07-10-PLAN.md (see its own header: the D-09 offscreen-fill cache already handles
 * the "drawImage transform of the cached bitmap" tradeoff at unchanged
 * generation/metric/cols/rows, and every stroke pass is a genuine redraw), so measuring this
 * exact call sequence against the real `paintSweepField` IS measuring the real production repaint
 * path, with no separate viewport-aware renderer to drift out of sync with it.
 *
 * Correctness before trusting any figure, this project's own discipline: BEFORE either timed
 * measurement, this file asserts (a) the grid under test is the full 200x50 = 10,000-cell grid,
 * never a coarse or synthetic stand-in, (b) each arm's own repaint sequence actually paints
 * DIFFERENT pixel content at different steps (a gesture that is fast because it painted nothing,
 * or froze on one frame, cannot silently produce a passing figure), and (c) `grid.generation`
 * never changes across either arm (T-07-MUST: zoom/pan never re-sweeps).
 *
 * Measures BOTH arms (PERF-09 names pan and zoom together) and records the WORSE of the two
 * normalized figures as the official PERF-09 row, per this plan's own action text:
 * - PAN: a scripted drag at a zoomed-in scale, using `STEP_COUNT` (300) -- the SAME step-count
 *   discipline `bench/perf-07.bench.test.ts`'s own `INTERACTION_DRAG_STEP_COUNT` established.
 * - ZOOM: a scripted sequence stepping from fit scale (`FIT_VIEWPORT`) to `ZOOM_MAX_SCALE` and
 *   back, built from `src/heatmap/viewport.ts`'s own exported `zoomViewportAt` (not a
 *   hand-rolled scale interpolation), so the bench exercises the identical pointer-fixed-zoom
 *   maths `HeatmapPanel.tsx`'s wheel handler calls in production.
 *
 * If the normalized figure exceeds the 16ms budget or crosses `ESCALATION_TRIGGER_RATIO`, this
 * file records the figure and an escalation info line -- it does NOT relax `PERF_BUDGETS['PERF-09']`,
 * retune the calibration reference, or shrink the panel geometry (D-10: internal render
 * resolution is the only lever; cell count and panel size are not).
 */

import { commands } from 'vitest/browser'
import { beforeAll, expect, test } from 'vitest'

import { decodeSweepFixture, type SweepFixture } from '../src/data/sweep-fixture-format.ts'
import { paintSweepField } from '../src/heatmap/paint-contour.ts'
import {
  clampViewport,
  FIT_VIEWPORT,
  zoomViewportAt,
  ZOOM_MAX_SCALE,
  type FieldSize,
  type SweepViewport,
} from '../src/heatmap/viewport.ts'
import type { SweepGrid, SweepGridMeta } from '../src/sweep/sweep-grid.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { measureBatchedMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, escalationTriggered, type MeasurementRow } from './report.ts'

// --- Geometry and step-count discipline ---------------------------------------------------------

/** `HeatmapPanel.tsx`'s own shipped field geometry (D-12) -- the panel size PERF-09's own gesture
 * is actually painted at in production, not an arbitrary bench size. */
const MEASUREMENT_WIDTH_PX = 800
const MEASUREMENT_HEIGHT_PX = 240
const FIELD_SIZE: FieldSize = { widthPx: MEASUREMENT_WIDTH_PX, heightPx: MEASUREMENT_HEIGHT_PX }

/** Matches `bench/perf-07.bench.test.ts`'s own `INTERACTION_DRAG_STEP_COUNT` -- "the same
 * step-count discipline" this plan's own action text requires, for both arms so a reader can
 * compare a per-step pan cost against a per-step zoom cost on equal footing. */
const STEP_COUNT = 300

/** Batch size tuned empirically for this workload -- a full 800x240 repaint at a warm D-09
 * offscreen cache is cheap per call, so a large batch is needed to clear `MIN_MEASUREMENT_MS`. */
const REPEAT_BATCH_SIZE = STEP_COUNT

let fixture: SweepFixture
let grid: SweepGrid

beforeAll(async () => {
  const payload = await commands.readSweepFixture()
  const bytes = new Uint8Array(payload.bytes)
  fixture = decodeSweepFixture(bytes.buffer)
  grid = toSweepGrid(fixture)
})

/** Identical adapter to `bench/heatmap-form-2.bench.test.ts`'s own `toSweepGrid` -- the real,
 * committed 200x50 fixture, never a synthetic or coarse stand-in (T-07-23's own correctness
 * requirement). */
function toSweepGrid(source: SweepFixture): SweepGrid {
  const meta: SweepGridMeta = { ...source.meta, holdMode: 'fixed', endOfDataDate: '' }
  return {
    cols: source.cols,
    rows: source.rows,
    meta,
    multiples: source.multiples,
    drawdowns: source.drawdowns,
    annualized: new Float32Array(source.cols * source.rows),
    flags: source.flags,
    generation: 0,
  }
}

function makeCanvas(widthPx: number, heightPx: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  // Deliberately never appended to the DOM: a detached canvas still has a real 2D rendering
  // context and real paint cost (bench/heatmap-form-2.bench.test.ts's own precedent).
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('heatmap-panzoom bench: 2D context unavailable in this browser instance')
  }
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

/** The EXACT transform sequence `HeatmapPanel.tsx`'s own `repaint()` applies before calling
 * `paintSweepField` -- see this file's own header for why re-deriving this here (rather than
 * importing a viewport-aware paint function from `paint-contour.ts`) is measuring the real
 * production path, not a parallel one. */
function repaintUnderViewport(ctx: CanvasRenderingContext2D, sweepGrid: SweepGrid, viewport: SweepViewport): void {
  ctx.save()
  ctx.translate(viewport.offsetX, viewport.offsetY)
  ctx.scale(viewport.scale, viewport.scale)
  paintSweepField(ctx, sweepGrid, { metric: 'multiple' })
  ctx.restore()
}

function buffersDiffer(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return true
  }
  return false
}

// --- PAN arm: a scripted drag at a zoomed-in scale ----------------------------------------------

/** The drag's own starting viewport: zoomed in well past fit (matching D-34's "pan becomes
 * meaningful only once zoomed past fit" -- a pan at fit scale is a clamped no-op and would not
 * exercise real repaint work), pinned to the field's own top-left corner so the drag below has
 * headroom to move in both axes before `clampViewport` bounds it. */
const PAN_ZOOM_SCALE = 4
const PAN_START: SweepViewport = clampViewport({ scale: PAN_ZOOM_SCALE, offsetX: 0, offsetY: 0 }, FIELD_SIZE)

/** A scripted drag from `PAN_START`, sweeping the pan offset across a real, multi-cell distance
 * over `STEP_COUNT` steps -- `clampViewport` is called on every step, exactly as
 * `HeatmapPanel.tsx`'s own `handlePointerMove` calls it on every drag step. */
function panViewportAtStep(stepIndex: number): SweepViewport {
  const t = stepIndex / (STEP_COUNT - 1)
  const candidate: SweepViewport = {
    scale: PAN_START.scale,
    offsetX: PAN_START.offsetX - t * (MEASUREMENT_WIDTH_PX * (PAN_ZOOM_SCALE - 1)),
    offsetY: PAN_START.offsetY - t * (MEASUREMENT_HEIGHT_PX * (PAN_ZOOM_SCALE - 1)),
  }
  return clampViewport(candidate, FIELD_SIZE)
}

// --- ZOOM arm: fit scale to ZOOM_MAX_SCALE and back ----------------------------------------------

const ZOOM_CENTER_POINT = { x: MEASUREMENT_WIDTH_PX / 2, y: MEASUREMENT_HEIGHT_PX / 2 }

/** Built from `viewport.ts`'s own exported `zoomViewportAt` (never a hand-rolled scale
 * interpolation) -- the SAME pointer-fixed-zoom maths `HeatmapPanel.tsx`'s wheel handler calls in
 * production. Zooms IN across the first half of `STEP_COUNT`, from `FIT_VIEWPORT` to
 * `ZOOM_MAX_SCALE`, then back OUT across the remainder via the exact inverse per-step factor. */
function buildZoomSchedule(stepCount: number): SweepViewport[] {
  const halfCount = Math.floor(stepCount / 2)
  const schedule: SweepViewport[] = []
  let current: SweepViewport = FIT_VIEWPORT
  const zoomInFactor = Math.pow(ZOOM_MAX_SCALE / FIT_VIEWPORT.scale, 1 / halfCount)
  for (let i = 0; i < halfCount; i++) {
    current = zoomViewportAt(current, FIELD_SIZE, ZOOM_CENTER_POINT, zoomInFactor)
    schedule.push(current)
  }
  const zoomOutFactor = 1 / zoomInFactor
  while (schedule.length < stepCount) {
    current = zoomViewportAt(current, FIELD_SIZE, ZOOM_CENTER_POINT, zoomOutFactor)
    schedule.push(current)
  }
  return schedule
}

// --- The measurement itself -----------------------------------------------------------------

test('PERF-09: pan and zoom sustain one frame per interaction step at the full 10,000-cell grid', async () => {
  // Correctness criterion (a): the FULL grid, never a coarse or synthetic stand-in.
  expect(grid.cols).toBe(200)
  expect(grid.rows).toBe(50)
  expect(grid.cols * grid.rows).toBe(10_000)

  const generationBeforeMeasurement = grid.generation

  const panSchedule = Array.from({ length: STEP_COUNT }, (_, i) => panViewportAtStep(i))
  const zoomSchedule = buildZoomSchedule(STEP_COUNT)

  // Correctness criterion (b): each arm's own scripted sequence actually paints DIFFERENT pixel
  // content at different steps -- a frozen or skipped repaint must not be able to produce a
  // passing figure below.
  const { ctx: probeCtx } = makeCanvas(MEASUREMENT_WIDTH_PX, MEASUREMENT_HEIGHT_PX)
  repaintUnderViewport(probeCtx, grid, panSchedule[0]!)
  const panFrameStart = probeCtx.getImageData(0, 0, MEASUREMENT_WIDTH_PX, MEASUREMENT_HEIGHT_PX).data.slice()
  repaintUnderViewport(probeCtx, grid, panSchedule[Math.floor(STEP_COUNT / 2)]!)
  const panFrameMid = probeCtx.getImageData(0, 0, MEASUREMENT_WIDTH_PX, MEASUREMENT_HEIGHT_PX).data
  expect(
    buffersDiffer(panFrameStart, panFrameMid),
    'the scripted pan sequence painted identical pixels at step 0 and the mid-drag step -- the ' +
      'gesture is not actually moving the field',
  ).toBe(true)

  repaintUnderViewport(probeCtx, grid, zoomSchedule[0]!)
  const zoomFrameStart = probeCtx.getImageData(0, 0, MEASUREMENT_WIDTH_PX, MEASUREMENT_HEIGHT_PX).data.slice()
  repaintUnderViewport(probeCtx, grid, zoomSchedule[Math.floor(STEP_COUNT / 2)]!)
  const zoomFrameMid = probeCtx.getImageData(0, 0, MEASUREMENT_WIDTH_PX, MEASUREMENT_HEIGHT_PX).data
  expect(
    buffersDiffer(zoomFrameStart, zoomFrameMid),
    'the scripted zoom sequence painted identical pixels at fit scale and at the mid-sequence ' +
      'zoomed-in step -- the gesture is not actually magnifying the field',
  ).toBe(true)

  const score = await resolveRunCalibration()

  const { ctx: panCtx } = makeCanvas(MEASUREMENT_WIDTH_PX, MEASUREMENT_HEIGHT_PX)
  repaintUnderViewport(panCtx, grid, PAN_START) // warm the D-09 cache before timing, same as heatmap-form-2's own precedent
  let panStepIndex = 0
  const panRawMs = await measureBatchedMinOfN(REPEAT_COUNT, REPEAT_BATCH_SIZE, () => {
    repaintUnderViewport(panCtx, grid, panSchedule[panStepIndex]!)
    panStepIndex = (panStepIndex + 1) % STEP_COUNT
  })
  const panNormalizedMs = normalize(panRawMs, score)

  const { ctx: zoomCtx } = makeCanvas(MEASUREMENT_WIDTH_PX, MEASUREMENT_HEIGHT_PX)
  repaintUnderViewport(zoomCtx, grid, FIT_VIEWPORT)
  let zoomStepIndex = 0
  const zoomRawMs = await measureBatchedMinOfN(REPEAT_COUNT, REPEAT_BATCH_SIZE, () => {
    repaintUnderViewport(zoomCtx, grid, zoomSchedule[zoomStepIndex]!)
    zoomStepIndex = (zoomStepIndex + 1) % STEP_COUNT
  })
  const zoomNormalizedMs = normalize(zoomRawMs, score)

  // Correctness criterion (c): neither arm ever re-sweeps (T-07-MUST).
  expect(grid.generation).toBe(generationBeforeMeasurement)

  await commands.recordEnvironment(captureEnvironment(score))

  // PERF-09 names pan and zoom together: the recorded figure is the WORSE of the two.
  const worseArm = panNormalizedMs >= zoomNormalizedMs ? 'pan' : 'zoom'
  const worseRawMs = worseArm === 'pan' ? panRawMs : zoomRawMs
  const worseNormalizedMs = Math.max(panNormalizedMs, zoomNormalizedMs)

  const budget = PERF_BUDGETS['PERF-09']
  const row: MeasurementRow = {
    budgetId: budget.id,
    requirementId: budget.requirementId,
    measuredMs: worseRawMs,
    normalizedMs: worseNormalizedMs,
    budgetMs: budget.thresholdMs,
    anchorMs: budget.anchorMs,
    anchorLabel: budget.anchorLabel,
    source: 'production',
    verdict: checkBudget({ normalizedMs: worseNormalizedMs, budgetMs: budget.thresholdMs }),
  }
  await commands.recordMeasurement(row)

  // Per-arm info lines (attributable regression, per this plan's own action text) -- recorded
  // UNCONDITIONALLY, before any assertion below can throw.
  await commands.recordInfoLine(
    'PERF-09-pan',
    `PERF-09-pan: normalizedMs=${panNormalizedMs.toFixed(4)} rawMs=${panRawMs.toFixed(4)} ` +
      `stepCount=${STEP_COUNT} batchSize=${REPEAT_BATCH_SIZE} panZoomScale=${PAN_ZOOM_SCALE} ` +
      `geometry={widthPx:${MEASUREMENT_WIDTH_PX},heightPx:${MEASUREMENT_HEIGHT_PX}} budget=${budget.thresholdMs}ms`,
  )
  await commands.recordInfoLine(
    'PERF-09-zoom',
    `PERF-09-zoom: normalizedMs=${zoomNormalizedMs.toFixed(4)} rawMs=${zoomRawMs.toFixed(4)} ` +
      `stepCount=${STEP_COUNT} batchSize=${REPEAT_BATCH_SIZE} zoomMaxScale=${ZOOM_MAX_SCALE} ` +
      `geometry={widthPx:${MEASUREMENT_WIDTH_PX},heightPx:${MEASUREMENT_HEIGHT_PX}} budget=${budget.thresholdMs}ms`,
  )
  await commands.recordInfoLine(
    'PERF-09-official',
    `PERF-09-official: worseArm=${worseArm} normalizedMs=${worseNormalizedMs.toFixed(4)} ` +
      `rawMs=${worseRawMs.toFixed(4)} cellCount=${grid.cols * grid.rows} ` +
      `generationUnchanged=${grid.generation === generationBeforeMeasurement}`,
  )

  // D-20: a figure at or above 70% of budget escalates deliberately -- this surfaces the
  // candidate, it does not fail the run by itself, and no budget/calibration/geometry is
  // relaxed anywhere in this file in response to it (this file's own header, D-10).
  if (escalationTriggered(row.normalizedMs, row.budgetMs)) {
    await commands.recordInfoLine(
      'PERF-09-escalation',
      `PERF-09 escalation candidate (D-20, at or above 70% of budget): worseArm=${worseArm} ` +
        `normalizedMs=${worseNormalizedMs.toFixed(4)} budgetMs=${row.budgetMs}`,
    )
  }

  // The precise per-metric signal, next to the code that measured it. The authoritative gate is
  // the verdict check inside assertRunInvariants, which fails the run even if this line is
  // removed.
  expect(() => assertWithinBudget(row)).not.toThrow()
})

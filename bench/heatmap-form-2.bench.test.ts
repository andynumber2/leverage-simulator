/**
 * bench/heatmap-form-2.bench.test.ts: 07-04-PLAN.md Task 2, the D-07 gate.
 *
 * Proves equivalence BEFORE trusting any timing, then measures the shipped renderer
 * (`src/heatmap/paint-contour.ts`'s `paintSweepField`), not the Phase 6 mockup: `06-06`'s own
 * header note already recorded that this file must record the cost of the form actually being
 * built, and this task closes Finding F-05 (repointing the recorder at shipped code) at the same
 * time it runs D-07's own gate for the `'polygon'` `FillPath` this task adds.
 *
 * This file owns the run's single PERF-05 `MeasurementRow` (06-06's own header note, unchanged by
 * this task). It no longer imports anything from `.planning/phases/06-heatmap-design-pass/
 * mockups/` -- the graduated `src/heatmap/` modules (07-01) and the live `SweepGrid` container
 * (07-01's `src/sweep/sweep-grid.ts`) fully replace the mockup's own `SweepFixture`-shaped API for
 * this purpose, adapted here from the committed fixture bytes via `toSweepGrid`.
 *
 * Two gate criteria, in this order (D-07):
 *
 * 1. Equivalence: `paintSweepField` painted through the `'polygon'` `FillPath` (this task's new
 *    band-polygon fill) must match the `'resample'` `FillPath` (D-08's permanent, per-pixel
 *    oracle) within three named tolerances, checked BEFORE any timing figure below is trusted.
 * 2. The repaint budget: a metric-change repaint through `'polygon'` at a declared 1200x400
 *    display geometry (D-07's own "plausible shipped panel size", per 06-HEATMAP-SPEC.md Finding
 *    A's own prediction) must hold PERF-05's 16ms budget. The Phase 6 geometry (764x224) is
 *    recorded as an info line only, so the shipped number stays comparable to the prior recorded
 *    12.80ms without being the geometry the gate itself is judged against.
 *
 * If either criterion misses, this file records the measured figures and the specific failure
 * without relaxing any tolerance, budget, or geometry (07-04-PLAN.md's own prohibition): Task 3's
 * checkpoint is what decides what happens next, not this file.
 */

import { commands } from 'vitest/browser'
import { beforeAll, expect, test } from 'vitest'

import { decodeSweepFixture, type SweepFixture } from '../src/data/sweep-fixture-format.ts'
import { rampPositionFor } from '../src/colorscale/value-to-color.ts'
import { BAND_LEVELS } from '../src/heatmap/field-sampler.ts'
import { marchingSquaresSegments } from '../src/heatmap/iso-lines.ts'
import {
  gridColToDisplayX,
  gridRowToDisplayY,
  paintSweepField,
  type FillPath,
} from '../src/heatmap/paint-contour.ts'
import type { SweepGrid, SweepGridMeta } from '../src/sweep/sweep-grid.ts'
import { PERF_BUDGETS } from '../perf-budgets.ts'
import { measureBatchedMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'

// --- Named tolerances and geometry (D-07/D-04) --------------------------------------------------

/** Gate criterion 1a: the maximum fraction of field pixels the two fill paths may disagree on. */
const MAX_DIFFERING_PIXEL_RATIO = 0.02

/** Gate criterion 1b: a differing pixel must lie within this many pixels (Chebyshev distance,
 * `max(|dx|, |dy|)`) of a band boundary as located by `marchingSquaresSegments` over the same
 * ramp-position field, so the disagreement is confined to interpolation near a boundary rather
 * than a mis-stitched region. */
const MAX_BOUNDARY_DISTANCE_PX = 2

/** Gate criterion 1c: pixels inside a ruined or incomplete cell are categorical, never
 * interpolated, so the two paths must match EXACTLY there -- any disagreement is a stitching bug,
 * not an interpolation difference. */
const MAX_CATEGORICAL_DIFFERING_PIXELS = 0

/** The declared measurement geometry (D-07): 1200x400 display pixels over the 200x50 grid. Not
 * arbitrary -- 06-HEATMAP-SPEC.md Finding A names this as the plausible shipped panel size where
 * the per-pixel path was predicted to land near 36ms, so a polygon path proven here has actually
 * solved Finding A rather than dodged it by measuring at the smaller Phase 6 mockup geometry. */
const MEASUREMENT_WIDTH_PX = 1200
const MEASUREMENT_HEIGHT_PX = 400

/** The Phase 6 mockup's own geometry (06-HEATMAP-SPEC.md §7's `FORM_2_GEOMETRY` field rectangle),
 * recorded as an info line only (never the gated measurement) so the shipped 1200x400 number
 * stays comparable to the previously recorded 12.80ms figure at the geometry that number was
 * itself measured at. */
const PHASE_6_WIDTH_PX = 764
const PHASE_6_HEIGHT_PX = 224

/** Tuned empirically, per the file this replaces: form 2's repaint does far more per-pixel work
 * at 1200x400 than the Phase 6 mockup's own 764x224 measurement did, so a correspondingly smaller
 * batch than the mockup file's own 50 still clears `MIN_MEASUREMENT_MS`. */
const REPAINT_BATCH_SIZE = 20

let fixture: SweepFixture
let grid: SweepGrid

beforeAll(async () => {
  const payload = await commands.readSweepFixture()
  const bytes = new Uint8Array(payload.bytes)
  fixture = decodeSweepFixture(bytes.buffer)
  grid = toSweepGrid(fixture)
})

/** Adapts the committed, static `SweepFixture` into a `SweepGrid`: same `cols`/`rows`/
 * `multiples`/`drawdowns`/`flags` fields (`SweepGrid` structurally extends `SweepFixture`'s own
 * shape, 07-01-PLAN.md Task 2), plus the two fields a live grid carries that a fixture does not.
 * `holdMode: 'fixed'` matches the fixture's own real, positive `holdingYears` (06-HEATMAP-SPEC.md
 * §9); `endOfDataDate` is contractually unused in fixed mode, so it is left empty rather than
 * invented. `generation` starts at `0` so the "never triggers a sweep" assertion below has a
 * known baseline to compare against. */
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
  // context and real paint cost.
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('heatmap-form-2 bench: 2D context unavailable in this browser instance')
  }
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

function paintToBuffer(fillPath: FillPath, widthPx: number, heightPx: number): Uint8ClampedArray {
  const { ctx } = makeCanvas(widthPx, heightPx)
  paintSweepField(ctx, grid, { metric: 'multiple', fillPath })
  return ctx.getImageData(0, 0, widthPx, heightPx).data
}

function pixelsEqual(a: Uint8ClampedArray, b: Uint8ClampedArray, index: number): boolean {
  return a[index] === b[index] && a[index + 1] === b[index + 1] && a[index + 2] === b[index + 2] && a[index + 3] === b[index + 3]
}

interface DisplaySegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Every `BAND_LEVELS` boundary's own segments, in DISPLAY space, over the SAME ramp-position
 * field and `flags` the stroke annotation pass strokes -- the identical geometry a viewer would
 * see as a boundary line, so "close to a boundary" means close to what is actually drawn. */
function boundarySegmentsAt(widthPx: number, heightPx: number): DisplaySegment[] {
  const { cols, rows } = grid
  const cellCount = cols * rows
  const rampValues = new Float64Array(cellCount)
  for (let i = 0; i < cellCount; i++) {
    rampValues[i] = rampPositionFor(grid.multiples[i] ?? 0)
  }

  const segments: DisplaySegment[] = []
  for (const level of BAND_LEVELS) {
    for (const segment of marchingSquaresSegments(rampValues, cols, rows, level, grid.flags)) {
      segments.push({
        x1: gridColToDisplayX(segment.x1, widthPx, cols),
        y1: gridRowToDisplayY(segment.y1, heightPx, rows),
        x2: gridColToDisplayX(segment.x2, widthPx, cols),
        y2: gridRowToDisplayY(segment.y2, heightPx, rows),
      })
    }
  }
  return segments
}

function closestPointOnSegment(px: number, py: number, segment: DisplaySegment): { x: number; y: number } {
  const dx = segment.x2 - segment.x1
  const dy = segment.y2 - segment.y1
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return { x: segment.x1, y: segment.y1 }
  const t = Math.max(0, Math.min(1, ((px - segment.x1) * dx + (py - segment.y1) * dy) / lengthSquared))
  return { x: segment.x1 + t * dx, y: segment.y1 + t * dy }
}

/** The minimum Chebyshev distance from display pixel centre (`px + 0.5`, `py + 0.5`) to any of
 * `segments`. */
function minChebyshevDistanceToSegments(px: number, py: number, segments: readonly DisplaySegment[]): number {
  const qx = px + 0.5
  const qy = py + 0.5
  let min = Number.POSITIVE_INFINITY
  for (const segment of segments) {
    const closest = closestPointOnSegment(qx, qy, segment)
    const distance = Math.max(Math.abs(qx - closest.x), Math.abs(qy - closest.y))
    if (distance < min) min = distance
  }
  return min
}

/** Column/row of the sweep cell display pixel (`px`, `py`) falls into, honoring the same A-E5
 * vertical flip `paint-contour.ts`'s own pixel mapping bakes in. */
function cellAtDisplayPixel(px: number, py: number, widthPx: number, heightPx: number): { col: number; row: number } {
  const { cols, rows } = grid
  const col = Math.min(cols - 1, Math.max(0, Math.floor((px / widthPx) * cols)))
  const imgRow = Math.min(rows - 1, Math.max(0, Math.floor((py / heightPx) * rows)))
  return { col, row: rows - 1 - imgRow }
}

// --- Gate criterion 1: equivalence, proven BEFORE the timing below is trusted ------------------

test('equivalence: the polygon FillPath matches the resample FillPath (oracle) within the declared tolerances', async () => {
  const width = MEASUREMENT_WIDTH_PX
  const height = MEASUREMENT_HEIGHT_PX

  const resampleBuffer = paintToBuffer('resample', width, height)
  const polygonBuffer = paintToBuffer('polygon', width, height)
  expect(resampleBuffer.length).toBe(polygonBuffer.length)

  const segments = boundarySegmentsAt(width, height)

  let differingCount = 0
  let categoricalDifferingCount = 0
  let outOfToleranceCount = 0
  const totalPixels = width * height

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const index = (py * width + px) * 4
      if (pixelsEqual(resampleBuffer, polygonBuffer, index)) continue

      differingCount++

      const { col, row } = cellAtDisplayPixel(px, py, width, height)
      const flags = grid.flags[row * grid.cols + col] ?? 0
      if (flags !== 0) {
        categoricalDifferingCount++
        continue
      }

      const distance = minChebyshevDistanceToSegments(px, py, segments)
      if (distance > MAX_BOUNDARY_DISTANCE_PX) {
        outOfToleranceCount++
      }
    }
  }

  const differingRatio = differingCount / totalPixels

  // Recorded UNCONDITIONALLY, before any assertion below can throw: D-06's gate is placed after
  // this task specifically because the escalation decision is contingent on a measurement that
  // does not exist until this test runs, so the full set of measured figures must survive a
  // criterion miss, not just the first assertion that happens to throw.
  await commands.recordInfoLine(
    'D07-equivalence-heatmap-form-2',
    `D07-equivalence-heatmap-form-2: totalPixels=${totalPixels} differingCount=${differingCount} ` +
      `differingRatio=${(differingRatio * 100).toFixed(3)}% (ceiling ${(MAX_DIFFERING_PIXEL_RATIO * 100).toFixed(1)}%) ` +
      `categoricalDifferingCount=${categoricalDifferingCount} (ceiling ${MAX_CATEGORICAL_DIFFERING_PIXELS}) ` +
      `outOfToleranceCount=${outOfToleranceCount} (pixels beyond ${MAX_BOUNDARY_DISTANCE_PX}px of a boundary, ceiling 0) ` +
      `geometry={widthPx:${width},heightPx:${height}}`,
  )

  expect(
    categoricalDifferingCount,
    'pixels inside a ruined/incomplete cell must match exactly between the two fill paths',
  ).toBeLessThanOrEqual(MAX_CATEGORICAL_DIFFERING_PIXELS)

  expect(
    outOfToleranceCount,
    `${outOfToleranceCount} differing pixel(s) lie more than ${MAX_BOUNDARY_DISTANCE_PX}px ` +
      'from any band boundary: the disagreement is not confined to boundary interpolation',
  ).toBe(0)

  expect(
    differingRatio,
    `${(differingRatio * 100).toFixed(3)}% of field pixels differ, exceeding the ` +
      `${(MAX_DIFFERING_PIXEL_RATIO * 100).toFixed(1)}% ceiling`,
  ).toBeLessThanOrEqual(MAX_DIFFERING_PIXEL_RATIO)
})

// --- Gate criterion 2: the repaint budget, measured on the shipped renderer --------------------

test('PERF-05: form 2 (filled contour, polygon FillPath) repaint on a metric change, at the declared shipped-panel geometry', async () => {
  const score = await resolveRunCalibration()

  const { ctx } = makeCanvas(MEASUREMENT_WIDTH_PX, MEASUREMENT_HEIGHT_PX)
  // A cold first paint pays one-time cost (e.g. Path2D construction warmup) a warm metric toggle
  // never pays again -- warm before the timed repaint below.
  paintSweepField(ctx, grid, { metric: 'multiple', fillPath: 'polygon' })

  const generationBeforeMeasurement = grid.generation

  let metric: 'multiple' | 'drawdown' = 'multiple'
  const rawMs = await measureBatchedMinOfN(REPEAT_COUNT, REPAINT_BATCH_SIZE, () => {
    metric = metric === 'multiple' ? 'drawdown' : 'multiple'
    paintSweepField(ctx, grid, { metric, fillPath: 'polygon' })
  })
  const normalizedMs = normalize(rawMs, score)

  // The metric-change repaint reads the SAME cached grid and never re-sweeps it: PERF-05 is a
  // re-colour, not a re-sweep (07-04-PLAN.md's planner assumption on this requirement's own edge
  // family).
  expect(grid.generation).toBe(generationBeforeMeasurement)

  await commands.recordEnvironment(captureEnvironment(score))

  const budget = PERF_BUDGETS['PERF-05']
  const row: MeasurementRow = {
    budgetId: budget.id,
    requirementId: budget.requirementId,
    measuredMs: rawMs,
    normalizedMs,
    budgetMs: budget.thresholdMs,
    anchorMs: budget.anchorMs,
    anchorLabel: budget.anchorLabel,
    source: 'production',
    verdict: checkBudget({ normalizedMs, budgetMs: budget.thresholdMs }),
  }
  await commands.recordMeasurement(row)

  await commands.recordInfoLine(
    'PERF-05-heatmap-form-2',
    `PERF-05-heatmap-form-2: fillPath=polygon normalizedMs=${normalizedMs.toFixed(2)} ` +
      `rawMs=${rawMs.toFixed(4)} batchSize=${REPAINT_BATCH_SIZE} ` +
      `geometry={widthPx:${MEASUREMENT_WIDTH_PX},heightPx:${MEASUREMENT_HEIGHT_PX}} ` +
      `(gate criterion 2: measured against the declared plausible shipped panel size, per ` +
      '06-HEATMAP-SPEC.md Finding A, not the smaller Phase 6 mockup geometry)',
  )

  // The Phase 6 mockup geometry, recorded as an info line only: keeps the shipped number
  // comparable to the previously recorded 12.80ms figure without being the geometry the gate
  // itself is judged against.
  let phase6Metric: 'multiple' | 'drawdown' = 'multiple'
  const { ctx: phase6Ctx } = makeCanvas(PHASE_6_WIDTH_PX, PHASE_6_HEIGHT_PX)
  paintSweepField(phase6Ctx, grid, { metric: 'multiple', fillPath: 'polygon' })
  const phase6RawMs = await measureBatchedMinOfN(REPEAT_COUNT, REPAINT_BATCH_SIZE, () => {
    phase6Metric = phase6Metric === 'multiple' ? 'drawdown' : 'multiple'
    paintSweepField(phase6Ctx, grid, { metric: phase6Metric, fillPath: 'polygon' })
  })
  const phase6NormalizedMs = normalize(phase6RawMs, score)
  await commands.recordInfoLine(
    'PERF-05-heatmap-form-2-phase6-geometry',
    `PERF-05-heatmap-form-2-phase6-geometry: fillPath=polygon normalizedMs=${phase6NormalizedMs.toFixed(2)} ` +
      `rawMs=${phase6RawMs.toFixed(4)} batchSize=${REPAINT_BATCH_SIZE} ` +
      `geometry={widthPx:${PHASE_6_WIDTH_PX},heightPx:${PHASE_6_HEIGHT_PX}} ` +
      '(informational: comparable to the previously recorded 12.80ms per-pixel figure at this ' +
      'same geometry, not gated)',
  )

  expect(() => assertWithinBudget(row)).not.toThrow()
})

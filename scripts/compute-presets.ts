/**
 * scripts/compute-presets.ts
 *
 * 08-03-PLAN.md Task 2, D-18: computes every preset's headline outcome figure at BUILD time
 * against the compiled bundle and emits `src/app/presets.generated.ts`, so a figure cannot drift
 * from the model without CI going red. Structural copy of `scripts/measure-extended-tier-bias.ts`
 * (the existing, working precedent): a pure `computePresetOutcomes` the pinning test imports for
 * recomputation, plus an `import.meta.main`-guarded writer so merely importing this module for
 * that function never performs file I/O.
 *
 * F-07: reads `PRESET_DEFINITIONS` from `src/app/presets.ts` (never reimplements the library) and
 * calls the newly exported `computeDerivedMetrics` from `src/app/state.ts` (never reimplements
 * IRR/CAGR selection) -- the generator and the live UI select the same metric by construction.
 */

import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { PRESET_DEFINITIONS, type PresetDefinition } from '../src/app/presets.ts'
import { computeDerivedMetrics } from '../src/app/state.ts'
import { buildKernelInputs, type BacktestRequest } from '../src/data/kernel-inputs.ts'
import type { LoadedBundle } from '../src/data/bundle-source.ts'
import { loadBundleFromDisk } from '../src/data/load-bundle-node.ts'
import { runBacktest } from '../src/kernel/backtest.ts'

const GENERATED_MODULE_FILENAME = 'presets.generated.ts'

/** One preset's computed headline figures plus every metadata field the pinning test asserts
 * (`tests/app/presets.generated.test.ts`). Declared here, in the generator, rather than in
 * `src/app/presets.ts`: this is purely a build-time output shape, not part of the preset
 * definition contract. */
export interface PresetOutcome {
  id: string
  finalValue: number
  totalContributed: number
  finalValueMultiple: number
  maxDrawdown: number
  ruined: boolean
  ruinDate: string | null
  barCount: number
  irr: number | null
  cagr: number | null
  firstDate: string
  lastDate: string
  truncatedForRateCoverage: boolean
}

/**
 * Runs one preset's backtest against `bundle` and returns its `PresetOutcome`. Rethrows any
 * `buildKernelInputs` failure with the preset id named in the message, so a bad window (an entry
 * date that is not a real bar, or a holding period that overruns) says which preset it is rather
 * than surfacing a bare kernel-inputs error.
 */
function computeOnePresetOutcome(bundle: LoadedBundle, preset: PresetDefinition): PresetOutcome {
  let inputs
  try {
    inputs = buildKernelInputs(bundle, preset.request as BacktestRequest)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`compute-presets: preset "${preset.id}" failed to build kernel inputs: ${message}`)
  }

  const result = runBacktest(inputs.params, inputs.series, inputs.outputs)
  const derived = computeDerivedMetrics(bundle, inputs, result)

  return {
    id: preset.id,
    finalValue: result.finalValue,
    totalContributed: result.totalContributed,
    finalValueMultiple: derived.finalValueMultiple,
    maxDrawdown: result.maxDrawdown,
    ruined: result.ruined,
    ruinDate: derived.ruinDate,
    barCount: result.barCount,
    irr: derived.irr,
    cagr: derived.cagr,
    firstDate: inputs.window.firstDate,
    lastDate: inputs.window.lastDate,
    truncatedForRateCoverage: inputs.meta.truncatedForRateCoverage,
  }
}

/**
 * The measurement, as a pure function of an already-loaded bundle. Never writes a file; imported
 * directly by `tests/app/presets.generated.test.ts` for recomputation. Maps `PRESET_DEFINITIONS`
 * in declaration order, so `PRESET_OUTCOMES`'s ids always match `PRESET_DEFINITIONS`'s ids in the
 * same order.
 */
export function computePresetOutcomes(bundle: LoadedBundle): readonly PresetOutcome[] {
  return PRESET_DEFINITIONS.map((preset) => computeOnePresetOutcome(bundle, preset))
}

/** Write-to-temp-then-rename, mirroring `measure-extended-tier-bias.ts`'s
 * `writeGeneratedModule` so a reader/consumer of the generated module never observes a
 * partially-written file. */
function writeGeneratedModule(srcDir: string, outcomes: readonly PresetOutcome[], bundleVersion: string, measurementDate: string): void {
  mkdirSync(srcDir, { recursive: true })
  const outcomesLiteral = outcomes
    .map(
      (o) =>
        `  {\n` +
        `    id: ${JSON.stringify(o.id)},\n` +
        `    finalValue: ${JSON.stringify(o.finalValue)},\n` +
        `    totalContributed: ${JSON.stringify(o.totalContributed)},\n` +
        `    finalValueMultiple: ${JSON.stringify(o.finalValueMultiple)},\n` +
        `    maxDrawdown: ${JSON.stringify(o.maxDrawdown)},\n` +
        `    ruined: ${JSON.stringify(o.ruined)},\n` +
        `    ruinDate: ${JSON.stringify(o.ruinDate)},\n` +
        `    barCount: ${JSON.stringify(o.barCount)},\n` +
        `    irr: ${JSON.stringify(o.irr)},\n` +
        `    cagr: ${JSON.stringify(o.cagr)},\n` +
        `    firstDate: ${JSON.stringify(o.firstDate)},\n` +
        `    lastDate: ${JSON.stringify(o.lastDate)},\n` +
        `    truncatedForRateCoverage: ${JSON.stringify(o.truncatedForRateCoverage)},\n` +
        `  },`,
    )
    .join('\n')

  const contents = `/**
 * GENERATED FILE. Do not hand-edit.
 *
 * Regenerated by \`npm run compute-presets\` (scripts/compute-presets.ts).
 * SHARE-06/D-18: every preset's headline outcome, computed once at build time against the
 * compiled bundle. Pinned by tests/app/presets.generated.test.ts, which fails the build if the
 * committed figures below no longer match what the current bundle produces.
 */

/** One computed outcome per entry in \`PRESET_DEFINITIONS\` (src/app/presets.ts), in the same
 * declaration order -- \`id\` values line up 1:1. */
export interface PresetOutcome {
  id: string
  finalValue: number
  totalContributed: number
  finalValueMultiple: number
  maxDrawdown: number
  ruined: boolean
  ruinDate: string | null
  barCount: number
  irr: number | null
  cagr: number | null
  firstDate: string
  lastDate: string
  truncatedForRateCoverage: boolean
}

export const PRESET_OUTCOMES: readonly PresetOutcome[] = [
${outcomesLiteral}
]

/** The compiled bundle version every figure above was computed against. */
export const PRESET_OUTCOMES_BUNDLE_VERSION = ${JSON.stringify(bundleVersion)}

/** ISO date this figure set was last regenerated. Not itself a function of the bundle data, so
 * the pinning test does not assert this field against a live recomputation. */
export const PRESET_OUTCOMES_MEASUREMENT_DATE = ${JSON.stringify(measurementDate)}
`
  const finalPath = path.join(srcDir, GENERATED_MODULE_FILENAME)
  const tmpPath = path.join(
    srcDir,
    `.${GENERATED_MODULE_FILENAME}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  writeFileSync(tmpPath, contents)
  renameSync(tmpPath, finalPath)
}

/** Entry-point guard: `import.meta.main` is true only when this module is the process's own
 * entry script, never true when another module (the pinning test) imports it -- so importing
 * this file for `computePresetOutcomes` alone never writes to disk. */
if (import.meta.main) {
  const bundle = await loadBundleFromDisk()
  const outcomes = computePresetOutcomes(bundle)
  const measurementDate = new Date().toISOString().slice(0, 10)
  const srcDir = path.join(process.cwd(), 'src', 'app')
  writeGeneratedModule(srcDir, outcomes, bundle.manifest.bundleVersion, measurementDate)
  process.stdout.write(
    `compute-presets: wrote ${path.join(srcDir, GENERATED_MODULE_FILENAME)} -- ` +
      `${outcomes.length} preset outcomes at bundle version ${bundle.manifest.bundleVersion}\n`,
  )
}

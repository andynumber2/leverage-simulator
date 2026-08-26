/**
 * src/export/csv-preamble.ts
 *
 * 08-02-PLAN.md Task 2 (D-07): builds the `#`-commented preamble lines that carry every permalink
 * parameter, the bundle version, the active tier, the effective date range, the source names and
 * the permalink URL itself -- the receipts that travel with the exported artifact, since a CSV
 * detached from the app carries nothing otherwise.
 *
 * Takes already-resolved values rather than reading globals (`state.ts`, `window.location`), so
 * the Node `unit` test project can call `buildPreambleLines` directly with no DOM and no live app.
 *
 * `src/app/permalink.ts`'s own params-to-querystring serializer is the one canonical
 * serialization (Pitfall 5) and is called exactly once here, in the same field-by-field shape
 * `state.ts`'s `writePermalinkUrl` uses -- this module never re-formats a field a second,
 * different way. `src/app/components/ResultColumn/provenance-fields.ts`'s own field builder is
 * the one place a provenance string is composed, called exactly once here for the same reason.
 * Both modules are imported as namespaces (`import * as ...`) rather than by named export, so
 * each function's own name appears exactly once in this file -- at its single call site -- which
 * is what the file's own single-call-site discipline is built to make mechanically checkable.
 */

import type { BacktestRequest, KernelInputs } from '../data/kernel-inputs.ts'
import * as permalink from '../app/permalink.ts'
import * as provenanceFields from '../app/components/ResultColumn/provenance-fields.ts'
import type { Tier } from '../app/bounds.ts'
import type { Manifest } from '../../tools/bundle-compiler/src/manifest.ts'

/** D-07's accepted-cost note, stated verbatim inside the artifact itself (RESEARCH Pitfall 4)
 * rather than left as a support question. */
const HASH_LINE_NOTE =
  'Lines beginning with # are not standard CSV. Excel and Google Sheets import them as rows in ' +
  'column A rather than skipping them.'

/**
 * Builds the ordered preamble lines: a tool/timestamp line, one line per permalink key (in
 * `PERMALINK_KEYS` order, `holdingPeriodBars` omitted whenever `holdMode` is `end-of-data`,
 * matching the serializer's own emission rule), the provenance fields (tier, date range, sources,
 * seams crossed when present, bundle version), the permalink URL, and the D-07 hash-line note.
 * None of these lines carries a `#` prefix; `csv.worker.ts`'s `buildCsv` adds that.
 */
export function buildPreambleLines(
  inputs: KernelInputs,
  request: BacktestRequest,
  tier: Tier,
  scale: permalink.PermalinkScale,
  mode: permalink.PermalinkMode,
  metric: permalink.PermalinkMetric,
  permalinkUrl: string,
  manifest: Manifest,
): readonly string[] {
  const lines: string[] = []

  lines.push(`Leverage Simulator CSV export, generated ${new Date().toISOString()}`)

  const params: permalink.PermalinkParams = {
    symbol: request.symbol,
    dividendReinvest: request.dividendReinvest,
    leverage: request.leverage,
    entryDate: request.entryDate,
    holdingPeriodBars: request.holdingPeriodBars,
    initialInvestment: request.initialInvestment,
    contributionAmount: request.contributionAmount,
    contributionFrequency: request.contributionFrequency,
    expenseRatioPercent: request.expenseRatioPercent,
    financingSpreadPercent: request.financingSpreadPercent,
    holdMode: request.holdingPeriodBars === null ? 'end-of-data' : 'fixed',
    resolvedEndDate: inputs.window.lastDate,
    tier,
    scale,
    bundleVersion: inputs.meta.bundleVersion,
    mode,
    metric,
  }
  const qs = permalink.encodeParams(params)
  for (const key of permalink.PERMALINK_KEYS) {
    const value = qs.get(key)
    if (value !== null) lines.push(`${key}: ${value}`)
  }

  const fields = provenanceFields.buildProvenanceFields(manifest, inputs.meta.seriesId, inputs.window, tier, inputs.meta.bundleVersion)
  for (const field of fields) {
    lines.push(field.value)
  }

  lines.push(`permalink: ${permalinkUrl}`)
  lines.push(HASH_LINE_NOTE)

  return lines
}

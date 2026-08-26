/**
 * src/app/components/ResultColumn/ExportRow.tsx
 *
 * D-21/D-22/D-23/UI-SPEC E1: the export row -- three peer actions living OUTSIDE
 * `.screenshot-region`, styled identically to `.copy-link-button` (an action strip attached to
 * the result, not a second panel, UI-SPEC Visual Hierarchy rank 2). Composes the existing
 * `CopyLinkButton` unchanged as the first button (D-22: relocated from the parameter column,
 * which drops its own render call site); ships Export PNG and Export CSV, both fully wired
 * (UI-SPEC E1 zero-one-many: the row's shape never changes).
 *
 * Export PNG follows `CopyLinkButton.tsx`'s exact state-machine shape (`idle`/`confirmed`/
 * `failed`, a `LABELS` record, a clear-then-rearm 2000ms reset timer) with one load-bearing
 * deviation from a naive port: 08-RESEARCH.md Pattern 2 requires the PNG blob promise be built
 * WITHOUT awaiting it and passed directly as the `ClipboardItem` value -- awaiting the blob first
 * and calling `clipboard.write()` afterward is a documented WebKit user-activation failure mode.
 * D-23: on an absent Clipboard API/`ClipboardItem` constructor, or a rejected write, this falls
 * back to `triggerDownload`; only when that fallback itself throws does the button enter its
 * failed state.
 *
 * 08-02-PLAN.md: Export CSV has no confirmed state (D-23: a download has no clipboard-style
 * silent-success ambiguity to confirm -- the browser's own download UI is the confirmation), so
 * its state union is `idle`/`failed` only. Its handler calls `flushPermalinkUrl()` synchronously,
 * the same discipline `CopyLinkButton.tsx`'s header documents and for the same reason: an export
 * issued during or immediately after a drag must not embed a URL from before the drag settled.
 */

import { createSignal, Show } from 'solid-js'

import { fromDaysSinceEpoch } from '../../../../tools/bundle-compiler/src/calendar.ts'
import { buildCsvBlob, csvFilename } from '../../../export/csv-export.ts'
import { buildPreambleLines } from '../../../export/csv-preamble.ts'
import { triggerDownload } from '../../../export/download.ts'
import { exportRegionAsPng, pngFilename } from '../../../export/png-export.ts'
import {
  activeTier,
  backtestRequest,
  currentKernelInputs,
  currentKernelResult,
  displayedMetric,
  flushPermalinkUrl,
  loadedBundle,
  scaleMode,
} from '../../state.ts'
import { CopyLinkButton } from '../ParameterColumn/CopyLinkButton.tsx'

type ExportPngState = 'idle' | 'confirmed' | 'failed'
type ExportCsvState = 'idle' | 'failed'

const CONFIRMATION_DURATION_MS = 2000

const PNG_LABELS: Record<ExportPngState, string> = {
  idle: 'Export PNG',
  confirmed: 'Copied!',
  failed: 'Export failed',
}

const CSV_LABELS: Record<ExportCsvState, string> = {
  idle: 'Export CSV',
  failed: 'Export failed',
}

/** The one shared failure string both export paths use (UI-SPEC Copywriting Contract). */
const EXPORT_FAILURE_NOTE = 'Export failed - try again.'

export function ExportRow() {
  const [pngState, setPngState] = createSignal<ExportPngState>('idle')
  const [csvState, setCsvState] = createSignal<ExportCsvState>('idle')
  let pngResetTimer: ReturnType<typeof setTimeout> | undefined

  const disabled = () => currentKernelResult() === null

  function schedulePngReset(): void {
    if (pngResetTimer !== undefined) clearTimeout(pngResetTimer)
    pngResetTimer = setTimeout(() => setPngState('idle'), CONFIRMATION_DURATION_MS)
  }

  async function handleExportPngClick(): Promise<void> {
    const region = document.querySelector<HTMLElement>('[data-testid="screenshot-region"]')
    if (region === null) {
      setPngState('failed')
      return
    }

    // Load-bearing (08-RESEARCH.md Pattern 2): built WITHOUT awaiting, then passed directly as
    // the ClipboardItem value below -- Safari's activation gate requires the clipboard call
    // itself to be synchronous from this click handler.
    const blobPromise = exportRegionAsPng(region)

    if (navigator.clipboard === undefined || typeof ClipboardItem === 'undefined') {
      try {
        triggerDownload(await blobPromise, pngFilename())
      } catch {
        setPngState('failed')
      }
      return
    }

    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })])
      setPngState('confirmed')
      schedulePngReset()
    } catch {
      try {
        triggerDownload(await blobPromise, pngFilename())
      } catch {
        setPngState('failed')
      }
    }
  }

  /** D-09/T-08-09: builds the CSV entirely in a Worker, off the main thread. Every one of
   * `KernelSeries`' four per-bar input arrays and the two `KernelOutputs` arrays D-06's column
   * set needs are defensive `.slice()` copies -- the live buffers this handler reads from are
   * never handed to the worker, since the chart on screen is still reading them. The date column
   * is resolved here, on the main thread, by indexing the compiled calendar directly
   * (`calendar[window.entryIndex + i]`) rather than sent as raw day numbers, so the worker never
   * needs the calendar decoder at all. */
  async function handleExportCsvClick(): Promise<void> {
    const inputs = currentKernelInputs()
    const bundle = loadedBundle()
    if (inputs === null || bundle === null) {
      setCsvState('failed')
      return
    }

    const { window: runWindow, series, outputs, params } = inputs
    const returns = series.returns.slice()
    const shortRate = series.shortRate.slice()
    const calendarDaysElapsed = series.calendarDaysElapsed.slice()
    const contributionFlags = series.contributionFlags.slice()
    const outValue = outputs.outValue.slice()
    const outLongGap = outputs.outLongGap.slice()
    const dates: string[] = []
    for (let i = 0; i < runWindow.barCount; i++) {
      dates.push(fromDaysSinceEpoch(bundle.calendar[runWindow.entryIndex + i] ?? 0))
    }

    // D-22/CopyLinkButton.tsx discipline: forces any pending trailing-edge-debounced permalink
    // write to happen synchronously, right now, before the URL below is read.
    flushPermalinkUrl()
    const permalinkUrl = window.location.href
    const preambleLines = buildPreambleLines(
      inputs,
      backtestRequest(),
      activeTier(),
      scaleMode(),
      // 08-CONTEXT.md D-08: CSV export is single-run only, so the preamble's own `mode` value is
      // always 'single' regardless of what resultMode() reads at click time -- the exported file
      // describes the single run it actually contains, never a mode the button cannot be clicked
      // from.
      'single',
      displayedMetric(),
      permalinkUrl,
      bundle.manifest,
    )

    try {
      const blob = await buildCsvBlob({
        preambleLines,
        dates,
        returns,
        shortRate,
        calendarDaysElapsed,
        contributionFlags,
        contributionAmount: params.contributionAmount,
        outValue,
        outLongGap,
      })
      triggerDownload(blob, csvFilename())
    } catch {
      setCsvState('failed')
    }
  }

  return (
    <div class="export-row" data-testid="export-row">
      <CopyLinkButton />
      <button
        type="button"
        class="export-button"
        data-testid="export-png-button"
        data-export-state={pngState()}
        disabled={disabled()}
        onClick={() => void handleExportPngClick()}
      >
        {PNG_LABELS[pngState()]}
      </button>
      <button
        type="button"
        class="export-button"
        data-testid="export-csv-button"
        data-export-state={csvState()}
        disabled={disabled()}
        onClick={() => void handleExportCsvClick()}
      >
        {CSV_LABELS[csvState()]}
      </button>
      <Show when={pngState() === 'failed'}>
        <span class="export-failure-note" data-testid="export-png-failure-note">
          {EXPORT_FAILURE_NOTE}
        </span>
      </Show>
      <Show when={csvState() === 'failed'}>
        <span class="export-failure-note" data-testid="export-csv-failure-note">
          {EXPORT_FAILURE_NOTE}
        </span>
      </Show>
    </div>
  )
}

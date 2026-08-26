/**
 * src/app/components/ResultColumn/ExportRow.tsx
 *
 * D-21/D-22/D-23/UI-SPEC E1: the export row -- three peer actions living OUTSIDE
 * `.screenshot-region`, styled identically to `.copy-link-button` (an action strip attached to
 * the result, not a second panel, UI-SPEC Visual Hierarchy rank 2). Composes the existing
 * `CopyLinkButton` unchanged as the first button (D-22: relocated from the parameter column,
 * which drops its own render call site); ships Export PNG (fully wired) and a disabled Export CSV
 * placeholder button, so the row's shape never changes later when plan 08-02 wires the CSV
 * handler (UI-SPEC E1 zero-one-many).
 *
 * Export PNG follows `CopyLinkButton.tsx`'s exact state-machine shape (`idle`/`confirmed`/
 * `failed`, a `LABELS` record, a clear-then-rearm 2000ms reset timer) with one load-bearing
 * deviation from a naive port: 08-RESEARCH.md Pattern 2 requires the PNG blob promise be built
 * WITHOUT awaiting it and passed directly as the `ClipboardItem` value -- awaiting the blob first
 * and calling `clipboard.write()` afterward is a documented WebKit user-activation failure mode.
 * D-23: on an absent Clipboard API/`ClipboardItem` constructor, or a rejected write, this falls
 * back to `triggerDownload`; only when that fallback itself throws does the button enter its
 * failed state.
 */

import { createSignal, Show } from 'solid-js'

import { triggerDownload } from '../../../export/download.ts'
import { exportRegionAsPng, pngFilename } from '../../../export/png-export.ts'
import { currentKernelResult } from '../../state.ts'
import { CopyLinkButton } from '../ParameterColumn/CopyLinkButton.tsx'

type ExportPngState = 'idle' | 'confirmed' | 'failed'

const CONFIRMATION_DURATION_MS = 2000

const PNG_LABELS: Record<ExportPngState, string> = {
  idle: 'Export PNG',
  confirmed: 'Copied!',
  failed: 'Export failed',
}

/** The one shared failure string both export paths use (UI-SPEC Copywriting Contract). */
const EXPORT_FAILURE_NOTE = 'Export failed - try again.'

export function ExportRow() {
  const [pngState, setPngState] = createSignal<ExportPngState>('idle')
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
      {/* 08-02 wires the CSV handler behind this button; it ships disabled from this commit so
          the row's shape (exactly three buttons once 08-01 Task 2 composes Copy link) never
          changes. */}
      <button type="button" class="export-button" data-testid="export-csv-button" data-export-state="idle" disabled>
        Export CSV
      </button>
      <Show when={pngState() === 'failed'}>
        <span class="export-failure-note" data-testid="export-png-failure-note">
          {EXPORT_FAILURE_NOTE}
        </span>
      </Show>
    </div>
  )
}

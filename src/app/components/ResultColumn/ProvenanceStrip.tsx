/**
 * src/app/components/ResultColumn/ProvenanceStrip.tsx
 *
 * D-13: the dense provenance row inside the D-20 screenshot region, between the parameter column
 * and the result -- tier, effective date range, sources, the seams the run crossed, the bundle
 * version, a "Show all seams" disclosure (D-14) and the "View methodology" link (D-17, plain link
 * only in this plan -- 05-07 wires the overlay it opens). Reads `loadedBundle()` itself for the
 * manifest, the same way the parameter column's controls already do, and calls
 * `buildProvenanceFields` -- there is no second manifest fetch or decode path.
 *
 * 05-05: tier reads the live `activeTier()` signal, not a fixed value, so this field always
 * reflects the tier actually in effect rather than Phase 4's D-09 pin.
 */

import { createMemo, createSignal, For, Show } from 'solid-js'

import type { SeamRecord } from '../../../../tools/bundle-compiler/src/seams.ts'
import type { KernelInputs } from '../../../data/kernel-inputs.ts'
import { activeTier, loadedBundle } from '../../state.ts'
import { buildProvenanceFields, type ProvenanceField } from './provenance-fields.ts'

export interface ProvenanceStripProps {
  inputs: KernelInputs
}

/** T-05-08: a source anchor is rendered only when its url is genuinely `http(s)`; every other
 * value (a relative path, a bare string, anything else the manifest could ever carry) renders as
 * plain text instead. The manifest is build-time-authored and committed, so this is defence in
 * depth rather than a response to a live exploit path. */
const HTTP_URL_PATTERN = /^https?:\/\//

function formatSeamEntry(seam: SeamRecord): string {
  return `${seam.firstDate}–${seam.lastDate} (${seam.kind})`
}

export function ProvenanceStrip(props: ProvenanceStripProps) {
  const [showAllSeams, setShowAllSeams] = createSignal(false)

  const activeSeries = createMemo(() => {
    const bundle = loadedBundle()
    if (bundle === null) return null
    return bundle.manifest.series.find((s) => s.id === props.inputs.meta.seriesId) ?? null
  })

  const fields = createMemo<ProvenanceField[]>(() => {
    const bundle = loadedBundle()
    if (bundle === null) return []
    return buildProvenanceFields(
      bundle.manifest,
      props.inputs.meta.seriesId,
      { firstDate: props.inputs.window.firstDate, lastDate: props.inputs.window.lastDate },
      activeTier(),
      props.inputs.meta.bundleVersion,
    )
  })

  const symbol = createMemo(() => props.inputs.meta.seriesId.split('/')[0])

  /** D-17: appends `methodology=1` onto the CURRENT permalink query string. Reads
   * `window.location.search` as-is rather than calling `flushPermalinkUrl` first -- unlike
   * `CopyLinkButton` (`state.ts`), which flushes inside a click handler that fires once, this memo
   * recomputes on every completed run (D-03's rAF coalescing can fire on nearly every
   * slider-drag frame), and forcing a synchronous `history.replaceState` write on each of those
   * would defeat the whole point of `schedulePermalinkSync`'s trailing-edge debounce (PERF-07a/07b).
   * The href can therefore lag the very latest run by up to the debounce window, same as the
   * address bar itself does for any other passive reader -- immaterial in this plan, where the link
   * opens nothing yet (05-07 wires the overlay behind it). */
  const methodologyHref = createMemo(() => {
    // Establishes a reactive dependency on the current run so this recomputes every time a new
    // result lands, not only on first mount.
    void props.inputs
    const params = new URLSearchParams(window.location.search)
    params.set('methodology', '1')
    return `${window.location.pathname}?${params.toString()}${window.location.hash}`
  })

  return (
    <div class="provenance-strip" data-testid="provenance-strip">
      <For each={fields()}>
        {(field) => (
          <span class={`provenance-field provenance-field-${field.id}`} data-testid={`provenance-${field.id}`}>
            <Show when={field.sourceLinks !== undefined} fallback={field.value}>
              <span class="provenance-field-label">Sources: </span>
              <For each={field.sourceLinks}>
                {(link, index) => (
                  <>
                    <Show when={HTTP_URL_PATTERN.test(link.url)} fallback={<span>{link.name}</span>}>
                      <a href={link.url} target="_blank" rel="noreferrer noopener">
                        {link.name}
                      </a>
                    </Show>
                    <Show when={index() < field.sourceLinks!.length - 1}>{', '}</Show>
                  </>
                )}
              </For>
            </Show>
          </span>
        )}
      </For>

      <Show when={activeSeries() !== null}>
        <button
          type="button"
          class="provenance-seam-disclosure"
          data-testid="provenance-seam-disclosure"
          onClick={() => setShowAllSeams((value) => !value)}
        >
          Show all seams for {symbol()}
        </button>
        <Show when={showAllSeams()}>
          <ul class="provenance-all-seams" data-testid="provenance-all-seams">
            <For each={activeSeries()!.seams}>{(seam) => <li>{formatSeamEntry(seam)}</li>}</For>
          </ul>
        </Show>
      </Show>

      <a class="provenance-methodology-link" data-testid="provenance-methodology-link" href={methodologyHref()}>
        View methodology
      </a>
    </div>
  )
}

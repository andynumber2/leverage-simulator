/**
 * src/app/components/ParameterColumn/CopyLinkButton.tsx
 *
 * SHARE-01/UI-SPEC E10: the phase's one explicit action -- there is no "Run" or "Submit" button,
 * since parameter changes compute live (D-03). Disabled until a completed result exists, so there
 * is never a window where it copies a link to nothing. `src/app/state.ts` keeps
 * `window.location.href` in sync with the current parameters through a trailing-edge-debounced
 * `history.replaceState` (gap-closure fix, post-04-07: writing on every completed run stalled the
 * main thread during a scrub), so `handleClick` calls the exported `flushPermalinkUrl()` FIRST,
 * synchronously, before reading `window.location.href` -- the one call site that guarantees a
 * copy issued during or immediately after a drag can never yield a stale link, rather than
 * re-deriving the same encoding a second time (Pitfall 5: one canonical format, one call site).
 *
 * Three label states -- default, a transient confirmation, and a clipboard-failure fallback --
 * rendered at a fixed CSS width (`.copy-link-button`'s `min-width`) so the button never resizes on
 * state change (UI-SPEC E10 long-text). On a clipboard write rejection (permission denied, an
 * insecure context, or the API being altogether absent) the failure is reported in place -- never
 * a silent no-op -- and the permalink itself is rendered beside the button as a scrollable,
 * single-line monospace field the user can select manually. That fallback field is the ONE state
 * in which the permalink is ever rendered inline at all (UI-SPEC E10 overflow/error).
 */

import { createSignal, Show } from 'solid-js'

import { currentKernelResult, flushPermalinkUrl } from '../../state.ts'

type CopyState = 'idle' | 'confirmed' | 'failed'

const CONFIRMATION_DURATION_MS = 2000

const LABELS: Record<CopyState, string> = {
  idle: 'Copy link',
  confirmed: 'Copied!',
  failed: 'Copy failed',
}

export function CopyLinkButton() {
  const [copyState, setCopyState] = createSignal<CopyState>('idle')
  const [failedUrl, setFailedUrl] = createSignal('')
  let resetTimer: ReturnType<typeof setTimeout> | undefined

  const disabled = () => currentKernelResult() === null

  function scheduleReset(): void {
    if (resetTimer !== undefined) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => setCopyState('idle'), CONFIRMATION_DURATION_MS)
  }

  async function handleClick(): Promise<void> {
    // Correctness point of the gap-closure fix: forces any pending permalink write to happen
    // synchronously, right now, before the URL below is read -- without this, copying during or
    // immediately after a drag could hand back a URL from before the drag settled.
    flushPermalinkUrl()
    const url = window.location.href
    try {
      if (navigator.clipboard === undefined) {
        throw new Error('Clipboard API unavailable')
      }
      await navigator.clipboard.writeText(url)
      setCopyState('confirmed')
      scheduleReset()
    } catch {
      // UI-SPEC E10 error: a rejection (permission denied, insecure context, or an absent API) is
      // reported in place, never a silent no-op -- the permalink itself becomes the fallback below.
      setFailedUrl(url)
      setCopyState('failed')
    }
  }

  return (
    <div class="copy-link-row" data-testid="copy-link-row">
      <button
        type="button"
        class="copy-link-button"
        data-testid="copy-link-button"
        data-copy-state={copyState()}
        disabled={disabled()}
        onClick={() => void handleClick()}
      >
        {LABELS[copyState()]}
      </button>
      <Show when={copyState() === 'failed'}>
        <input
          type="text"
          class="copy-link-fallback"
          data-testid="copy-link-fallback"
          readonly
          value={failedUrl()}
          onFocus={(e) => e.currentTarget.select()}
        />
      </Show>
    </div>
  )
}

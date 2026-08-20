/**
 * src/app/main.tsx
 *
 * The Solid render root. `mountApp` is the one path both production use (the module-scope call
 * at the bottom of this file, guarded on `#root` existing) and
 * `tests/app/tracer.browser.test.ts` exercise -- the test mounts into its own container rather
 * than requiring a literal `#root` element in the document, but runs through the exact same
 * mount-plus-mark wiring production does.
 *
 * `app-data-ready` fires after the bundle has been fetched and decoded, the first kernel run has
 * completed, and the first chart paint has flushed (waited for with a double
 * `requestAnimationFrame`: the first callback runs before the browser paints the frame it was
 * scheduled in, so the *second* callback runs only after that paint). It is what PERF-08b's
 * data-load-and-first-render budget measures.
 *
 * `app-interactive` fires after `app-data-ready`, once the parameter column is enabled and able
 * to accept input and the first rAF recompute cycle has completed. It is what PERF-08a's and
 * PERF-08c's reaches-interactive budgets measure. In this plan the parameter column is empty, so
 * it resolves immediately after `app-data-ready`; plans 04-04 and 04-05 fill that column without
 * moving this mark, because the condition it names ("ready to accept parameter input") does not
 * change.
 *
 * Neither mark fires on module evaluation: both are set inside a `requestAnimationFrame`
 * callback gated on `loadStatus() === 'ready'` and a completed first run, which only happens
 * after `mountApp` is called and `initializeApp`'s fetch resolves.
 */

import { createEffect, createRoot } from 'solid-js'
import { render } from 'solid-js/web'

import { App } from './App.tsx'
import './styles.css'
import { currentKernelResult, loadStatus } from './state.ts'

/** Mounts `<App/>` into `rootElement` and wires the `app-data-ready` / `app-interactive`
 * performance marks. Returns a disposer that unmounts the component tree and tears down the
 * reactive root watching the marks. */
export function mountApp(rootElement: HTMLElement): () => void {
  const disposeRender = render(() => <App />, rootElement)

  let dataReadyMarked = false

  const disposeMarkWatcher = createRoot((disposeRoot) => {
    createEffect(() => {
      if (dataReadyMarked) return
      if (loadStatus() === 'ready' && currentKernelResult() !== null) {
        dataReadyMarked = true
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            performance.mark('app-data-ready')
            // Parameter column is empty this plan (04-04/04-05 fill it); "ready to accept
            // input" is already true the instant data is ready, so this mark follows
            // immediately rather than waiting on a condition that does not yet exist.
            performance.mark('app-interactive')
          })
        })
      }
    })
    return disposeRoot
  })

  return () => {
    disposeRender()
    disposeMarkWatcher()
  }
}

const root = document.getElementById('root')
if (root !== null) {
  mountApp(root)
}

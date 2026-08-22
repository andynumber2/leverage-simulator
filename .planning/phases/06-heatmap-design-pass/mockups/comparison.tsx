/**
 * .planning/phases/06-heatmap-design-pass/mockups/comparison.tsx
 *
 * D-05: the artifact that makes criterion 1's "reasons for rejecting the others" writable from
 * evidence rather than from recollection. One page renders all four competing D-02 forms on the
 * SAME committed fixture, the same axes and the same theme -- primary section on
 * multiple-of-contributed (D-04's argued metric), stress section on max drawdown (D-04's stress
 * case) -- so the judgement in plan 06-05's Task 2 is a comparison, not a memory of the last tab.
 *
 * Hand-rolled Solid.js (06-UI-SPEC.md's Design System row), the one place in this phase that is
 * not plain HTML/vanilla JS -- `vite-plugin-solid` is already registered globally in
 * `vite.config.ts`, so this `.tsx` under `.planning/` is transformed by `vite dev` with no config
 * change (06-01-PLAN.md's "Resolved before execution" note 1).
 *
 * Imports every paint function and the shared runtime from `./forms/` and `./shared/` rather than
 * reimplementing any panel (D-28): a later palette or caveat change re-renders all eight panels
 * (four forms x two metrics) here at once. `FormPanel` is the single component every one of the
 * eight canvases mounts through, styled identically with no front-runner (06-UI-SPEC.md Visual
 * Hierarchy, T-06-15) -- the choice has not been made when this page is built.
 */

import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import { render } from 'solid-js/web'

import '../../../../src/app/styles.css'
import {
  currentThemeOverride,
  initTheme,
  nextThemeOverride,
  onThemeChange,
  setThemeOverride,
} from '../../../../src/app/theme.ts'
import type { SweepFixture } from '../../../../src/data/sweep-fixture-format.ts'
import { loadSweepFixture, renderCaveat, renderLegend, type MockupGeometry } from './shared/mockup-runtime.ts'
import { FORM_1_GEOMETRY, paintDenseGrid } from './forms/form-1-dense-grid.ts'
import { FORM_2_GEOMETRY, paintFilledContour } from './forms/form-2-filled-contour.ts'
import { FORM_3_GEOMETRY, paintSmallMultiples } from './forms/form-3-small-multiples.ts'
import { FORM_4_GEOMETRY, paintGridWithContour } from './forms/form-4-grid-with-contour.ts'

type Metric = 'multiple' | 'drawdown'

interface FormEntry {
  id: string
  title: string
  geometry: MockupGeometry
  paint: (ctx: CanvasRenderingContext2D, fixture: SweepFixture, metric: Metric) => void
}

/** D-05/D-02: the four competing forms, in a fixed order that is not a ranking -- the same order
 * every other artifact in this phase lists them in. Titles are exactly the strings
 * `06-UI-SPEC.md`'s Copywriting Contract fixes. */
const FORMS: readonly FormEntry[] = [
  { id: 'form-1-dense-grid', title: 'Dense grid', geometry: FORM_1_GEOMETRY, paint: paintDenseGrid },
  { id: 'form-2-filled-contour', title: 'Filled contour', geometry: FORM_2_GEOMETRY, paint: paintFilledContour },
  { id: 'form-3-small-multiples', title: 'Small multiples', geometry: FORM_3_GEOMETRY, paint: paintSmallMultiples },
  {
    id: 'form-4-grid-with-contour',
    title: 'Grid + contour overlay',
    geometry: FORM_4_GEOMETRY,
    paint: paintGridWithContour,
  },
]

const FIXTURE_URL = './sweep-fixture.bin'

/** Two 800px panels plus `--space-xl` of gap need roughly this much track width; below it the
 * grid falls to a single column rather than clipping a panel or forcing horizontal scroll
 * (UI-SPEC E1/E2 overflow backstops). */
const COMPARISON_GRID_STYLE = {
  display: 'grid',
  'grid-template-columns': 'repeat(auto-fit, minmax(820px, 1fr))',
  gap: 'var(--space-xl)',
} as const

/**
 * One panel: the 14px 600-weight title, a canvas at `geometry`'s own display size, the caveat
 * directly under the canvas, and the legend under the caveat -- via `renderCaveat`/`renderLegend`
 * so all eight panels on this page carry byte-identical copy (D-23). Panel padding is
 * `var(--space-lg)`, panel surface is `var(--color-surface)` with a `var(--color-border)` border.
 * Every panel that mounts through this component gets identical styling (T-06-15): no per-form
 * branch here decides emphasis, width or order.
 *
 * Repaints on every `onThemeChange` flip (D-06: canvas gets no free `prefers-color-scheme`
 * styling) and unsubscribes in `onCleanup`. The caveat and legend are painted once on mount --
 * D-15's one background-neutral palette means the field's own colours never change with theme,
 * and the legend/caveat DOM nodes read their colours from CSS custom properties that the browser
 * already repaints for free on `data-theme` change; only the canvas paint function itself reads
 * CSS custom properties imperatively (axis-label and border-stroke colours) and needs an explicit
 * repaint hook.
 */
function FormPanel(props: {
  title: string
  geometry: MockupGeometry
  paint: (ctx: CanvasRenderingContext2D, fixture: SweepFixture, metric: Metric) => void
  fixture: SweepFixture
  metric: Metric
}) {
  let canvasRef: HTMLCanvasElement | undefined
  let caveatRef: HTMLDivElement | undefined
  let legendRef: HTMLDivElement | undefined

  onMount(() => {
    const ctx = canvasRef?.getContext('2d')
    if (!ctx) {
      throw new Error('comparison: 2D context unavailable for a form panel canvas')
    }

    const repaint = () => props.paint(ctx, props.fixture, props.metric)
    repaint()
    onCleanup(onThemeChange(repaint))

    if (caveatRef) renderCaveat(caveatRef)
    if (legendRef) renderLegend(legendRef, props.geometry.widthPx)
  })

  return (
    <div
      data-testid="comparison-form-panel"
      style={{
        padding: 'var(--space-lg)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        'border-radius': '4px',
        display: 'flex',
        'flex-direction': 'column',
        gap: 'var(--space-md)',
      }}
    >
      <h2
        style={{
          margin: '0',
          'font-size': '14px',
          'font-weight': '600',
          color: 'var(--color-text)',
        }}
      >
        {props.title}
      </h2>
      <canvas
        ref={canvasRef}
        data-testid="comparison-canvas"
        width={props.geometry.widthPx}
        height={props.geometry.heightPx}
        style={{
          width: `${props.geometry.widthPx}px`,
          height: `${props.geometry.heightPx}px`,
          display: 'block',
        }}
      />
      <div ref={caveatRef} />
      <div ref={legendRef} />
    </div>
  )
}

/**
 * D-05's comparison page. Calls `initTheme()` once in `onMount`, fetches the fixture ONCE via
 * `loadSweepFixture`, and renders nothing but the page shell until it resolves -- no per-panel
 * spinner, no partial reveal (UI-SPEC E1 loading and partial). On a rejected fetch or a thrown
 * `SweepFixtureFormatError`, `loadSweepFixture` itself already replaces the page body with a
 * visible failure block naming the URL and the error (UI-SPEC E1 error backstop); this component
 * only needs to stop waiting, not build a second failure UI.
 *
 * Two static sections (D-07: no toggle, no hover, no tooltip, no click, no pan, no zoom). PRIMARY
 * renders the four forms on multiple-of-contributed, the metric the design is argued on (D-04).
 * STRESS, under a 48px `var(--space-2xl)` gap, re-renders the same four forms on max drawdown --
 * a bounded, zero-to-one metric with no breakeven -- so a form quietly suited to one distribution's
 * shape shows it here rather than later on Phase 7's metric toggle. The only interactive element
 * on the page is the theme toggle, wired to
 * `setThemeOverride(nextThemeOverride(currentThemeOverride()))` and reused verbatim from
 * `src/app/theme.ts`.
 */
export function ComparisonPage() {
  const [fixture, setFixture] = createSignal<SweepFixture | null>(null)
  const [themeLabel, setThemeLabel] = createSignal(currentThemeOverride())

  onMount(() => {
    initTheme()
    loadSweepFixture(FIXTURE_URL)
      .then((loaded) => setFixture(loaded))
      .catch(() => {
        // loadSweepFixture already replaced document.body with a visible failure block naming
        // the URL and the error (UI-SPEC E1 error backstop). Nothing further to render here.
      })
  })

  const handleThemeToggle = () => {
    setThemeOverride(nextThemeOverride(currentThemeOverride()))
    setThemeLabel(currentThemeOverride())
  }

  return (
    <Show when={fixture()} fallback={<div data-testid="comparison-shell" />}>
      {(loadedFixture) => (
        <div data-testid="comparison-shell" style={{ padding: 'var(--space-xl)' }}>
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between',
              'margin-bottom': 'var(--space-xl)',
              gap: 'var(--space-md)',
            }}
          >
            <h1
              style={{
                margin: '0',
                'font-size': 'var(--font-size-body)',
                'font-weight': '600',
                color: 'var(--color-text)',
              }}
            >
              D-05 comparison: four competing heatmap forms, judged on the same data
            </h1>
            <button type="button" class="theme-toggle" data-testid="theme-toggle" onClick={handleThemeToggle}>
              {`theme: ${themeLabel()}`}
            </button>
          </div>

          <section data-testid="comparison-primary-section" style={COMPARISON_GRID_STYLE}>
            <For each={FORMS}>
              {(form) => (
                <FormPanel
                  title={form.title}
                  geometry={form.geometry}
                  paint={form.paint}
                  fixture={loadedFixture()}
                  metric="multiple"
                />
              )}
            </For>
          </section>

          <p
            data-testid="comparison-stress-note"
            style={{
              'margin-top': 'var(--space-2xl)',
              'margin-bottom': 'var(--space-md)',
              'font-size': 'var(--font-size-body)',
              'font-family': 'var(--font-ui)',
              'line-height': '1.5',
              color: 'var(--color-text)',
            }}
          >
            The same four forms, re-rendered below on max drawdown: a bounded, zero-to-one metric
            with no breakeven and no orders-of-magnitude span. A form quietly suited to one
            distribution's shape shows it here rather than later, on the metric toggle.
          </p>

          <section data-testid="comparison-stress-section" style={COMPARISON_GRID_STYLE}>
            <For each={FORMS}>
              {(form) => (
                <FormPanel
                  title={form.title}
                  geometry={form.geometry}
                  paint={form.paint}
                  fixture={loadedFixture()}
                  metric="drawdown"
                />
              )}
            </For>
          </section>
        </div>
      )}
    </Show>
  )
}

const root = document.getElementById('comparison-root')
if (root !== null) {
  render(() => <ComparisonPage />, root)
}

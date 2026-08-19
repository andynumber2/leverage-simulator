/**
 * src/app/components/ResultColumn/LogScaleToggle.tsx
 *
 * VIZ-08/D-19: the visible log/linear choice. Both labels render in the DOM at all times (never
 * conditionally shown) so the active choice is readable from a screenshot, per D-18's "reads as a
 * measuring instrument" voice -- the active state is a color change (`--color-accent`), not a
 * label swap. Minimum 44x44px hit area on each button regardless of visual size, for touch
 * accessibility (04-UI-SPEC.md Spacing Scale exceptions).
 */

import type { ScaleMode } from '../../state.ts'

export interface LogScaleToggleProps {
  scale: ScaleMode
  onChange: (mode: ScaleMode) => void
}

export function LogScaleToggle(props: LogScaleToggleProps) {
  return (
    <div class="log-scale-toggle" data-testid="log-scale-toggle" role="group" aria-label="Chart y-axis scale">
      <button
        type="button"
        class="log-scale-toggle__button"
        classList={{ 'log-scale-toggle__button--active': props.scale === 'log' }}
        aria-pressed={props.scale === 'log'}
        data-testid="log-scale-toggle-log"
        onClick={() => props.onChange('log')}
      >
        log
      </button>
      <button
        type="button"
        class="log-scale-toggle__button"
        classList={{ 'log-scale-toggle__button--active': props.scale === 'linear' }}
        aria-pressed={props.scale === 'linear'}
        data-testid="log-scale-toggle-linear"
        onClick={() => props.onChange('linear')}
      >
        linear
      </button>
    </div>
  )
}

/**
 * src/app/components/ThemeToggle.tsx
 *
 * D-19/VIZ-11: the manual theme-override control -- 04-UI-SPEC.md's Icon library row names it
 * explicitly ("hand-authored inline SVG (log/linear toggle, theme override, copy-link, ruin
 * marker)"). A single control that cycles system -> light -> dark -> system on click, per the
 * plan's own wording ("a small control cycling the override"), not a three-button group like
 * `LogScaleToggle`. 44x44px minimum hit area (04-UI-SPEC.md Spacing Scale's icon-only
 * touch-target exception).
 *
 * Deliberately never accent-colored: accent stays reserved for the equity-curve stroke, the
 * active log/linear toggle state, focus outlines and the Copy link button. A second
 * accent-colored control on this screen would compete with the chart for first read
 * (04-UI-SPEC.md Layout & Component Reference -> Visual hierarchy). The active/resolved state is
 * communicated by icon swap alone, styled in `--color-text-muted` like every other chrome
 * control (`.theme-toggle` in `styles.css`).
 *
 * Icons are inline SVG using `stroke="currentColor"` -- no hex literal anywhere in this file, so
 * every colour still traces back to the seven custom properties declared once in `styles.css`.
 */

import { Show } from 'solid-js'

import { currentThemeOverride, nextThemeOverride, setThemeOverride, type ThemeOverride } from '../theme.ts'

const LABELS: Record<ThemeOverride, string> = {
  system: 'Theme: following system. Click to force light.',
  light: 'Theme: light. Click to force dark.',
  dark: 'Theme: dark. Click to follow the system.',
}

/** A monitor glyph: following the system rather than forcing either palette. */
function SystemIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="8" rx="1" />
      <line x1="5.5" y1="13.5" x2="10.5" y2="13.5" stroke-linecap="round" />
      <line x1="8" y1="10.5" x2="8" y2="13.5" />
    </svg>
  )
}

/** A sun glyph: the light palette is forced. */
function LightIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="2.6" />
      <line x1="8" y1="13.4" x2="8" y2="15" />
      <line x1="1" y1="8" x2="2.6" y2="8" />
      <line x1="13.4" y1="8" x2="15" y2="8" />
      <line x1="3.1" y1="3.1" x2="4.2" y2="4.2" />
      <line x1="11.8" y1="11.8" x2="12.9" y2="12.9" />
      <line x1="3.1" y1="12.9" x2="4.2" y2="11.8" />
      <line x1="11.8" y1="4.2" x2="12.9" y2="3.1" />
    </svg>
  )
}

/** A crescent-moon glyph: the dark palette is forced. */
function DarkIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M13.5 9.7A6 6 0 0 1 6.3 2.5a6 6 0 1 0 7.2 7.2Z" />
    </svg>
  )
}

export function ThemeToggle() {
  const override = () => currentThemeOverride()
  const label = () => LABELS[override()]

  return (
    <button
      type="button"
      class="theme-toggle"
      data-testid="theme-toggle"
      data-theme-override={override()}
      aria-label={label()}
      title={label()}
      onClick={() => setThemeOverride(nextThemeOverride(override()))}
    >
      <Show when={override() === 'system'}>
        <SystemIcon />
      </Show>
      <Show when={override() === 'light'}>
        <LightIcon />
      </Show>
      <Show when={override() === 'dark'}>
        <DarkIcon />
      </Show>
    </button>
  )
}

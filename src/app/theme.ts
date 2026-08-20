/**
 * src/app/theme.ts
 *
 * D-19/VIZ-11: resolves the app's theme from `prefers-color-scheme` plus an explicit manual
 * override, writes the result onto `<html data-theme="...">` (which is what selects between the
 * two palettes `styles.css` already declares), and notifies subscribers so anything that reads
 * CSS custom properties at render time -- specifically `EquityCurveChart`'s canvas, which gets no
 * free `prefers-color-scheme` styling -- can repaint explicitly rather than staying the colour it
 * was born with.
 *
 * `getMediaQueryList` re-queries `window.matchMedia` on every call instead of caching a
 * `MediaQueryList` at module scope: this module is imported statically, and a static import
 * resolves before any test body runs, so caching at import time would freeze on whatever
 * `matchMedia` returned before a test's `vi.stubGlobal('matchMedia', ...)` could ever apply.
 * Re-querying inside `initTheme`/`setThemeOverride` -- both called from application/test code
 * that runs after any such stub is installed -- is what makes the emulated-system-preference
 * tests in `tests/app/theme.browser.test.ts` actually observe their own stub.
 *
 * Persisted only in an in-memory module binding (`overrideSignal`) -- no `localStorage`, no
 * cookie, no query param. A manual override is a per-session choice, and D-19 states nothing
 * about it surviving a reload; adding a storage dependency here would be new surface for no
 * stated requirement.
 */

import { createSignal } from 'solid-js'

export type ThemeOverride = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

/** `ThemeToggle`'s cycle order: following the system, forcing light, forcing dark, back to
 * following the system. */
const CYCLE_ORDER: readonly ThemeOverride[] = ['system', 'light', 'dark']

const [overrideSignal, setOverrideSignal] = createSignal<ThemeOverride>('system')
const [resolvedSignal, setResolvedSignal] = createSignal<ResolvedTheme>('light')

const listeners = new Set<() => void>()

/** Guards against registering a second `change` listener on every `initTheme()` call (App's
 * `onMount` calls it on every mount, the same idempotency pattern `state.ts`'s `initializeApp`
 * already uses). `resetThemeState` clears this for tests that want a fresh listener bound to a
 * freshly stubbed `matchMedia`. */
let changeListenerAttached = false

function getMediaQueryList(): MediaQueryList {
  return window.matchMedia(DARK_MEDIA_QUERY)
}

function computeResolvedTheme(override: ThemeOverride): ResolvedTheme {
  if (override === 'light') return 'light'
  if (override === 'dark') return 'dark'
  return getMediaQueryList().matches ? 'dark' : 'light'
}

/** Writes the resolved theme onto `<html data-theme="...">`, updates the reactive
 * `resolveTheme()` signal, and notifies every `onThemeChange` subscriber. The single place both
 * a manual override and a system-preference flip funnel through. */
function applyTheme(): void {
  const resolved = computeResolvedTheme(overrideSignal())
  setResolvedSignal(resolved)
  document.documentElement.setAttribute('data-theme', resolved)
  for (const listener of listeners) listener()
}

/** The current override choice: `'system'` (the default), `'light'`, or `'dark'`. Reactive --
 * reading it inside a Solid component or `createEffect` tracks it, which is how `ThemeToggle`
 * re-renders its icon on click without any extra plumbing. */
export function currentThemeOverride(): ThemeOverride {
  return overrideSignal()
}

/** The resolved theme actually applied to `data-theme`: `override` if it is `'light'`/`'dark'`,
 * otherwise whatever `prefers-color-scheme` currently reports. Reactive, same as
 * `currentThemeOverride`. */
export function resolveTheme(): ResolvedTheme {
  return resolvedSignal()
}

/** `ThemeToggle`'s click handler: system -> light -> dark -> system. */
export function nextThemeOverride(current: ThemeOverride): ThemeOverride {
  const index = CYCLE_ORDER.indexOf(current)
  return CYCLE_ORDER[(index + 1) % CYCLE_ORDER.length]!
}

/**
 * Registers the `prefers-color-scheme` `change` listener exactly once per module lifetime
 * (`changeListenerAttached`) and applies whatever theme is currently resolved. Safe, and
 * intended, to call on every mount -- `App`'s `onMount` calls this unconditionally, the same way
 * it already calls `initializeApp()` unconditionally.
 */
export function initTheme(): void {
  if (!changeListenerAttached) {
    changeListenerAttached = true
    getMediaQueryList().addEventListener('change', () => {
      // A system-preference flip only matters while nothing has overridden it -- an active
      // 'light'/'dark' override must not be silently blown away by the OS changing its mind.
      if (overrideSignal() === 'system') applyTheme()
    })
  }
  applyTheme()
}

/** `ThemeToggle`'s write path. Setting `'system'` is how a user clears a prior override and
 * returns to following the OS preference. */
export function setThemeOverride(theme: ThemeOverride): void {
  setOverrideSignal(theme)
  applyTheme()
}

/** `EquityCurveChart` subscribes here so it can repaint explicitly on every theme change --
 * canvas gets no free `prefers-color-scheme` styling. Returns an unsubscribe function, called
 * from the subscriber's `onCleanup`. */
export function onThemeChange(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/** Test-only reset, mirroring `state.ts`'s `resetAppState`: clears the override back to
 * `'system'` and the "listener already attached" guard, so a test that stubs `window.matchMedia`
 * before calling `initTheme()` binds its listener to its OWN stub rather than inheriting a
 * listener a prior test in the same file already attached to a different `matchMedia`. */
export function resetThemeState(): void {
  setOverrideSignal('system')
  changeListenerAttached = false
}

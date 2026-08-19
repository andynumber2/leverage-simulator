/**
 * src/app/components/ResultColumn/ValidationExplanation.tsx
 *
 * D-10/D-11/D-12: the full three-variant explanation surface, kept as one component so the UI-SPEC
 * E9 stacking order (bundle mismatch, then single-field evictions, then cross-field caveats) lives
 * in exactly one place -- no caller can reorder it, and a caller supplying variants in any order
 * gets the same rendered order back. Absent by default: an empty `variants` array renders no DOM
 * nodes at all, no placeholder or reserved slot (E9 empty).
 *
 * Variant `single-field-eviction` (D-12, plan 04-04): the chart and metrics are already cleared by
 * `src/app/state.ts`'s `scheduleRun` before this renders -- only this line remains. `message` is
 * `buildKernelInputs`' own thrown range-rejection text, rendered verbatim (D-32).
 *
 * Variant `cross-field-caveat` (D-10, this plan): a fixed holding period running past the last
 * fully-supported bar, or D-29's rate-coverage truncation reaching the same fact by a different
 * route. Caveat-and-compute, not clear-and-explain -- `scheduleRun` has already resolved the run to
 * the supported window before this variant is ever produced, so the chart and metrics stay on
 * screen alongside it.
 *
 * Variant `bundle-mismatch` (D-15): the slot and its position in the stacking order are declared
 * here; plan 04-07 supplies the comparison and the message. No caller produces this variant yet.
 */

import { For } from 'solid-js'

export type ExplanationVariantKind = 'bundle-mismatch' | 'single-field-eviction' | 'cross-field-caveat'

export interface ExplanationVariant {
  kind: ExplanationVariantKind
  message: string
}

/** UI-SPEC E9 partial: the fixed stacking order every simultaneous set of violations renders in,
 * regardless of the order `variants` is supplied in. Declared once, here, so it cannot drift
 * between callers. */
const STACK_ORDER: Record<ExplanationVariantKind, number> = {
  'bundle-mismatch': 0,
  'single-field-eviction': 1,
  'cross-field-caveat': 2,
}

export interface ValidationExplanationProps {
  variants: ExplanationVariant[]
}

export function ValidationExplanation(props: ValidationExplanationProps) {
  const sorted = () => [...props.variants].sort((a, b) => STACK_ORDER[a.kind] - STACK_ORDER[b.kind])

  return (
    <For each={sorted()}>
      {(variant) => (
        <div class="validation-explanation" data-testid="validation-explanation" data-variant={variant.kind} role="alert">
          {variant.message}
        </div>
      )}
    </For>
  )
}

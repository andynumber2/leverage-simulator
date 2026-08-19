/**
 * src/app/components/ResultColumn/ValidationExplanation.tsx
 *
 * D-11/D-12: the single-field eviction variant of the clear-and-explain surface. Rendered in place
 * of the chart and metrics panel -- never alongside them -- whenever the current parameter
 * combination cannot produce a result, in `--color-destructive` at Body size (never a hardcoded
 * hex value in this file). `message` is `buildKernelInputs`' own thrown error text
 * (`src/app/state.ts`'s `scheduleRun` catches it), which already names the offending value and
 * the supported range (D-32); this component does not re-author that copy.
 *
 * Plan 04-05 extends this component with the cross-field caveat variant and the stacking order
 * (bundle mismatch, then single-field evictions, then cross-field caveats) -- this plan renders
 * only the one message `scheduleRun` currently produces.
 */

export interface ValidationExplanationProps {
  message: string
}

export function ValidationExplanation(props: ValidationExplanationProps) {
  return (
    <div class="validation-explanation" data-testid="validation-explanation" role="alert">
      {props.message}
    </div>
  )
}

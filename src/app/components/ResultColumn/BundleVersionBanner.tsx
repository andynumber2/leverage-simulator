/**
 * src/app/components/ResultColumn/BundleVersionBanner.tsx
 *
 * D-15: computes the "this link's data bundle is stale" explanation variant. Not a rendered
 * component in its own right -- `ValidationExplanation` (plan 04-05) already reserves the
 * `bundle-mismatch` slot and owns the ONE fixed stacking order across all three variant kinds
 * (bundle mismatch, then single-field eviction, then cross-field caveat); a second, independently
 * rendered banner here would either duplicate that ordering logic or bypass it entirely.
 * `App.tsx`'s `explanationVariants()` calls `bundleVersionMismatchVariant` and pushes its result
 * into the same array `ValidationExplanation` sorts, so the mismatch notice takes its declared
 * place in the one stacking order that already exists.
 *
 * The run itself is never blocked behind this: `App.tsx` computes and renders the chart and
 * metrics against the currently deployed bundle regardless of what this function returns (D-15 --
 * compute against the deployed bundle anyway and state the change, never a click-through gate).
 */

import type { ExplanationVariant } from './ValidationExplanation.tsx'

/**
 * `linkBundleVersion` is `src/app/state.ts`'s `currentLinkBundleVersion()` -- the `bundleVersion`
 * a decoded permalink carried, or `null` when this session did not boot from a permalink at all.
 * `currentBundleVersion` is the imported `BUNDLE_VERSION` constant (`src/data-bundle.generated.ts`),
 * the one bundle this build can address. Returns `null` (nothing to render, UI-SPEC E9 empty) when
 * there is no link version to compare, or when it already matches the deployed bundle exactly.
 */
export function bundleVersionMismatchVariant(
  linkBundleVersion: string | null,
  currentBundleVersion: string,
): ExplanationVariant | null {
  if (linkBundleVersion === null || linkBundleVersion === currentBundleVersion) return null
  return {
    kind: 'bundle-mismatch',
    message:
      `This link was created against an older data bundle (v${linkBundleVersion}). Results below use ` +
      `the current bundle (v${currentBundleVersion}); the underlying data has changed since this link was made.`,
  }
}

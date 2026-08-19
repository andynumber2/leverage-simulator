/**
 * src/app/components/ResultColumn/RuinBanner.tsx
 *
 * D-07's categorical ruin state change: a banner naming the ruin date, styled in
 * `--color-destructive` (never a hardcoded hex value in this file -- the color lives in
 * `src/app/styles.css` as a CSS custom property). `App.tsx` places this above the metrics panel
 * when `result.ruined` is true; the metrics stay on screen, subordinate to this banner, rather
 * than a badge sitting beside otherwise-normal numbers.
 */

export interface RuinBannerProps {
  /** ISO `YYYY-MM-DD`, fixed 10-character width (04-UI-SPEC.md E8). */
  ruinDate: string
}

export function RuinBanner(props: RuinBannerProps) {
  return (
    <div class="ruin-banner" data-testid="ruin-banner" role="status">
      Position ruined on {props.ruinDate} - value reached zero and stays there.
    </div>
  )
}

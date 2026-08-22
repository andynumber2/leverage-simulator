/**
 * src/heatmap/sweep-copy.ts
 *
 * 07-01-PLAN.md Task 1, Pitfall 7: graduates `VIZ10_CAVEAT_SENTENCES` out of `mockup-runtime.ts`
 * so the D-21/D-22 VIZ-10 caveat text has exactly one definition, shared by the Phase 6 mockups
 * and Phase 7's production renderer, the same reasoning `iso-lines.ts`/`field-sampler.ts` and
 * `hatch-pattern.ts` were graduated under.
 */

/** D-22: reframe first, then name the overlap mechanism, within the two-sentence structure
 * D-22 locks. The exact wording is Claude's discretion; the string "independent backtests" must
 * never appear anywhere in it (PITFALLS D5). */
export const VIZ10_CAVEAT_SENTENCES: readonly [string, string] = [
  'The same market history, viewed from every possible starting point.',
  'Adjacent columns share nearly all their data, so this is a sensitivity analysis over one ' +
    'past, not 10,000 independent trials.',
]

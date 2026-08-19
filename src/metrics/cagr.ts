/**
 * src/metrics/cagr.ts
 *
 * Phase 4, METR-02: closed-form compound annual growth rate over a run's calendar span. Sibling
 * to `src/metrics/irr.ts` -- a pure numeric module, no I/O, no import from src/app/, src/data/ or
 * tools/.
 */

/**
 * Returns the compound annual growth rate `(finalValue / initialInvestment) ^ (365 /
 * calendarDays) - 1`, or `null` when the inputs put that expression outside a meaningful real
 * domain: `initialInvestment` not strictly positive, `calendarDays` not strictly positive, or a
 * negative `finalValue`. A `finalValue` of exactly 0 returns exactly -1, matching `solveIrr`'s
 * total-loss convention (D-08) so the IRR and CAGR rows never disagree about a ruined run.
 */
export function solveCagr(initialInvestment: number, finalValue: number, calendarDays: number): number | null {
  if (!(initialInvestment > 0)) return null
  if (!(calendarDays > 0)) return null
  if (finalValue < 0) return null
  if (finalValue === 0) return -1

  const cagr = Math.pow(finalValue / initialInvestment, 365 / calendarDays) - 1
  if (!Number.isFinite(cagr)) return null
  return cagr
}

/**
 * bench/long-task-selector.ts: PERF-07a's measuredMs selector, isolated as a pure function in a
 * non-test module so its max-not-sum semantics are directly testable against a known list
 * independent of the aggregate max any browser command already computes browser-side, and so it
 * has exactly one implementation shared by every bench file that measures a PERF-07a figure.
 *
 * 08-05: originally defined inline in bench/perf-07.bench.test.ts and imported directly from
 * there by bench/perf-08-export.bench.test.ts. That import was reverted (T-08-21 territory, a
 * correctness bug found while implementing this plan, not a style preference): a `*.bench.test.ts`
 * file's top-level `test(...)` calls register into whatever Vitest suite is currently being
 * built, so importing bench/perf-07.bench.test.ts from another test file for this one function
 * silently re-ran perf-07's own real Playwright leverage-slider drag as a side effect of the
 * import -- verified empirically: `npm run bench -- bench/perf-08-export.bench.test.ts` reported
 * 4 tests and a real PERF-07b `app-recompute` figure neither this file nor perf-07's file
 * asked for in that run. Moving the pure function to a plain, non-test module removes the
 * side effect while keeping the single-implementation guarantee the plan asks for.
 *
 * The requirement's ceiling is "no task exceeds the long-task threshold" -- a maximum is the only
 * statistic that ceiling is stated against; a total-blocking-time sum would silently pass a run
 * containing one over-threshold long task alongside several short ones.
 */
export function selectMaxLongTaskDuration(longTaskDurations: readonly number[]): number {
  return longTaskDurations.length > 0 ? Math.max(...longTaskDurations) : 0
}

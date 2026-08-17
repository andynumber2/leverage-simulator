# Phase 2: Compiled Data Bundle - Pattern Map

**Mapped:** 2026-08-17
**Files analyzed:** 13 (new) + 2 (modified)
**Analogs found:** 6 / 15

## Context

This phase is mostly greenfield: `tools/bundle-compiler/` is a brand-new tree with no prior
compiler, CLI, or binary-encoding code in this repo to copy from. The one genuinely reusable
analog set is the **typed-table-plus-compile-time-exhaustiveness-check pattern** in
`perf-budgets.ts`/`bench/report.ts`/`tests/perf-budgets.selftest.test.ts`, which this phase's
D-23 work directly extends, and the **measure → normalize → record → assert** bench pattern in
`bench/kernel.bench.test.ts`, which the two new bench rows (bundle bytes, decode time) must
follow. Everything under `tools/bundle-compiler/` (CLI, calendar, seams, encode, manifest) has no
in-repo analog; RESEARCH.md's own "Code Examples" and "Architecture Patterns" sections are the
best available reference for those files, not existing code.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `perf-budgets.ts` (modified: add 2 rows + `unit` field) | config | CRUD (typed table) | itself (existing file) | exact — extend in place |
| `tests/perf-budgets.selftest.test.ts` (modified: `11`→`13`, ids array) | test | request-response (self-test) | itself (existing file) | exact — extend in place |
| `tools/bundle-compiler/src/cli.ts` | controller (CLI entry) | file-I/O | none in repo | no analog |
| `tools/bundle-compiler/src/binary-format.ts` | model (shared type/header) | transform | `perf-budgets.ts` (typed-table-as-single-source-of-truth pattern) | role-match (config↔model, same "one place this is defined" discipline) |
| `tools/bundle-compiler/src/sidecar.ts` | model + validation | file-I/O | none in repo | no analog |
| `tools/bundle-compiler/src/calendar.ts` | service | batch/transform | none in repo | no analog |
| `tools/bundle-compiler/src/seams.ts` | model | transform | none in repo | no analog |
| `tools/bundle-compiler/src/encode.ts` | service | file-I/O | none in repo | no analog |
| `tools/bundle-compiler/src/manifest.ts` | service | file-I/O | none in repo | no analog |
| `tools/bundle-compiler/tests/*.test.ts` (compile/calendar/series/rate-series/seams/manifest/universe/versioning/roundtrip) | test | request-response + property | `tests/kernel.test.ts` (correctness-of-spike-code test shape) | role-match |
| `tools/bundle-compiler/tests/roundtrip.test.ts` (property-based) | test | transform | RESEARCH.md Q7 guidance only; no fast-check usage exists in repo yet | no analog |
| `bench/bundle-size.bench.test.ts` (new bench row: bundle bytes) | test (bench) | batch/measurement | `bench/kernel.bench.test.ts` | exact |
| `bench/decode-time.bench.test.ts` (new bench row: decode time) | test (bench) | batch/measurement | `bench/kernel.bench.test.ts` | exact |
| `_headers` (Cloudflare Pages cache rules) | config | static | none in repo (first `_headers` file) | no analog — follow RESEARCH.md Pattern 4 verbatim |
| `raw/*.csv` + `raw/*.meta.json` + `raw/calendar-exceptions.json` | data/fixture | file-I/O | none in repo | no analog |

## Pattern Assignments

### `perf-budgets.ts` (config, modified in place)

**Analog:** itself — this is an extension, not a new file. Read the whole file (183 lines,
already in context above) before editing.

**Pattern to preserve exactly:**
- `BudgetId` union gets 2 new members (`'DATA-BUNDLE-SIZE'`-style bundle-bytes row and a decode
  row carved out of `PERF-08b`, per D-23). Do NOT invent a new `RequirementId` for the bundle-size
  row unless one already exists — Pitfall 2 flags this exact trap.
- `PerfBudget` interface gains a **`unit` field** (D-23: "bundle bytes become a first-class gated
  row anchored to transfer time"). Add it as an optional or required field consistently across
  every existing entry — every entry in `PERF_BUDGETS` must be updated if it becomes required,
  since the object literal is exhaustively typed.
- The **compile-time exhaustiveness check** at lines 169-182 must keep passing. If a new
  `RequirementId` value is introduced, this check enforces it appears on at least one budget row
  and no extra ids leak in — do not bypass it with an `as` cast.

**Core pattern** (lines 67-167, one object-literal entry per budget row):
```typescript
'PERF-08b': {
  id: 'PERF-08b',
  requirementId: 'PERF-08',
  description: 'Cold load completes data load and first render',
  thresholdMs: 1000,
  anchorMs: 1000,
  anchorLabel: 'holds attention',
  implementedInPhase: 4,
},
```
New decode-time row must follow this exact shape, `requirementId: 'PERF-08'` (carved out of
PERF-08b per D-23), with its own `BudgetId` (e.g. `'PERF-08b-decode'` or similar — planner's
discretion per CONTEXT.md).

---

### `tests/perf-budgets.selftest.test.ts` (test, modified in place)

**Analog:** itself.

**Pitfall 2 (RESEARCH.md) is the load-bearing instruction here.** The literal assertion at
lines 137-152 must be updated in the **same commit** that adds rows to `perf-budgets.ts`:
```typescript
test('PERF_BUDGETS has exactly 11 entries across exactly the 8 requirement ids PERF-02..PERF-09', () => {
    const entries = Object.values(PERF_BUDGETS)
    expect(entries).toHaveLength(11)
    // ... 8-element sorted array of requirement ids
})
```
Update `11` → `13` (11 + 2 new rows) and the requirement-id array if a new `RequirementId` is
added (only if genuinely needed — prefer reusing `PERF-08` for the decode row per D-23's own
"carved out of PERF-08b" framing, avoiding a new id entirely for that row).

---

### `bench/bundle-size.bench.test.ts` and `bench/decode-time.bench.test.ts` (test/bench, new)

**Analog:** `bench/kernel.bench.test.ts` (full file read above, 77 lines).

**Imports pattern** (lines 1-16):
```typescript
import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

import { PERF_BUDGETS } from '../perf-budgets.ts'
import { measureBatchedMinOfN, normalize, REPEAT_COUNT } from './calibration.ts'
import { resolveRunCalibration } from './canonical-calibration.ts'
import { captureEnvironment } from './environment-block.ts'
import { assertWithinBudget, checkBudget, type MeasurementRow } from './report.ts'
```

**Core measure → normalize → record → assert pattern** (lines 24-76): preallocate fixtures
outside the timed region, resolve the run's calibration score, call `measureBatchedMinOfN`
(NOT `measureMinOfN` — Pitfall 3 explicitly warns a zero-copy `Float64Array` view decode will
likely hit the un-resolvable sub-millisecond floor `measureMinOfN` cannot batch around), build a
`MeasurementRow`, `recordMeasurement`, and `assertWithinBudget` as the per-file (non-authoritative)
check.

**Pitfall 3 is the single most important instruction for `decode-time.bench.test.ts`:**
> Reuse `measureBatchedMinOfN`, not the plain `measureMinOfN`, for the decode-time row, and
> confirm the batch minimum clears `MIN_MEASUREMENT_MS` before trusting the figure... A
> decode-time bench row reporting `0.00ms` is not a passing result to celebrate; it is Gap 2
> recurring.

**Bundle-size row** is a Node-side byte-count fact, not a timed measurement — `bundle-size.bench.test.ts`
still emits a `MeasurementRow`, but `measuredMs`/`normalizedMs` represent bytes (unit field on the
budget, per D-23) rather than milliseconds; there is no direct file analog for a byte-denominated
row in this repo, follow `MeasurementRow`'s shape in `bench/report.ts` (lines 28-42) but treat the
`unit` field on the corresponding `PerfBudget` entry as authoritative for how to interpret the
number, not the field name `Ms`.

---

### `tools/bundle-compiler/tests/*.test.ts` (test, new — compile/calendar/series/rate-series/seams/manifest/universe/versioning)

**Analog:** `tests/kernel.test.ts` (full file read above, 167 lines) — not a perfect match (that
file tests a numeric recurrence, this phase tests file/schema logic), but it is the strongest
in-repo example of the project's **correctness-test-for-throwaway/greenfield-code** shape:
`describe`/`test` blocks, one behavior per test, explicit fixture builders (`makeFixedSeries`,
`baseParams`) instead of shared mutable fixtures.

**Pattern to copy** (lines 12-35, fixture-builder-function style):
```typescript
function makeFixedSeries(
  returns: number[],
  shortRate: number[],
  calendarDaysElapsed: number[],
): SyntheticSeries {
  return {
    returns: Float64Array.from(returns),
    shortRate: Float64Array.from(shortRate),
    calendarDaysElapsed: Int32Array.from(calendarDaysElapsed),
  }
}

function baseParams(overrides: Partial<SpikeKernelParams> = {}): SpikeKernelParams {
  return { /* defaults */, ...overrides }
}
```
Apply the same idea for compiler tests: a `makeFixture(overrides)`-style builder for a small
synthetic `raw/` directory (RESEARCH.md's Wave 0 gap: `tests/fixtures/`), rather than one large
shared fixture reused (and possibly mutated) across tests.

**Property-based tests (`roundtrip.test.ts`, `calendar.test.ts`, `seams.test.ts`)** have no
in-repo `fast-check` usage to copy — this will be the first `fast-check` test in the repo.
Follow RESEARCH.md's Q7 guidance directly: `fc.assert(fc.property(...))` inside a standard Vitest
`test()` block, no adapter needed.

---

### `tools/bundle-compiler/src/*.ts` (cli, binary-format, sidecar, calendar, seams, encode, manifest)

**No in-repo analog.** These are genuinely new capabilities (CLI arg parsing, CSV/sidecar
validation, calendar derivation, binary encoding, manifest emission) with nothing structurally
similar elsewhere in this codebase. Do not force-fit an analog. Use RESEARCH.md's "Architecture
Patterns" section directly as the design reference:
- Pattern 1 (sidecar-gated compilation) → `sidecar.ts`
- Pattern 2 (calendar derived from data) → `calendar.ts`
- Pattern 3 (typed seam records) → `seams.ts`
- Pattern 4 (content-hashed filenames) → `encode.ts`
- Binary header layout code example → `binary-format.ts`

**One weak structural echo worth naming:** `perf-budgets.ts`'s discipline of "a typed TypeScript
module is the single source of truth, malformed entries cannot compile" is the same spirit
RESEARCH.md's `binary-format.ts` design follows (shared header type, single source of truth for
both encoder and future Phase 4 decoder). Not copyable code, but copyable **discipline**: define
the header/series-descriptor types once in `binary-format.ts`, never re-declare a parallel shape
in `encode.ts` or a test file.

---

### `_headers` (config, new)

**No in-repo analog** — first Cloudflare Pages `_headers` file in this repo. Follow RESEARCH.md's
Pattern 4 code example verbatim:
```
/data/*.bin
  Cache-Control: public, max-age=31536000, immutable

/data/manifest.*.json
  Cache-Control: public, max-age=31536000, immutable
```

## Shared Patterns

### Single-source-of-truth typed table + compile-time exhaustiveness check
**Source:** `perf-budgets.ts` lines 15-24, 169-182
**Apply to:** `perf-budgets.ts` itself (extended) and, by discretion, `binary-format.ts`'s header
type if the planner wants the same "cannot compile if malformed" discipline for the binary
format's shared type.

### measure → normalize → record → assert (bench rows)
**Source:** `bench/kernel.bench.test.ts` full file
**Apply to:** `bench/bundle-size.bench.test.ts`, `bench/decode-time.bench.test.ts`

### Authoritative run-level gate, not per-file assertion
**Source:** `bench/report.ts` lines 1-13, 262-343 (`assertRunInvariants`)
**Apply to:** Nothing in this phase changes `assertRunInvariants` itself, but the two new bench
files must plug into it (via `recordMeasurement`) exactly as `kernel.bench.test.ts` does — do not
add a parallel, bypassable assertion (RESEARCH.md's own Anti-Pattern warning).

### Fail loudly, no override flag
**Source:** D-11 / RESEARCH.md Anti-Patterns ("A CLI flag to skip calendar validation")
**Apply to:** `cli.ts`, `calendar.ts` — never add a `--force`/`--skip-validation` flag; the only
override mechanism is `raw/calendar-exceptions.json`, mirroring this repo's existing
no-silent-relaxation discipline in `perf-budgets.ts` (`relaxationReason` must be authored, never
implicit).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `tools/bundle-compiler/src/cli.ts` | controller | file-I/O | First CLI entry point in the repo; no `node:util parseArgs` usage exists yet |
| `tools/bundle-compiler/src/sidecar.ts` | model/validation | file-I/O | First JSON-schema-validation code in the repo |
| `tools/bundle-compiler/src/calendar.ts` | service | batch/transform | First calendar-derivation logic; nothing comparable exists |
| `tools/bundle-compiler/src/seams.ts` | model | transform | First typed-provenance-record logic |
| `tools/bundle-compiler/src/encode.ts` | service | file-I/O | First binary-asset-writing code; `node:crypto` content-hashing has no prior usage |
| `tools/bundle-compiler/src/manifest.ts` | service | file-I/O | First JSON-manifest-emission code |
| `_headers` | config | static | First Cloudflare Pages headers file |
| `raw/*.csv`, `raw/*.meta.json`, `raw/calendar-exceptions.json` | data | file-I/O | First committed raw-data tree |
| `tools/bundle-compiler/tests/roundtrip.test.ts` (fast-check usage) | test | property | First `fast-check` usage in the repo; RESEARCH.md Q7 is the only guidance |

For all of these, RESEARCH.md's "Architecture Patterns", "Code Examples", and "Don't Hand-Roll"
sections are the authoritative design reference in place of an in-repo analog.

## Metadata

**Analog search scope:** entire repo (`.` excluding `.planning/`, `.git/`, `node_modules/`) — full
file listing enumerated via `find`; no directories were skipped, the tree is small (greenfield
Phase 1 output only).
**Files scanned:** `perf-budgets.ts`, `bench/report.ts`, `bench/kernel.bench.test.ts`,
`bench/kernel.ts`, `tests/kernel.test.ts`, `tests/perf-budgets.selftest.test.ts`, `package.json`
**Pattern extraction date:** 2026-08-17

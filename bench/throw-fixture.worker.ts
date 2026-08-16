/**
 * bench/throw-fixture.worker.ts: Task 2, a worker that throws during module evaluation, before
 * ever reaching `Comlink.expose`, exercising `runSpikeSweep`'s error-event failure path (WR-01).
 * Named so it matches neither the `bench` project's `bench/**\/*.bench.test.ts` include, nor the
 * `unit` project's `tests/**\/*.test.ts` include, nor the `bench-selftest` project's
 * `bench/selftest/*.selftest.ts` include.
 */

throw new Error('throw-fixture: deliberate module-evaluation failure')

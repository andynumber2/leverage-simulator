/**
 * bench/hang-fixture.worker.ts: Task 2, a worker whose `runChunk` never resolves, exercising
 * `runSpikeSweep`'s bounded-timeout path (WR-01). Named so it matches neither the `bench`
 * project's `bench/**\/*.bench.test.ts` include, nor the `unit` project's `tests/**\/*.test.ts`
 * include, nor the `bench-selftest` project's `bench/selftest/*.selftest.ts` include.
 */

import * as Comlink from 'comlink'

const hangFixtureApi = {
  runChunk(): Promise<ArrayBuffer> {
    // Deliberately never resolves or rejects: this is what a hung worker looks like from the
    // caller's side. bench/sweep-pool.ts's chunk timeout is the only thing that can bound this.
    return new Promise<ArrayBuffer>(() => {
      // Intentionally empty: no resolve, no reject.
    })
  },
}

Comlink.expose(hangFixtureApi)

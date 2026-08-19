/**
 * bench/preview-server.ts: Task 2 (04-03), starts and stops a Vite preview server over the
 * production `dist/` output for the duration of one measurement.
 *
 * RESEARCH.md Pitfall 2: PERF-08 must never be measured against the Vite dev server. The dev
 * server ships unbundled ESM modules with an HMR client; its cold-load timing has no
 * relationship to what Cloudflare Pages actually serves. `vite preview` serves the real
 * `npm run build` output -- the same static files that ship -- so this is the only server this
 * module ever starts.
 *
 * Deliberately never imported by any `*.bench.test.ts` file: it imports Vite's Node API
 * (`preview` from `vite`) and `node:fs`, both of which are Node-only and would break the browser
 * bundle if pulled in transitively (see bench/report.ts's header comment on the same
 * Node-only-module separation).
 */

import { existsSync } from 'node:fs'
import path from 'node:path'

import { preview } from 'vite'

/** Convention this repo's `vite.config.ts` and `npm run build` both follow: the production build
 * always lands at "dist" under the working directory. */
const DIST_DIR = path.resolve(process.cwd(), 'dist')

/** The specific file whose absence means "no production build exists yet", named in the thrown
 * error so a measurement can never silently run against nothing. */
const DIST_INDEX_HTML = path.join(DIST_DIR, 'index.html')

/**
 * Starts a `vite preview` server over the production `dist/` output, awaits `fn(origin)`, and
 * closes the server in a `finally` -- so a throwing or interrupted measurement leaves no
 * orphaned listener holding a port across runs (T-04-17).
 *
 * Throws a named error, naming both the missing path and the command that produces it, when
 * `dist/index.html` does not exist: without a real production build, the preview server would
 * have nothing to serve, and a PERF-08 figure measured against an absent or stale build would
 * certify nothing.
 */
export async function withPreviewServer<T>(fn: (origin: string) => Promise<T>): Promise<T> {
  if (!existsSync(DIST_INDEX_HTML)) {
    throw new Error(
      `withPreviewServer: "${DIST_INDEX_HTML}" does not exist. Run "npm run build" first -- ` +
        'PERF-08 must be measured against a real production build, never a stale or absent one.',
    )
  }

  const server = await preview({
    root: process.cwd(),
    logLevel: 'silent',
    preview: {
      // No fixed port: vite preview defaults to 4173 and automatically tries the next available
      // port when that one is busy (strictPort defaults to false), which is what this harness
      // wants -- an ephemeral, non-conflicting listener, not a specific address.
      host: '127.0.0.1',
    },
  })

  try {
    const resolvedUrls = server.resolvedUrls
    const origin = resolvedUrls?.local[0]
    if (origin === undefined) {
      throw new Error('withPreviewServer: the preview server did not resolve a local URL')
    }
    // Strip any trailing slash so callers can concatenate a path directly onto the origin.
    return await fn(origin.replace(/\/$/, ''))
  } finally {
    await server.close()
  }
}

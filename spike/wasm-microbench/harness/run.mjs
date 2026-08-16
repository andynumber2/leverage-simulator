// spike/wasm-microbench/harness/run.mjs — D-11 Task 1 driver.
//
// Serves this directory over a local HTTP server (module scripts loaded via `file://` hit
// Chromium's CORS restrictions), opens harness/index.html in headless Chromium via the
// project's existing Playwright install (D-02: the same measurement environment the JS/canvas
// arms use), reads back the WASM arm's timing + correctness result, computes the JS arm's
// reference result by spawning harness/js-reference.ts under Node's native TS stripping, and
// asserts the two arms agree within tolerance before printing anything as a trusted ratio.

import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const crateRoot = path.dirname(__dirname)

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.ts': 'text/typescript',
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0])
      const filePath = path.join(crateRoot, urlPath)
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404)
          res.end(`not found: ${filePath}`)
          return
        }
        const ext = path.extname(filePath)
        res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
        res.end(data)
      })
    })
    server.listen(0, () => resolve(server))
  })
}

async function main() {
  // 1. The JS arm's reference result, for the same seed and params, computed by importing the
  //    real bench/kernel.ts + bench/synthetic-data.ts (not a restatement).
  const jsReferenceRaw = execFileSync(
    process.execPath,
    ['--experimental-strip-types', path.join(__dirname, 'js-reference.ts')],
    { encoding: 'utf8' },
  )
  const jsReference = JSON.parse(jsReferenceRaw)

  // 1b. Secondary, above-noise-floor JS figure (Node V8, not headless Chromium — see the doc
  //     comment in js-batched-reference.ts for why this is supplementary, not primary).
  const jsBatchedRaw = execFileSync(
    process.execPath,
    ['--experimental-strip-types', path.join(__dirname, 'js-batched-reference.ts')],
    { encoding: 'utf8' },
  )
  const jsBatched = JSON.parse(jsBatchedRaw)

  // 2. The WASM arm, driven in headless Chromium — the same measurement environment (D-02) the
  //    JS/canvas arms already use.
  const server = await serve()
  const port = server.address().port

  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on('pageerror', (err) => console.error('[pageerror]', err))

  await page.goto(`http://localhost:${port}/harness/index.html`)
  await page.waitForFunction(() => window.__HARNESS_RESULT__ !== undefined, undefined, {
    timeout: 60_000,
  })
  const wasmResult = await page.evaluate(() => window.__HARNESS_RESULT__)

  await browser.close()
  server.close()

  if (wasmResult.error) {
    console.error('WASM harness threw:', wasmResult.error)
    process.exit(1)
  }

  // 3. Equivalence, before any ratio is trusted. Tolerance: relative 1e-9 on finalValue (the two
  //    arms perform the identical operation sequence in IEEE-754 f64 on both sides — see
  //    lib.rs's mulberry32_next doc comment for why the PRNG's bit pattern matches exactly —
  //    so this tolerance is generous, not a concession to divergence).
  const relTolerance = 1e-9
  const diff = Math.abs(wasmResult.finalValue - jsReference.finalValue)
  const relDiff = diff / Math.max(Math.abs(jsReference.finalValue), 1e-12)
  const finalValueOk = relDiff <= relTolerance
  const ruinedOk = wasmResult.ruined === jsReference.ruined
  const equivalenceOk = finalValueOk && ruinedOk

  const output = {
    equivalenceOk,
    tolerance: { kind: 'relative', value: relTolerance },
    js: jsReference,
    wasm: {
      finalValue: wasmResult.finalValue,
      ruined: wasmResult.ruined,
    },
    relativeDifference: relDiff,
    timing: {
      singleCall: {
        calibrationScore: wasmResult.calibrationScore,
        rawMs: wasmResult.rawMs,
        normalizedMs: wasmResult.normalizedMs,
      },
      batched: {
        note:
          'wasm.perCallRawMs and jsNodeV8.perCallRawMs are both raw (uncalibrated) wall-clock ' +
          '— jsNodeV8 has no calibration score (Node has no calibrationScore() call site) so ' +
          'the ratio below compares raw to raw, not normalized to raw.',
        wasm: wasmResult.batch,
        jsNodeV8: jsBatched,
        ratioWasmOverJsRaw: wasmResult.batch.perCallRawMs / jsBatched.perCallRawMs,
      },
    },
    environment: {
      hardwareConcurrency: wasmResult.hardwareConcurrency,
      userAgent: wasmResult.userAgent,
    },
  }

  console.log(JSON.stringify(output, null, 2))

  if (!equivalenceOk) {
    console.error(
      `Equivalence check FAILED: relDiff=${relDiff} (tolerance ${relTolerance}), ` +
        `js.ruined=${jsReference.ruined} wasm.ruined=${wasmResult.ruined}`,
    )
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

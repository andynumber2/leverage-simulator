/**
 * vite.config.ts
 *
 * Convention this file relies on, in the same style vitest.config.ts's header comment states: Vite
 * serves `public/` at the site root, so the compiled bundle at `public/data/` is reachable at
 * exactly the paths `MANIFEST_PATH` already encodes, in dev, in preview and in the copied
 * `dist/` output. No `publicDir` override is needed -- `public/` is Vite's own default.
 *
 * `build.target` is `es2022` to match `tsconfig.json`'s `target: "ES2022"`, so the same language
 * surface is assumed by both the type checker and the emitted build.
 *
 * D-04 (plan 04-08): `VitePWA`'s `generateSW` strategy precaches the whole bundled universe --
 * the app shell plus every compiled `.bin` asset and the JSON manifest -- not just the shell.
 * D-04 rejects the alternative explicitly: precaching the shell and runtime-caching data on first
 * fetch would reduce DATA-08's "works fully offline after first load" to "offline for the symbols
 * you already opened," and the whole 1.66MB bundle is paid on first load regardless (Phase 7's
 * sweep needs the whole universe anyway).
 *
 * `manifest: false` disables the plugin's OWN manifest-generation feature: `public/
 * manifest.webmanifest` (this plan) is a hand-authored static file already covered by
 * `globPatterns`'s `webmanifest` extension, and `index.html`'s own `<link rel="manifest">` points
 * at it directly -- letting the plugin also generate a second, competing manifest into `dist/`
 * would leave two files claiming the same role.
 */

import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      manifest: false,
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,bin,webmanifest}'],
        // Measured directly from `npm run build`'s own PWA v1.3.0 output on 2026-08-19:
        // "precache 19 entries (1757.82 KiB)" -- the 13 .bin assets, the JSON manifest, the app
        // JS/CSS/HTML, manifest.webmanifest and registerSW.js, ~1,799,988 bytes total. Set well
        // past that measured total (and past Workbox's 2MB default) so a modestly larger future
        // build does not silently drop an asset from the precache; Workbox fails loudly at build
        // time if this is ever too low, so a wrong value here is a build failure, not a silent
        // runtime gap.
        maximumFileSizeToCacheInBytes: 2_500_000,
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
})

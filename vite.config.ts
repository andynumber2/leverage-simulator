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
 */

import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    target: 'es2022',
  },
})

/**
 * src/app/main.tsx
 *
 * Placeholder entry point. Task 2 (scaffold) needs `index.html`'s module script to resolve to a
 * real file so `npm run build` succeeds as this task's own verification requires; Task 3 (the
 * tracer) replaces this file's contents with the real Solid render root, `<App />` mount, and
 * `app-data-ready` / `app-interactive` performance marks.
 */

const root = document.getElementById('root')
if (root !== null) {
  root.textContent = 'Leverage Simulator scaffold placeholder'
}

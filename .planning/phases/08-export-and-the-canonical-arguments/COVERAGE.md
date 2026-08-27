# Phase 8 — API Coverage Declaration

No external API integration: the phase touches only browser platform APIs (Clipboard, Blob/object
URL, `<a download>`, Web Worker) plus one build-time Node script reading the already-compiled local
data bundle from disk. `.claude/CLAUDE.md` forbids runtime external API calls and
`tests/app/static-build.test.ts` mechanically proves the emitted build reaches no external origin,
so there is no third-party service surface to enumerate a capability matrix against.

The deterministic detector's single signal was the browser **Clipboard API** (D-23's
`navigator.clipboard.write()` path with a download fallback). That is a platform API, not an
external service or SDK, so a capability matrix would be fabricated rather than informative.

**Re-read confirmation (2026-08-26):** `08-CONTEXT.md` `<domain>` and the ROADMAP Phase 8 section
were re-read against this declaration. The phase's three deliverables are a DOM-to-PNG raster
(`html-to-image`, a bundled npm library with no network surface), a Worker-built CSV, and a static
preset library. None of the three opens a network connection at runtime.

**New runtime dependency this phase:** `html-to-image@1.11.13`. Cleared by `08-RESEARCH.md`'s
Package Legitimacy Audit (verdict `OK`, 6.24M weekly downloads, MIT, no postinstall script,
repo `github.com/bubkoo/html-to-image`) — a rasterization library that runs entirely in-page, not
an API client.

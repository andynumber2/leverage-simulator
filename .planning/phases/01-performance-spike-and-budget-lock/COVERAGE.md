# API Coverage: Phase 1, Performance Spike and Budget Lock

No external API integration: this phase builds a local measurement harness (Vitest browser mode, a Canvas 2D renderer, a Web Worker pool) plus a GitHub Actions workflow, and integrates no external API, SDK or service with a capability surface to enumerate.

## Note on the detector

The deterministic `api-coverage detect` subcommand is not present in the installed `gsd-tools` build (`node gsd-tools.cjs query api-coverage detect 1 --json` returns `Unknown command: api-coverage`). The declaration above was therefore written by re-reading the phase scope rather than by pattern-matching prose in place of the detector, per the checkpoint's own instruction not to fabricate a matrix row for a capability that does not exist.

For the record, the closest things to an external surface in this phase, and why none of them is an API integration:

| Candidate | Why it is not an external API integration |
|---|---|
| GitHub Actions | Declarative CI configuration consumed by the platform. The repository does not call a GitHub API; the workflow is a YAML file the platform reads |
| Playwright and headless Chromium | A local test-runner dependency driving a local browser process. No network service, no capability surface |
| npm registry, crates.io | Package installation at build and setup time, not a runtime integration. Covered by the Package Legitimacy Audit in `01-RESEARCH.md` and by threat `T-01-SC` |
| Cloudflare Pages | The eventual deployment target named in PROJECT.md constraints. Nothing in this phase deploys or calls it; Phase 4 is the first shippable slice |

PROJECT.md constrains the product itself to "no backend, no database, no runtime external API calls", so an external-API capability matrix has no referent in this project at all, not merely in this phase.

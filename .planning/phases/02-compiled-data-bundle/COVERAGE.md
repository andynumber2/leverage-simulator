# Phase 2: API Coverage Declaration

**Produced:** 2026-08-17 (source-stack reversal replanning)
**Detector:** `gsd-core/bin/lib/api-coverage.cjs` run over every `.planning/phases/02-compiled-data-bundle/*-PLAN.md`, returning `{"detected":false,"signals":[]}`

No external API integration: this phase makes one read-only historical-data pull from public HTTP endpoints inside a build-time script that is never shipped to a browser, with no SDK, no client library, no authentication, no write path, and no capability surface for a later phase to adopt.

## Why the integration matrix does not apply

The gate exists for work that adopts a vendor's capability surface, where the question worth answering is which capabilities were integrated and which were deliberately skipped. Nothing here has such a surface:

- **Two endpoints, one shape.** The Yahoo chart endpoint and the FRED graph endpoint are each a single GET returning one historical series. There are no other operations to opt into or out of.
- **No SDK and no dependency.** Every request goes through the repository's own `fetchText` in `tools/fetch-data/src/fetch.ts`, using the platform fetch. No package is installed by any plan in this phase.
- **No credential and no write path.** Nothing authenticates, nothing posts, nothing mutates vendor state, and no secret exists to scope.
- **Build time only.** `APP-03` forbids runtime external API calls. The shipped application reads content-hashed binary assets, never a vendor host, so this integration has no runtime surface at all.
- **The vendor is behind a seam.** `SourceSpec` in `tools/fetch-data/src/sources.ts` is the only place a vendor, a url or a route is named, which is what made the 2026-08-17 source-stack reversal a table rewrite rather than a rewrite of the pipeline.

## Where the real risk was addressed instead

The genuine exposure in this phase is untrusted vendor bytes crossing into a script that writes files, and vendor availability differing between a developer machine and a shared-address runner. Both are handled in the plans' threat models rather than in a capability matrix:

| Concern | Where it is addressed |
|---|---|
| Untrusted vendor JSON reaching a script-owned object | `02-06-PLAN.md` threat T-02-26, build-key-by-key parsing with a prototype-pollution test |
| Non-finite, misaligned or duplicated vendor values | `02-06-PLAN.md` threat T-02-27, hard validation naming the field and the date |
| Transport downgrade or redirect substitution | `02-06-PLAN.md` threat T-02-30, https only with manual redirect handling, preserved from plan 02-03 |
| Oversized or hostile response body | `02-06-PLAN.md` threat T-02-31, the existing streaming byte cap |
| Vendor unreachable from a shared egress address | D-27's three-route model, with per-series route reporting and an observation-date staleness gate |
| A vendor silently changing its dividend data | D-25's reconstruction gate, recomputed on every run against a declared tolerance |

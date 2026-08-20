/**
 * src/app/permalink.ts
 *
 * D-13 through D-16: the one canonical serialization format for a shared run, used by both
 * directions -- no field is ever formatted or parsed a second, different way anywhere else in the
 * app (Pitfall 5). Checkpoint-resolved schema (04-07-PLAN.md Task 1, decided): fifteen query-param
 * keys in one fixed emission order, all present except `holdingPeriodBars`, which is emitted only
 * when `holdMode` is "fixed". `resolvedEndDate` alone carries the frozen end date in "end-of-data"
 * mode (D-14); emitting both would encode the same fact twice with nothing in the contract saying
 * which one wins if a data refresh ever made them disagree.
 *
 * `holdMode`'s wire value is "end-of-data", never "today": the UI now names the resolved end date
 * rather than promising a wall-clock refresh a manually-updated bundle cannot deliver
 * (`src/app/components/ParameterColumn/HoldingModeControl.tsx`). A published, one-way contract
 * (D-13) that embedded "today" would re-embed that exact misconception permanently, unlike the UI
 * copy, which could still be revised.
 *
 * `scale` is kept even though it is a display choice, not a run parameter: a recipient reading the
 * same leveraged equity curve on a linear axis when the sender saw log is not seeing the same
 * picture (PITFALLS E6), and this tool exists precisely to settle arguments like that one.
 *
 * `decodeParams` is a TOTAL function over arbitrary `URLSearchParams` (T-04-01/T-04-03): every
 * field is read through `PERMALINK_KEYS` as an allow-list (an unknown key, a duplicated key --
 * read via `getAll`, since `get` silently returns the first -- or a missing key is rejected by
 * name), no dynamic property assignment from a URL-derived key ever happens (every field is
 * assigned by its own literal name), and an unrecognized `holdMode` value is rejected loudly
 * rather than silently defaulted.
 */

import type { BacktestRequest, ContributionFrequency } from '../data/kernel-inputs.ts'
import type { Tier } from './bounds.ts'

/** D-14's wire value: "end-of-data" names the resolved data boundary, never wall-clock "today"
 * (see file header -- that framing is superseded). */
export type HoldMode = 'fixed' | 'end-of-data'

/** D-19: the chart's y-axis choice. Carried in the link (checkpoint decision) so two people
 * comparing the same run see the same picture. */
export type PermalinkScale = 'log' | 'linear'

const CONTRIBUTION_FREQUENCIES: readonly ContributionFrequency[] = ['none', 'daily', 'monthly', 'quarterly', 'yearly']
const HOLD_MODES: readonly HoldMode[] = ['fixed', 'end-of-data']
const TIERS: readonly Tier[] = ['strict', 'extended']
const SCALES: readonly PermalinkScale[] = ['log', 'linear']

/**
 * The fifteen query-param keys, in the fixed emission order the Task 1 checkpoint decided. Both
 * `encodeParams` and `decodeParams` read this array rather than repeating the key list, so an
 * added or renamed key cannot drift between the two directions.
 */
export const PERMALINK_KEYS = [
  'symbol',
  'dividendReinvest',
  'leverage',
  'entryDate',
  'holdMode',
  'holdingPeriodBars',
  'resolvedEndDate',
  'initialInvestment',
  'contributionAmount',
  'contributionFrequency',
  'expenseRatioPercent',
  'financingSpreadPercent',
  'tier',
  'scale',
  'bundleVersion',
] as const

export type PermalinkKey = (typeof PERMALINK_KEYS)[number]

/** `BacktestRequest`'s ten fields (symbol through financingSpreadPercent, `src/data/
 * kernel-inputs.ts` lines 34-46) plus the five permalink-only fields the checkpoint's schema
 * adds. */
export interface PermalinkParams extends BacktestRequest {
  holdMode: HoldMode
  resolvedEndDate: string
  tier: Tier
  scale: PermalinkScale
  bundleVersion: string
}

const LEVERAGE_DECIMALS = 2
const MONEY_DECIMALS = 2
const PERCENT_DECIMALS = 4

/** 12-char hex, matching the bundle-version format `tools/bundle-compiler/src/binary-format.ts`
 * stamps into every asset header (D-15) -- the committed bundle's own casing is lowercase, but
 * decode accepts either case since nothing about the format requires one. */
const BUNDLE_VERSION_PATTERN = /^[0-9a-f]{12}$/i

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Encodes `params` into a `URLSearchParams` in `PERMALINK_KEYS`'s fixed order. Leverage, both
 * money fields and both cost fields render with a fixed decimal count rather than through
 * `toString` -- what normalizes a float like a leverage arriving as `2.9999999999999996` from a
 * slider to the canonical `3.00` (Pitfall 5) -- dates render ISO `YYYY-MM-DD`, booleans render as
 * the literals `true`/`false`, and every union renders as its bare member string.
 *
 * `holdingPeriodBars` is emitted only when `holdMode` is "fixed" (checkpoint decision): emitting it
 * in "end-of-data" mode too would encode the same fact `resolvedEndDate` already carries a second
 * time. The two `holdMode`/`holdingPeriodBars` invariant violations below are caller bugs (this
 * function is only ever called with app-constructed state, never raw URL input), not URL-parsing
 * errors, so they throw rather than returning a decode-style result.
 */
export function encodeParams(params: PermalinkParams): URLSearchParams {
  if (params.holdMode === 'fixed' && params.holdingPeriodBars === null) {
    throw new Error('permalink: encodeParams called with holdMode "fixed" and a null holdingPeriodBars')
  }
  if (params.holdMode === 'end-of-data' && params.holdingPeriodBars !== null) {
    throw new Error('permalink: encodeParams called with holdMode "end-of-data" and a non-null holdingPeriodBars')
  }

  const usp = new URLSearchParams()
  for (const key of PERMALINK_KEYS) {
    const value = encodeField(key, params)
    if (value !== null) usp.set(key, value)
  }
  return usp
}

function encodeField(key: PermalinkKey, params: PermalinkParams): string | null {
  switch (key) {
    case 'symbol':
      return params.symbol
    case 'dividendReinvest':
      return String(params.dividendReinvest)
    case 'leverage':
      return params.leverage.toFixed(LEVERAGE_DECIMALS)
    case 'entryDate':
      return params.entryDate
    case 'holdMode':
      return params.holdMode
    case 'holdingPeriodBars':
      // D-13/checkpoint: omitted entirely in "end-of-data" mode, never emitted as a redundant
      // echo of a fact resolvedEndDate already carries.
      return params.holdMode === 'fixed' ? String(params.holdingPeriodBars) : null
    case 'resolvedEndDate':
      return params.resolvedEndDate
    case 'initialInvestment':
      return params.initialInvestment.toFixed(MONEY_DECIMALS)
    case 'contributionAmount':
      return params.contributionAmount.toFixed(MONEY_DECIMALS)
    case 'contributionFrequency':
      return params.contributionFrequency
    case 'expenseRatioPercent':
      return params.expenseRatioPercent.toFixed(PERCENT_DECIMALS)
    case 'financingSpreadPercent':
      return params.financingSpreadPercent.toFixed(PERCENT_DECIMALS)
    case 'tier':
      return params.tier
    case 'scale':
      return params.scale
    case 'bundleVersion':
      return params.bundleVersion
  }
}

export type DecodeParamsResult =
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly error: string }
  | { readonly status: 'ok'; readonly params: PermalinkParams }

function isPermalinkKey(key: string): key is PermalinkKey {
  return (PERMALINK_KEYS as readonly string[]).includes(key)
}

/** Strict ISO `YYYY-MM-DD`, rejecting an out-of-band date (e.g. `2024-02-30`) by round-tripping
 * through `Date.UTC` rather than trusting the regex shape alone -- `Date.UTC` silently rolls an
 * invalid day/month forward, so a value that does not survive the round trip unchanged names its
 * own rejection. */
function parseIsoDate(raw: string): string | null {
  if (!ISO_DATE_PATTERN.test(raw)) return null
  const parts = raw.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  const date = new Date(Date.UTC(year, month - 1, day))
  const roundTrips = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return roundTrips ? raw : null
}

function parseFiniteNumber(raw: string): number | null {
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function parsePositiveFiniteNumber(raw: string): number | null {
  const value = parseFiniteNumber(raw)
  return value !== null && value > 0 ? value : null
}

function parseNonNegativeFiniteNumber(raw: string): number | null {
  const value = parseFiniteNumber(raw)
  return value !== null && value >= 0 ? value : null
}

function parseNonNegativeInteger(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : null
}

function parseBoolean(raw: string): boolean | null {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}

function decodeError(message: string): { status: 'error'; error: string } {
  return { status: 'error', error: message }
}

/**
 * Decodes `qs` back into `PermalinkParams`, total over arbitrary input (T-04-01/T-04-03): never
 * throws, and never assigns a URL-derived string as a property name onto any object -- every
 * field below is read and assigned by its own literal key, never through a computed one. An empty
 * query string is `{ status: 'empty' }`, the caller's "use the default landing run" signal, never
 * a partially defaulted parameter set. Any unknown key, duplicated key, missing required key, an
 * unrecognized `holdMode`, a `holdingPeriodBars` present or absent inconsistent with `holdMode`, or
 * an unparseable/out-of-range field value is `{ status: 'error', error }` naming the offending key
 * by name.
 */
export function decodeParams(qs: URLSearchParams): DecodeParamsResult {
  const presentKeys = new Set<string>()
  for (const key of qs.keys()) presentKeys.add(key)

  if (presentKeys.size === 0) {
    return { status: 'empty' }
  }

  // T-04-01: allow-list by name. Never `eval`, never a `Function` constructor, never a bracket
  // assignment from a URL-derived key -- an unrecognized key (including a prototype-polluting one
  // like "__proto__" or "constructor") is rejected here, before any value is ever read.
  for (const key of presentKeys) {
    if (!isPermalinkKey(key)) {
      return decodeError(`permalink: unknown query parameter "${key}"`)
    }
  }

  // `URLSearchParams.get` silently returns the first of several values for a repeated key;
  // `getAll`'s length is what actually reveals a duplicate.
  for (const key of PERMALINK_KEYS) {
    if (qs.getAll(key).length > 1) {
      return decodeError(`permalink: query parameter "${key}" is duplicated`)
    }
  }

  // holdMode is decoded before the required-key sweep below: it gates whether
  // holdingPeriodBars is required (holdMode "fixed") or forbidden (holdMode "end-of-data"),
  // so the uniform "every other key is always required" pass cannot run until this is known.
  const rawHoldMode = qs.get('holdMode')
  if (rawHoldMode === null) {
    return decodeError('permalink: missing required query parameter "holdMode"')
  }
  if (!(HOLD_MODES as readonly string[]).includes(rawHoldMode)) {
    return decodeError(`permalink: unknown holdMode "${rawHoldMode}"; supported values are "fixed", "end-of-data"`)
  }
  const holdMode = rawHoldMode as HoldMode

  const hasHoldingPeriodBars = presentKeys.has('holdingPeriodBars')
  if (holdMode === 'fixed' && !hasHoldingPeriodBars) {
    return decodeError(
      'permalink: missing required query parameter "holdingPeriodBars" (required when holdMode is "fixed")',
    )
  }
  if (holdMode === 'end-of-data' && hasHoldingPeriodBars) {
    return decodeError(
      'permalink: query parameter "holdingPeriodBars" must not be present when holdMode is "end-of-data"',
    )
  }

  for (const key of PERMALINK_KEYS) {
    if (key === 'holdingPeriodBars') continue // conditional key, already resolved above
    if (!presentKeys.has(key)) {
      return decodeError(`permalink: missing required query parameter "${key}"`)
    }
  }

  const symbol = qs.get('symbol')!
  if (symbol === '') {
    return decodeError('permalink: query parameter "symbol" must not be empty')
  }

  const dividendReinvest = parseBoolean(qs.get('dividendReinvest')!)
  if (dividendReinvest === null) {
    return decodeError('permalink: query parameter "dividendReinvest" must be "true" or "false"')
  }

  const leverage = parsePositiveFiniteNumber(qs.get('leverage')!)
  if (leverage === null) {
    return decodeError('permalink: query parameter "leverage" must be a finite number greater than 0')
  }

  const entryDate = parseIsoDate(qs.get('entryDate')!)
  if (entryDate === null) {
    return decodeError('permalink: query parameter "entryDate" must be an ISO YYYY-MM-DD calendar date')
  }

  let holdingPeriodBars: number | null = null
  if (holdMode === 'fixed') {
    holdingPeriodBars = parseNonNegativeInteger(qs.get('holdingPeriodBars')!)
    if (holdingPeriodBars === null) {
      return decodeError('permalink: query parameter "holdingPeriodBars" must be a non-negative integer')
    }
  }

  const resolvedEndDate = parseIsoDate(qs.get('resolvedEndDate')!)
  if (resolvedEndDate === null) {
    return decodeError('permalink: query parameter "resolvedEndDate" must be an ISO YYYY-MM-DD calendar date')
  }

  const initialInvestment = parseNonNegativeFiniteNumber(qs.get('initialInvestment')!)
  if (initialInvestment === null) {
    return decodeError('permalink: query parameter "initialInvestment" must be a finite number >= 0')
  }

  const contributionAmount = parseNonNegativeFiniteNumber(qs.get('contributionAmount')!)
  if (contributionAmount === null) {
    return decodeError('permalink: query parameter "contributionAmount" must be a finite number >= 0')
  }

  const rawContributionFrequency = qs.get('contributionFrequency')!
  if (!(CONTRIBUTION_FREQUENCIES as readonly string[]).includes(rawContributionFrequency)) {
    return decodeError(`permalink: unknown contributionFrequency "${rawContributionFrequency}"`)
  }
  const contributionFrequency = rawContributionFrequency as ContributionFrequency

  const expenseRatioPercent = parseNonNegativeFiniteNumber(qs.get('expenseRatioPercent')!)
  if (expenseRatioPercent === null) {
    return decodeError('permalink: query parameter "expenseRatioPercent" must be a finite number >= 0')
  }

  const financingSpreadPercent = parseNonNegativeFiniteNumber(qs.get('financingSpreadPercent')!)
  if (financingSpreadPercent === null) {
    return decodeError('permalink: query parameter "financingSpreadPercent" must be a finite number >= 0')
  }

  const rawTier = qs.get('tier')!
  if (!(TIERS as readonly string[]).includes(rawTier)) {
    return decodeError(`permalink: unknown tier "${rawTier}"`)
  }
  const tier = rawTier as Tier

  const rawScale = qs.get('scale')!
  if (!(SCALES as readonly string[]).includes(rawScale)) {
    return decodeError(`permalink: unknown scale "${rawScale}"`)
  }
  const scale = rawScale as PermalinkScale

  const bundleVersion = qs.get('bundleVersion')!
  if (!BUNDLE_VERSION_PATTERN.test(bundleVersion)) {
    return decodeError('permalink: query parameter "bundleVersion" must be a 12-character hex string')
  }

  const params: PermalinkParams = {
    symbol,
    dividendReinvest,
    leverage,
    entryDate,
    holdingPeriodBars,
    initialInvestment,
    contributionAmount,
    contributionFrequency,
    expenseRatioPercent,
    financingSpreadPercent,
    holdMode,
    resolvedEndDate,
    tier,
    scale,
    bundleVersion,
  }

  return { status: 'ok', params }
}

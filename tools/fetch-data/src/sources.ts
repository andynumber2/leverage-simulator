/**
 * tools/fetch-data/src/sources.ts
 *
 * The locked per-series source resolution table (D-04), rewritten 2026-08-17 around the
 * Source Stack Reversal.
 *
 * WHAT CHANGED AND WHY (D-28): the previous table named a different vendor for daily equity and
 * ETF prices. A real pull disproved every one of its claims: its S&P symbol no longer existed,
 * its Nasdaq-100 file started forty-seven years before the Nasdaq-100 launched, and its "Close"
 * column was serving a dividend-adjusted series under a price label: every "-PR" file would have
 * been total return in disguise, and the byte-identity halt this script used to run would never
 * have fired, because the two files were never going to be identical. Those URLs and symbol
 * conventions came from a single MEDIUM-confidence web-search snippet and unverified recall,
 * never from a successful fetch. The lesson: a vendor claim is not established until a real pull
 * confirms it, and this table now carries only claims verified live against the vendor. See
 * `.planning/phases/02-compiled-data-bundle/02-CONTEXT.md`'s "Source Stack Reversal" section for
 * the full account, including the dropped vendor's name.
 *
 * The replacement is four vendors, each the narrowest source that actually carries what it is
 * asked for:
 *   - Yahoo Finance (query1.finance.yahoo.com/v8/finance/chart/<symbol>, JSON) for daily equity
 *     and ETF prices plus their dividend and split events. Fetched live where possible
 *     (`route: 'live-with-manual-fallback'`); falls back to a human-supplied file under
 *     `raw/manual/` when the live fetch fails, which it currently does from every shared-IP
 *     sandbox this script has been run from (HTTP 429 on `query1`/`query2`, not a malformed
 *     request, see D-27).
 *   - Nasdaq (a distinct vendor, not covered by this plan, see plan 02-07) for the Nasdaq-100
 *     Total Return index.
 *   - FRED for the short-rate series (`route: 'live'`, no fallback, exactly as before).
 *   - Shiller for the pre-1988 monthly S&P dividend input (`route: 'manual-only'`, a one-time
 *     spreadsheet-to-CSV conversion by a human, unchanged in mechanism from before this reversal).
 */

export type SeriesVendor = 'yahoo' | 'nasdaq' | 'fred' | 'shiller'

/**
 * How a series' bytes reach this script.
 *   - 'live': fetched over https on every run, no fallback. A failure is a hard error.
 *   - 'live-with-manual-fallback': attempt a live fetch; on any failure (including a non-200
 *     status), read the declared `manualFile` under `raw/manual/` instead.
 *   - 'manual-only': always read `manualFile`; this script never attempts to fetch it.
 */
export type FetchRoute = 'live' | 'live-with-manual-fallback' | 'manual-only'

/** The directory name (not path) under `raw/` that manually-supplied vendor files live in. */
export const MANUAL_DIR_NAME = 'manual'

export interface SourceSpec {
  /** Raw file stem, e.g. "SPX-PR". The compiler derives `scope` as the stem's segment up to the
   *  first "-", upper-cased; `scope` below must equal that derivation or the compiler aborts
   *  (tools/bundle-compiler/src/raw-input.ts). */
  stem: string
  scope: string
  seriesKind: 'price' | 'total-return' | 'rate' | 'dividend-monthly'
  units: 'index-level' | 'percent-annualized' | 'ratio'
  vendor: SeriesVendor
  vendorName: string
  /** Always https. For a `manual-only` entry this is the page a human visits, not a URL this
   *  script fetches. */
  url: string
  vendorColumn: string
  /** "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
  expectedFirstDate?: string
  license: string
  termsUrl: string
  route: FetchRoute
  /** Filename under `raw/manual/` this spec falls back to or reads from. Absent for
   *  `route: 'live'`. */
  manualFile?: string
  /** Calendar-day age of the newest observation past which the run fails. Absent for
   *  `route: 'live'`. */
  maxStalenessDays?: number
  /** 'as-sourced': the vendor's own value is stored unchanged. 'reconstructed-total-return': this
   *  script derives the stored value from `close` plus dividend events (D-24) rather than storing
   *  the vendor's back-adjusted column, and the D-25 reconstruction-drift gate applies to it. */
  derivation: 'as-sourced' | 'reconstructed-total-return'
  /** The Yahoo chart API's `period1` query value. Only meaningful for `vendor: 'yahoo'` entries. */
  vendorPeriod1?: number
}

/** Personal-use terms; the chart endpoint this script calls is undocumented and carries no
 *  published redistribution grant. Knowingly accepted risk (D-05/D-06), same posture as the
 *  dropped equity vendor's risk this table previously accepted and superseded. */
const YAHOO_LICENSE =
  'Personal-use terms; chart endpoint is undocumented with no published redistribution grant (accepted risk, D-05/D-06)'
/** Resolved 200 (no redirect) via a read-only header request on 2026-08-17. */
const YAHOO_TERMS_URL = 'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html'
const YAHOO_VENDOR_NAME = 'Yahoo Finance'

/** period1 = -2208988800 (1900-01-01 UTC) is the wide value confirmed to work for `^GSPC`
 *  (D-17's pre-1928 depth) and confirmed rejected by the vendor for a post-1970 symbol with an
 *  explicit "Only 100 years worth of day granularity data are allowed" error. Every other symbol
 *  in this table starts after 1970 and uses `YAHOO_PERIOD1_DEFAULT` instead. */
const YAHOO_PERIOD1_WIDE = -2208988800
const YAHOO_PERIOD1_DEFAULT = 0

/** Every daily manually-supplied Yahoo source. The longest legitimate gap between consecutive US
 *  equity trading bars is four calendar days (Friday close, Monday-holiday reopen Tuesday); ten
 *  days is two and a half times that. */
const MANUAL_DAILY_STALENESS_DAYS = 10

/** `period2` for a fresh request: the start of tomorrow (UTC). Always covers every bar through
 *  today's close (the latest a US market session can end is well before UTC midnight), and is
 *  stable across every run within the same UTC calendar day, so refetching the same day twice
 *  produces a byte-identical url instead of a spurious per-second diff in the committed sidecar.
 *  Still satisfies "current unix time computed at request time, never a far-future sentinel": it
 *  is built from `Date.now()` on every call and is at most 24 hours ahead of it. */
function nextUtcMidnightSeconds(): number {
  const now = new Date()
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) / 1000)
}

function yahooUrl(vendorSymbol: string, vendorPeriod1: number): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(vendorSymbol)}?period1=${vendorPeriod1}&period2=${nextUtcMidnightSeconds()}&interval=1d&events=div%2Csplit`
}

/**
 * One Yahoo-sourced price-return series plus its reconstructed total-return sibling (D-24). Both
 * series come out of the same chart payload, so they share one `manualFile`.
 */
function buildYahooFundPair(entry: {
  scope: string
  yahooSymbol: string
  manualFile: string
  expectedFirstDate: string
}): SourceSpec[] {
  const shared = {
    vendor: 'yahoo' as const,
    vendorName: YAHOO_VENDOR_NAME,
    license: YAHOO_LICENSE,
    termsUrl: YAHOO_TERMS_URL,
    route: 'live-with-manual-fallback' as const,
    manualFile: entry.manualFile,
    maxStalenessDays: MANUAL_DAILY_STALENESS_DAYS,
    vendorPeriod1: YAHOO_PERIOD1_DEFAULT,
  }
  return [
    {
      ...shared,
      stem: `${entry.scope}-PR`,
      scope: entry.scope,
      seriesKind: 'price',
      units: 'index-level',
      url: yahooUrl(entry.yahooSymbol, YAHOO_PERIOD1_DEFAULT),
      vendorColumn: 'close',
      expectedFirstDate: entry.expectedFirstDate,
      derivation: 'as-sourced',
    },
    {
      ...shared,
      stem: `${entry.scope}-TR`,
      scope: entry.scope,
      seriesKind: 'total-return',
      units: 'index-level',
      url: yahooUrl(entry.yahooSymbol, YAHOO_PERIOD1_DEFAULT),
      vendorColumn: 'close + dividend events (reconstructed forward per D-24, not adjclose)',
      expectedFirstDate: entry.expectedFirstDate,
      derivation: 'reconstructed-total-return',
    },
  ]
}

/** The nine exchange-traded funds that get a real Yahoo price-return series plus a reconstructed
 *  total-return series (D-24). Each fund's own ticker doubles as its Yahoo symbol. */
const YAHOO_FUNDS: { scope: string; yahooSymbol: string; manualFile: string; expectedFirstDate: string }[] = [
  { scope: 'QQQ', yahooSymbol: 'QQQ', manualFile: 'QQQ.json', expectedFirstDate: '1999-03-10' },
  { scope: 'UPRO', yahooSymbol: 'UPRO', manualFile: 'UPRO.json', expectedFirstDate: '2009-06-25' },
  { scope: 'TQQQ', yahooSymbol: 'TQQQ', manualFile: 'TQQQ.json', expectedFirstDate: '2010-02-11' },
  { scope: 'SSO', yahooSymbol: 'SSO', manualFile: 'SSO.json', expectedFirstDate: '2006-06-21' },
  { scope: 'QLD', yahooSymbol: 'QLD', manualFile: 'QLD.json', expectedFirstDate: '2006-06-21' },
  { scope: 'VTI', yahooSymbol: 'VTI', manualFile: 'VTI.json', expectedFirstDate: '2001-06-15' },
  { scope: 'EFA', yahooSymbol: 'EFA', manualFile: 'EFA.json', expectedFirstDate: '2001-08-27' },
  { scope: 'EEM', yahooSymbol: 'EEM', manualFile: 'EEM.json', expectedFirstDate: '2003-04-14' },
  { scope: 'TLT', yahooSymbol: 'TLT', manualFile: 'TLT.json', expectedFirstDate: '2002-07-30' },
]

/** The S&P 500 index (`^GSPC`) reaches 1927-12-30 (D-17's pre-1928 depth), so its price-return
 *  spec uses the wide `period1`. Its real total return comes from the S&P 500 Total Return index
 *  (`^SP500TR`), not a reconstruction: an index pays no dividends itself, so `^GSPC`'s own
 *  `adjclose` carries no dividend information to reconstruct from (D-15). */
const SPX_PR: SourceSpec = {
  stem: 'SPX-PR',
  scope: 'SPX',
  seriesKind: 'price',
  units: 'index-level',
  vendor: 'yahoo',
  vendorName: YAHOO_VENDOR_NAME,
  url: yahooUrl('^GSPC', YAHOO_PERIOD1_WIDE),
  vendorColumn: 'close',
  expectedFirstDate: '1927-12-30',
  license: YAHOO_LICENSE,
  termsUrl: YAHOO_TERMS_URL,
  route: 'live-with-manual-fallback',
  manualFile: 'GSPC.json',
  maxStalenessDays: MANUAL_DAILY_STALENESS_DAYS,
  derivation: 'as-sourced',
  vendorPeriod1: YAHOO_PERIOD1_WIDE,
}

const SPX_TR: SourceSpec = {
  stem: 'SPX-TR',
  scope: 'SPX',
  seriesKind: 'total-return',
  units: 'index-level',
  vendor: 'yahoo',
  vendorName: YAHOO_VENDOR_NAME,
  url: yahooUrl('^SP500TR', YAHOO_PERIOD1_DEFAULT),
  vendorColumn: 'close',
  expectedFirstDate: '1988-01-04',
  license: YAHOO_LICENSE,
  termsUrl: YAHOO_TERMS_URL,
  route: 'live-with-manual-fallback',
  manualFile: 'SP500TR.json',
  maxStalenessDays: MANUAL_DAILY_STALENESS_DAYS,
  derivation: 'as-sourced',
  vendorPeriod1: YAHOO_PERIOD1_DEFAULT,
}

// NDX total return (the Nasdaq-100 Total Return index, XNDX) is a different vendor (Nasdaq, not
// Yahoo: Yahoo carries the `^XNDX` ticker but stores no history for it, per 02-CONTEXT.md) and is
// added by plan 02-07, not here. This entry's absence is sequencing, not an omission.
const NDX_PR: SourceSpec = {
  stem: 'NDX-PR',
  scope: 'NDX',
  seriesKind: 'price',
  units: 'index-level',
  vendor: 'yahoo',
  vendorName: YAHOO_VENDOR_NAME,
  url: yahooUrl('^NDX', YAHOO_PERIOD1_DEFAULT),
  vendorColumn: 'close',
  expectedFirstDate: '1985-10-01',
  license: YAHOO_LICENSE,
  termsUrl: YAHOO_TERMS_URL,
  route: 'live-with-manual-fallback',
  manualFile: 'NDX.json',
  maxStalenessDays: MANUAL_DAILY_STALENESS_DAYS,
  derivation: 'as-sourced',
  vendorPeriod1: YAHOO_PERIOD1_DEFAULT,
}

export const SOURCES: SourceSpec[] = [
  SPX_PR,
  SPX_TR,
  NDX_PR,
  ...YAHOO_FUNDS.flatMap(buildYahooFundPair),
  {
    stem: 'SPX-DIV-MONTHLY',
    scope: 'SPX',
    seriesKind: 'dividend-monthly',
    units: 'ratio',
    vendor: 'shiller',
    vendorName: 'Robert Shiller (Yale)',
    url: 'https://www.econ.yale.edu/~shiller/data/ie_data.xls',
    vendorColumn: 'D / P (derived annualized yield, TTM dividend over price)',
    expectedFirstDate: '1871-01',
    license: 'Publicly available academic dataset, explicitly redistributable (D-05)',
    termsUrl: 'https://www.econ.yale.edu/~shiller/data.htm',
    route: 'manual-only',
    manualFile: 'SPX-DIV-MONTHLY.csv',
    maxStalenessDays: 75,
    derivation: 'as-sourced',
  },
]

const FRED_LICENSE = 'Public Domain (U.S. Government work)'
const FRED_TERMS_URL = 'https://fred.stlouisfed.org/legal/'
const FRED_VENDOR_NAME = 'FRED (Federal Reserve Bank of St. Louis)'

function fredUrl(seriesId: string): string {
  return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`
}

interface FredSeriesEntry {
  stem: string
  seriesId: string
  expectedFirstDate: string
}

/** Confirmed live via a direct read-only pull of each series' fredgraph.csv endpoint (plan
 *  02-03). Unaffected by the Source Stack Reversal: FRED was never part of it. */
const FRED_SERIES: FredSeriesEntry[] = [
  { stem: 'RATE-DFF', seriesId: 'DFF', expectedFirstDate: '1954-07-01' },
  { stem: 'RATE-DTB3', seriesId: 'DTB3', expectedFirstDate: '1954-01-04' },
  { stem: 'RATE-TB3MS', seriesId: 'TB3MS', expectedFirstDate: '1934-01-01' },
  { stem: 'RATE-NBER', seriesId: 'M1329AUSM193NNBR', expectedFirstDate: '1920-01-01' },
]

export const RATE_SOURCES: SourceSpec[] = FRED_SERIES.map((entry) => ({
  stem: entry.stem,
  scope: 'RATE',
  seriesKind: 'rate',
  units: 'percent-annualized',
  vendor: 'fred',
  vendorName: FRED_VENDOR_NAME,
  url: fredUrl(entry.seriesId),
  vendorColumn: entry.seriesId,
  expectedFirstDate: entry.expectedFirstDate,
  license: FRED_LICENSE,
  termsUrl: FRED_TERMS_URL,
  route: 'live',
  derivation: 'as-sourced',
}))

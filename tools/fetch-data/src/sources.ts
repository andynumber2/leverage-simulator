/**
 * tools/fetch-data/src/sources.ts
 *
 * The locked per-series source resolution table (D-04), verified live where the vendor allows it.
 *
 * ROUTE C / ROUTE B (recorded 2026-08-17, superseding this plan's original live-Stooq-fetch
 * design): Stooq serves a JavaScript proof-of-work bot challenge to every plain-HTTPS request, so
 * no response body from Stooq is real data over a scripted fetch. Every Stooq-sourced entry below
 * therefore carries `manual: true` — a human downloads the vendor's own CSV through a real browser
 * and places it at `raw/manual/<stem>.csv`; `fetch.ts` reads that file and normalizes it through
 * `normalizeStooq` exactly as if it had been fetched. `README.md`/`MANUAL-DOWNLOAD.md` record the
 * refresh procedure. This is Route C, distinct from Route B (a one-time manual spreadsheet
 * conversion, applied here to Shiller because a live read-only probe of econ.yale.edu from this
 * environment failed to connect: `curl -L https://www.econ.yale.edu/~shiller/data/ie_data.xls`
 * returned curl exit 7 / connection failure, confirmed this session).
 *
 * FRED entries are fetched live by this script (`manual: false`): a direct read-only pull against
 * `fredgraph.csv` succeeded this session for every rate series below (see normalize.ts's header
 * comment for the exact confirmed CSV shape, which corrects two errors in 02-RESEARCH.md's Code
 * Examples).
 */

export type SeriesVendor = 'stooq' | 'fred' | 'shiller'

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
  /** Always https. For a `manual: true` entry this is the URL a human visits, not a URL this
   *  script fetches. */
  url: string
  vendorColumn: string
  /** "YYYY" or "YYYY-MM-DD". Omitted where 02-RESEARCH.md's open question 2 left the claim
   *  genuinely unresolved (Stooq's own depth was never confirmed by a direct pull) — the coverage
   *  table still reports what was actually returned, but no expected-vs-actual halt applies. */
  expectedFirstDate?: string
  license: string
  termsUrl: string
  /** true when this script does not fetch the series itself; a human places the vendor's own file
   *  at `raw/manual/<stem>.csv` before a run can produce this series (Route C: Stooq; Route B:
   *  Shiller). false only for the FRED entries in RATE_SOURCES. */
  manual: boolean
  /** true when the declared vendor symbol for a total-return stem is an unverified guess
   *  (RESEARCH.md assumption A2): Stooq's column set was confirmed only as
   *  Date,Open,High,Low,Close,Volume, with no adjusted-close/total-return column documented for
   *  any symbol in this universe. `fetch.ts`'s coverage pass halts naming the symbol if the
   *  downloaded "total-return" file turns out byte-identical to its price-return sibling. */
  totalReturnGuess?: boolean
}

const STOOQ_VENDOR_NAME = 'Stooq'
const STOOQ_LICENSE = 'Permissive for personal use; redistribution terms unclear (accepted risk, D-05/D-06)'
const STOOQ_TERMS_URL = 'https://stooq.com/legal/'

function stooqUrl(vendorSymbol: string): string {
  return `https://stooq.com/q/d/l/?s=${vendorSymbol}&i=d`
}

interface StooqSymbolEntry {
  scope: string
  vendorSymbol: string
  expectedFirstDate?: string
}

/** One row per bundled symbol (D-07). Index symbols use Stooq's "^" convention; US-listed
 *  stocks/ETFs use the lowercase-ticker ".us" convention. Neither convention was confirmed live
 *  this session (Route C: no programmatic Stooq request was attempted, per the user's explicit
 *  decision) — these are the standard public Stooq conventions, to be confirmed by whoever
 *  performs the manual download. */
const STOOQ_SYMBOLS: StooqSymbolEntry[] = [
  { scope: 'SPX', vendorSymbol: '^spx', expectedFirstDate: '1928' },
  { scope: 'NDX', vendorSymbol: '^ndx' },
  { scope: 'QQQ', vendorSymbol: 'qqq.us', expectedFirstDate: '1999' },
  { scope: 'UPRO', vendorSymbol: 'upro.us', expectedFirstDate: '2009' },
  { scope: 'TQQQ', vendorSymbol: 'tqqq.us', expectedFirstDate: '2010' },
  { scope: 'SSO', vendorSymbol: 'sso.us', expectedFirstDate: '2006' },
  { scope: 'QLD', vendorSymbol: 'qld.us', expectedFirstDate: '2006' },
  { scope: 'VTI', vendorSymbol: 'vti.us', expectedFirstDate: '2001' },
  { scope: 'EFA', vendorSymbol: 'efa.us', expectedFirstDate: '2001' },
  { scope: 'EEM', vendorSymbol: 'eem.us', expectedFirstDate: '2003' },
  { scope: 'TLT', vendorSymbol: 'tlt.us', expectedFirstDate: '2002' },
]

function buildStooqPair(entry: StooqSymbolEntry): SourceSpec[] {
  const shared = {
    vendor: 'stooq' as const,
    vendorName: STOOQ_VENDOR_NAME,
    vendorColumn: 'Close',
    license: STOOQ_LICENSE,
    termsUrl: STOOQ_TERMS_URL,
    manual: true as const,
  }
  return [
    {
      ...shared,
      stem: `${entry.scope}-PR`,
      scope: entry.scope,
      seriesKind: 'price',
      units: 'index-level',
      url: stooqUrl(entry.vendorSymbol),
      expectedFirstDate: entry.expectedFirstDate,
    },
    {
      ...shared,
      stem: `${entry.scope}-TR`,
      scope: entry.scope,
      seriesKind: 'total-return',
      units: 'index-level',
      // UNVERIFIED (RESEARCH.md assumption A2): reuses the price-return vendor symbol because no
      // distinct Stooq total-return symbol is confirmed for any bundled instrument. This is
      // expected to trip fetch.ts's same-content halt until a real TR symbol is found (or the
      // shortfall is accepted as a D-04 Key Decision). See MANUAL-DOWNLOAD.md.
      url: stooqUrl(entry.vendorSymbol),
      expectedFirstDate: entry.expectedFirstDate,
      totalReturnGuess: true,
    },
  ]
}

export const SOURCES: SourceSpec[] = [
  ...STOOQ_SYMBOLS.flatMap(buildStooqPair),
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
    manual: true,
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

/** Confirmed live this session via a direct read-only pull of each series' fredgraph.csv
 *  endpoint (all four returned real header rows and real first/last observations; see
 *  normalize.ts's header comment for the exact confirmed shape). This resolves 02-RESEARCH.md's
 *  Assumption A3 and Open Question 1 from [CITED] to [VERIFIED]: M1329AUSM193NNBR runs
 *  1920-01-01 through 1934-03-01 monthly with zero gaps and zero missing-observation markers
 *  (171 rows for 171 months), confirming the pre-1934 short-rate gap-filler exists and is
 *  gap-free across the 1928-1933 window D-13 needs it for. */
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
  manual: false,
}))

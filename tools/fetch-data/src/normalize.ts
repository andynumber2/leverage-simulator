/**
 * tools/fetch-data/src/normalize.ts
 *
 * Per-vendor column extraction into the canonical `date,value` schema (D-03). Every vendor-
 * specific column decision lives here, never in the compiler.
 *
 * FRED CSV shape (confirmed live this session, correcting 02-RESEARCH.md's Code Examples, which
 * were never confirmed via a direct pull there: both direct fetches attempted during research
 * returned HTTP 403):
 *
 *   observation_date,DFF
 *   1954-07-01,1.13
 *   1954-07-02,1.25
 *   ...
 *   2020-10-12,
 *   2020-10-13,0.09
 *
 * Two corrections against RESEARCH.md:
 *   1. The header is `observation_date,<SERIES_ID>` (e.g. `observation_date,DFF`), not
 *      `DATE,VALUE`. `normalizeFred` keys off column position (date=0, value=1), never column
 *      name, so this doesn't need to be re-verified per series.
 *   2. The missing-observation placeholder is a **truly blank field** (`2020-10-12,`), not the
 *      literal `.` character. Verified with `od -c` around Columbus Day 2020 in DTB3's real feed.
 *      `normalizeFred` treats BOTH a blank field and a literal `.` as the missing-observation
 *      marker, since a `.` may still appear on some FRED series or in cached copies, and treating
 *      it as data would silently corrupt a rate series.
 *
 * Yahoo chart JSON shape (D-04 Source Stack Reversal; see sources.ts's header comment for why
 * the previous equity/ETF vendor was dropped entirely rather than kept as a second source):
 * `chart.result[0]` carries `meta`, `timestamp`, `events` and `indicators`. Prices live
 * at `indicators.quote[0].close`; the vendor's own back-adjusted series lives at
 * `indicators.adjclose[0].adjclose`. `events.dividends` and `events.splits` are objects keyed by
 * the event's own unix timestamp, whose values carry `{ amount, date }` and
 * `{ date, numerator, denominator, splitRatio }` respectively. Bar timestamps are seconds since
 * epoch at the session open; `parseYahooChart` converts every timestamp through
 * `America/New_York` explicitly (never bare UTC) via `Intl.DateTimeFormat` with the `en-CA`
 * locale, which yields the required `YYYY-MM-DD` form directly. The two conversions agree on
 * every bar of every committed file today, which is exactly why the zone must stay explicit: that
 * agreement is a coincidence of the session open never crossing midnight UTC, not a property to
 * rely on.
 */

export interface CanonicalRow {
  date: string
  value: number
}

function splitLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.length > 0)
}

const NY_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function unixSecondsToNyDate(unixSeconds: number): string {
  return NY_DATE_FORMATTER.format(new Date(unixSeconds * 1000))
}

export interface YahooChart {
  symbol: string
  /** ISO calendar dates (America/New_York), one per bar, strictly ascending, no duplicates. */
  dates: string[]
  /** Raw (not back-adjusted) close, aligned by index with `dates`. */
  closes: number[]
  /** Vendor's own back-adjusted close, aligned by index with `dates`. Used only by
   *  `measureReconstructionDrift`, never stored directly (D-24). */
  adjCloses: number[]
  /** Calendar date (America/New_York) to summed dividend amount on that date. */
  dividends: Map<string, number>
  /** Calendar date (America/New_York) to split ratio on that date. Present for completeness and
   *  testing; `reconstructYahooTotalReturn` does not consume this (see its doc comment). */
  splits: Map<string, { numerator: number; denominator: number }>
}

/**
 * Parses a Yahoo `v8/finance/chart` JSON response into a `YahooChart`. Builds the returned object
 * key by key from explicitly-typed reads of known field names, never spreads or deep-merges the
 * parsed JSON, so a `__proto__` or `constructor` key anywhere in the untrusted payload cannot
 * reach the returned object or its prototype (T-02-26).
 *
 * Throws naming the field when: `chart.error` is non-null; `chart.result` is absent or empty; the
 * timestamp, close and adjusted-close arrays have different lengths; a close or adjusted close is
 * null, non-finite or not greater than zero; timestamps are not strictly ascending; or two bars
 * map to the same calendar date after zone conversion.
 */
export function parseYahooChart(text: string): YahooChart {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`parseYahooChart: response is not valid JSON: ${(err as Error).message}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('parseYahooChart: response is not a JSON object')
  }
  const root = parsed as Record<string, unknown>

  const chartField = root['chart']
  if (typeof chartField !== 'object' || chartField === null) {
    throw new Error('parseYahooChart: missing "chart" object')
  }
  const chartObj = chartField as Record<string, unknown>

  const errorField = chartObj['error']
  if (errorField !== null && errorField !== undefined) {
    throw new Error(`parseYahooChart: chart.error is non-null: ${JSON.stringify(errorField)}`)
  }

  const resultField = chartObj['result']
  if (!Array.isArray(resultField) || resultField.length === 0) {
    throw new Error('parseYahooChart: chart.result is absent or empty')
  }
  const result0 = resultField[0]
  if (typeof result0 !== 'object' || result0 === null) {
    throw new Error('parseYahooChart: chart.result[0] is not an object')
  }
  const result = result0 as Record<string, unknown>

  const metaField = result['meta']
  if (typeof metaField !== 'object' || metaField === null) {
    throw new Error('parseYahooChart: chart.result[0].meta is absent')
  }
  const meta = metaField as Record<string, unknown>
  const symbolRaw = meta['symbol']
  if (typeof symbolRaw !== 'string' || symbolRaw.length === 0) {
    throw new Error('parseYahooChart: chart.result[0].meta.symbol is absent or not a string')
  }
  const symbol = symbolRaw

  const timestampsRaw = result['timestamp']
  if (!Array.isArray(timestampsRaw)) {
    throw new Error('parseYahooChart: chart.result[0].timestamp is absent or not an array')
  }

  const indicatorsField = result['indicators']
  if (typeof indicatorsField !== 'object' || indicatorsField === null) {
    throw new Error('parseYahooChart: chart.result[0].indicators is absent')
  }
  const indicators = indicatorsField as Record<string, unknown>

  const quoteArr = indicators['quote']
  if (
    !Array.isArray(quoteArr) ||
    quoteArr.length === 0 ||
    typeof quoteArr[0] !== 'object' ||
    quoteArr[0] === null
  ) {
    throw new Error('parseYahooChart: chart.result[0].indicators.quote[0] is absent')
  }
  const closesRaw = (quoteArr[0] as Record<string, unknown>)['close']
  if (!Array.isArray(closesRaw)) {
    throw new Error('parseYahooChart: chart.result[0].indicators.quote[0].close is absent or not an array')
  }

  const adjcloseArr = indicators['adjclose']
  if (
    !Array.isArray(adjcloseArr) ||
    adjcloseArr.length === 0 ||
    typeof adjcloseArr[0] !== 'object' ||
    adjcloseArr[0] === null
  ) {
    throw new Error('parseYahooChart: chart.result[0].indicators.adjclose[0] is absent')
  }
  const adjClosesRaw = (adjcloseArr[0] as Record<string, unknown>)['adjclose']
  if (!Array.isArray(adjClosesRaw)) {
    throw new Error(
      'parseYahooChart: chart.result[0].indicators.adjclose[0].adjclose is absent or not an array',
    )
  }

  if (timestampsRaw.length !== closesRaw.length || timestampsRaw.length !== adjClosesRaw.length) {
    throw new Error(
      `parseYahooChart: timestamp (${timestampsRaw.length}), close (${closesRaw.length}) and adjclose (${adjClosesRaw.length}) arrays have different lengths`,
    )
  }

  const dates: string[] = []
  const closes: number[] = []
  const adjCloses: number[] = []
  const seenDates = new Set<string>()
  let previousTimestamp: number | null = null

  for (let i = 0; i < timestampsRaw.length; i++) {
    const ts = timestampsRaw[i]
    if (typeof ts !== 'number' || !Number.isFinite(ts)) {
      throw new Error(`parseYahooChart: timestamp at index ${i} is not a finite number`)
    }
    if (previousTimestamp !== null && ts <= previousTimestamp) {
      throw new Error(`parseYahooChart: timestamps are not strictly ascending at index ${i}`)
    }
    previousTimestamp = ts

    const closeVal = closesRaw[i]
    if (typeof closeVal !== 'number' || !Number.isFinite(closeVal) || !(closeVal > 0)) {
      throw new Error(
        `parseYahooChart: close at index ${i} (timestamp ${ts}) is null, non-finite or not greater than zero`,
      )
    }

    const adjCloseVal = adjClosesRaw[i]
    if (typeof adjCloseVal !== 'number' || !Number.isFinite(adjCloseVal) || !(adjCloseVal > 0)) {
      throw new Error(
        `parseYahooChart: adjclose at index ${i} (timestamp ${ts}) is null, non-finite or not greater than zero`,
      )
    }

    const isoDate = unixSecondsToNyDate(ts)
    if (seenDates.has(isoDate)) {
      throw new Error(`parseYahooChart: two bars map to the same calendar date "${isoDate}"`)
    }
    seenDates.add(isoDate)

    dates.push(isoDate)
    closes.push(closeVal)
    adjCloses.push(adjCloseVal)
  }

  const dividends = new Map<string, number>()
  const splits = new Map<string, { numerator: number; denominator: number }>()

  const eventsField = result['events']
  if (typeof eventsField === 'object' && eventsField !== null) {
    const events = eventsField as Record<string, unknown>

    const dividendsField = events['dividends']
    if (typeof dividendsField === 'object' && dividendsField !== null) {
      for (const value of Object.values(dividendsField as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null) continue
        const entry = value as Record<string, unknown>
        const amount = entry['amount']
        const date = entry['date']
        if (typeof amount !== 'number' || !Number.isFinite(amount)) {
          throw new Error('parseYahooChart: a dividend event has a non-finite amount')
        }
        if (typeof date !== 'number' || !Number.isFinite(date)) {
          throw new Error('parseYahooChart: a dividend event has a non-finite date')
        }
        const isoDate = unixSecondsToNyDate(date)
        dividends.set(isoDate, (dividends.get(isoDate) ?? 0) + amount)
      }
    }

    const splitsField = events['splits']
    if (typeof splitsField === 'object' && splitsField !== null) {
      for (const value of Object.values(splitsField as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null) continue
        const entry = value as Record<string, unknown>
        const numerator = entry['numerator']
        const denominator = entry['denominator']
        const date = entry['date']
        if (typeof numerator !== 'number' || typeof denominator !== 'number' || typeof date !== 'number') {
          continue
        }
        splits.set(unixSecondsToNyDate(date), { numerator, denominator })
      }
    }
  }

  return { symbol, dates, closes, adjCloses, dividends, splits }
}

/** Extracts the raw (not back-adjusted) close as a canonical `date,value` series. Parses `text`
 *  internally via `parseYahooChart`. */
export function normalizeYahoo(text: string): CanonicalRow[] {
  const chart = parseYahooChart(text)
  return chart.dates.map((date, i) => ({ date, value: chart.closes[i]! }))
}

/**
 * Reconstructs a total-return level forward from `close` plus dividend events (D-24), rather than
 * taking the vendor's back-adjusted `adjclose` directly.
 *
 * Seed: the first row's value is the first bar's raw close, **not** the first bar's adjusted
 * close. The adjusted series is back-adjusted, so its first element moves every time a new
 * dividend is published, and seeding from it would rewrite the entire stored series on every
 * refresh, the exact failure D-24 exists to prevent. A raw first-bar close never moves.
 *
 * Recurrence for every later bar: `level_t = level_{t-1} * (close_t + dividend_t) / close_{t-1}`,
 * where `dividend_t` is zero on a bar with no dividend event and the summed amount when a bar
 * carries more than one.
 *
 * Splits are not handled separately. The vendor's close and its dividend amounts are both already
 * split-adjusted; an unhandled split would introduce a step of two times or more, and
 * `measureReconstructionDrift` holding under 0.2% for the eight-split and five-split symbols in
 * this universe is the standing proof that they are. Do not add a second split adjustment on top
 * of this recurrence.
 *
 * Throws naming the symbol and the date when a dividend event's date matches no bar. Every
 * dividend event matched a bar on every symbol in the committed universe, so a future mismatch is
 * a real vendor change, not an expected condition to filter away.
 */
export function reconstructYahooTotalReturn(chart: YahooChart): CanonicalRow[] {
  const { symbol, dates, closes, dividends } = chart

  const dateSet = new Set(dates)
  for (const dividendDate of dividends.keys()) {
    if (!dateSet.has(dividendDate)) {
      throw new Error(
        `reconstructYahooTotalReturn: dividend event for "${symbol}" on "${dividendDate}" matches no bar`,
      )
    }
  }

  if (dates.length === 0) {
    return []
  }

  const rows: CanonicalRow[] = [{ date: dates[0]!, value: closes[0]! }]
  let level = closes[0]!
  for (let i = 1; i < dates.length; i++) {
    const date = dates[i]!
    const close = closes[i]!
    const previousClose = closes[i - 1]!
    const dividend = dividends.get(date) ?? 0
    level = (level * (close + dividend)) / previousClose
    rows.push({ date, value: level })
  }
  return rows
}

export interface ReconstructionDrift {
  /** Maximum absolute relative difference, over the whole path, between the reconstructed
   *  growth path and the vendor's own adjusted-close growth path. */
  maxRelDeviation: number
  /** The calendar date `maxRelDeviation` occurred on. */
  maxRelDeviationDate: string
}

/**
 * `0.005` (one half of one percent). Anchored to the measured worst case across the nine
 * reconstructed ETFs in this universe (EEM, max-over-path): QQQ 0.01810%, EFA 0.11790%,
 * UPRO 0.03783%, VTI 0.04214%, TLT 0.04412%, SSO 0.04178%, TQQQ 0.09269%, EEM 0.17642%,
 * QLD 0.16916%. `0.005` is 2.8x the measured worst case (EEM); the residual is float rounding in
 * the vendor's own adjustment factors, which grows with cumulative growth (the two most levered
 * histories sit highest). That headroom absorbs several further years of compounding without a
 * spurious failure while staying two orders of magnitude below the defect class this gate exists
 * for: a missed or mis-scaled split moves the path by 100% or more, and a dropped dividend
 * introduces a permanent relative step equal to that dividend's yield.
 */
export const MAX_RECONSTRUCTION_DRIFT = 0.005

/**
 * Compares growth paths, not levels, so the reconstruction's seed choice never enters the
 * comparison. For each bar after the first, computes the reconstructed level divided by the
 * reconstructed first level, compares it against the vendor's adjusted close divided by its own
 * first adjusted close, and takes the absolute relative difference. Returns the maximum such value
 * and the date it occurred on.
 *
 * State honestly what this does not catch: the smallest single dividend event in this universe is
 * a small fraction of a percent of price, well below this gate's noise floor, so this is not a
 * per-dividend audit. It is a check that the reconstruction and the vendor still agree about the
 * shape of the whole history.
 */
export function measureReconstructionDrift(
  chart: YahooChart,
  reconstructedRows: readonly CanonicalRow[],
): ReconstructionDrift {
  const { dates, adjCloses } = chart
  if (dates.length === 0 || reconstructedRows.length === 0) {
    return { maxRelDeviation: 0, maxRelDeviationDate: dates[0] ?? '' }
  }

  const firstAdjClose = adjCloses[0]!
  const firstReconstructed = reconstructedRows[0]!.value

  let maxRelDeviation = 0
  let maxRelDeviationDate = dates[0]!
  for (let i = 1; i < dates.length; i++) {
    const reconstructedGrowth = reconstructedRows[i]!.value / firstReconstructed
    const adjustedGrowth = adjCloses[i]! / firstAdjClose
    const relDeviation = Math.abs(reconstructedGrowth - adjustedGrowth) / adjustedGrowth
    if (relDeviation > maxRelDeviation) {
      maxRelDeviation = relDeviation
      maxRelDeviationDate = dates[i]!
    }
  }
  return { maxRelDeviation, maxRelDeviationDate }
}

const FRED_MISSING_MARKERS = new Set(['', '.'])

/**
 * Extracts `date,value` rows from a FRED `fredgraph.csv` response, keying off column position
 * (date=0, value=1) rather than the header's series-id-named second column. Omits every row whose
 * value is the missing-observation marker (a blank field or a literal `.`) rather than emitting a
 * blank, a zero, or a NaN. Throws naming the line number when a value is present but non-numeric
 * and is not the marker.
 */
export function normalizeFred(csvText: string): CanonicalRow[] {
  const lines = splitLines(csvText)
  if (lines.length === 0) {
    throw new Error('normalizeFred: empty response, expected a header line plus at least one row')
  }

  const header = lines[0]!.split(',')
  if (header.length !== 2) {
    throw new Error(`normalizeFred: expected exactly 2 header columns, got "${lines[0]}"`)
  }

  const rows: CanonicalRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1
    const fields = lines[i]!.split(',')
    if (fields.length !== 2) {
      throw new Error(`normalizeFred: line ${lineNumber} has ${fields.length} fields, expected 2`)
    }
    const dateStr = fields[0]!
    const rawValue = fields[1]!

    if (FRED_MISSING_MARKERS.has(rawValue)) {
      continue
    }

    const value = Number(rawValue)
    if (!Number.isFinite(value)) {
      throw new Error(
        `normalizeFred: line ${lineNumber} value "${rawValue}" is not numeric and is not the missing-observation marker`,
      )
    }
    rows.push({ date: dateStr, value })
  }
  return rows
}

export interface ShillerRow {
  /** ISO date, first of the month. */
  date: string
  /** Shiller's monthly nominal S&P Composite price ("P" column). */
  price: number
  /** Shiller's trailing-twelve-month nominal dividend sum ("D" column), NOT a single month's
   *  cash amount. See Pitfall 1. */
  dividend: number
}

/**
 * Derives an annualized dividend yield per monthly observation as `dividend / price`. Shiller's
 * "D" column is already a trailing-twelve-month sum, so this ratio is directly the annualized
 * yield; it must never be multiplied by twelve or otherwise re-annualized (Pitfall 1: that
 * exact confusion produces a dividend rate roughly twelve times too high, whose signature is a
 * constructed pre-1988 total-return series diverging from the real post-1988 series by about an
 * order of magnitude at the 1988 splice).
 */
export function normalizeShillerDividendYield(rows: ShillerRow[]): CanonicalRow[] {
  return rows.map((row) => {
    if (!(row.price > 0)) {
      throw new Error(`normalizeShillerDividendYield: non-positive price ${row.price} for ${row.date}`)
    }
    if (!Number.isFinite(row.dividend) || row.dividend < 0) {
      throw new Error(`normalizeShillerDividendYield: invalid dividend ${row.dividend} for ${row.date}`)
    }
    return { date: row.date, value: row.dividend / row.price }
  })
}

/**
 * Splits one CSV line on commas outside double quotes, strips the surrounding quotes from a
 * quoted field, and trims each field. Generic (not Shiller-specific): Shiller's data rows carry
 * quoted thousands separators from column 9 onward (e.g. `" 4,693,745.68 "`), so a naive
 * `split(',')` mis-maps every column to the right of index 9. `Date`/`P`/`D` sit at indices
 * 0/1/2, so nothing currently reads a mis-mapped column, but this parser should not be one column
 * addition away from silently reading the wrong number. Plan 02-07 reuses this helper for the
 * Nasdaq export, which carries the same quoted-thousands-separator shape.
 */
export function splitCsvFields(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  fields.push(current.trim())
  return fields
}

/**
 * Parses a human-converted copy of Shiller's `ie_data.xls` "Data" sheet (saved to CSV, e.g. via
 * `soffice --headless --convert-to csv`) into `ShillerRow`s. Locates the header row by scanning
 * for a row whose cells include "Date", "P" and "D" (Shiller's sheet carries several preamble
 * rows before the real table), then reads columns by header name so a column reorder doesn't
 * silently mis-map.
 *
 * Shiller's Date cell is a two-place decimal fraction of the year, not a bare "month digit": the
 * fraction must be right-padded to two digits, never left-padded. "1871.1" is October, encoded as
 * fraction ".1" meaning ".10"; "1871.01" is January, fraction ".01". Left-padding (as an earlier
 * version of this parser did) turns the single-digit tenth month into the first month, colliding
 * every October with January and tripping the canonical writer's ascending-order check.
 *
 * An empty price cell throws at any position: Shiller's price column is never legitimately
 * unpublished for a row that exists at all. An empty dividend cell is legitimate only at the
 * trailing edge of the table (D-12's ragged right edge: Shiller has not yet published this
 * month's trailing-twelve-month dividend sum), so it is dropped only when every later row's
 * dividend cell is also empty; an empty dividend cell followed by any later row that does carry a
 * dividend throws naming the line and the date, because that is a real defect (a hole in the
 * middle of the table), not an unpublished month.
 *
 * Verified against the real committed `raw/manual/SPX-DIV-MONTHLY.csv` on 2026-08-17: 1866 rows
 * from 1871-01-01 through 2026-06-01 once the two trailing rows with an empty dividend cell
 * (2026-07, 2026-08) are dropped, 155 Octobers and 156 Januaries, strictly ascending, no
 * duplicate date.
 */
interface ShillerParsedLine {
  lineNumber: number
  isoDate: string
  price: number
  dividendCell: string
}

/**
 * Shared header-location and row-parsing walk used by both `parseShillerCsv` (which additionally
 * validates and drops trailing empty-dividend rows) and `shillerRawNewestDate` (which needs every
 * dated row, including ones `parseShillerCsv` would drop, for D-27's staleness check: an
 * unpublished dividend does not mean a stale file, and the declared 75-day threshold was derived
 * against the raw file's own newest row, not the newest row that survives the drop rule).
 */
function parseShillerLines(csvText: string): ShillerParsedLine[] {
  const lines = splitLines(csvText)
  let headerIndex = -1
  let dateIdx = -1
  let priceIdx = -1
  let dividendIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const cells = splitCsvFields(lines[i]!)
    const candidateDateIdx = cells.indexOf('Date')
    const candidatePriceIdx = cells.indexOf('P')
    const candidateDividendIdx = cells.indexOf('D')
    if (candidateDateIdx !== -1 && candidatePriceIdx !== -1 && candidateDividendIdx !== -1) {
      headerIndex = i
      dateIdx = candidateDateIdx
      priceIdx = candidatePriceIdx
      dividendIdx = candidateDividendIdx
      break
    }
  }

  if (headerIndex === -1) {
    throw new Error(
      'parseShillerCsv: could not find a header row containing "Date", "P" and "D" columns',
    )
  }

  const parsed: ShillerParsedLine[] = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const lineNumber = i + 1
    const cells = splitCsvFields(lines[i]!)
    const dateCell = cells[dateIdx]
    const priceCell = cells[priceIdx]
    const dividendCell = cells[dividendIdx]

    if (dateCell === undefined || dateCell === '') {
      // Trailing metadata/footnote rows below the data table: stop, not an error.
      break
    }

    const dateMatch = /^(\d{4})\.(\d{1,2})$/.exec(dateCell)
    if (!dateMatch) {
      throw new Error(`parseShillerCsv: line ${lineNumber} date "${dateCell}" is not "YYYY.M" or "YYYY.MM"`)
    }
    const year = dateMatch[1]!
    const fraction = dateMatch[2]!
    // The cell is a two-place decimal fraction of the year: right-pad, never left-pad.
    const month = fraction.length === 1 ? `${fraction}0` : fraction
    if (Number(month) < 1 || Number(month) > 12) {
      throw new Error(`parseShillerCsv: line ${lineNumber} date "${dateCell}" has an out-of-range month`)
    }
    const isoDate = `${year}-${month}-01`

    if (priceCell === undefined || priceCell === '') {
      throw new Error(`parseShillerCsv: line ${lineNumber} (${isoDate}) has an empty price cell`)
    }
    const price = Number(priceCell)
    if (!Number.isFinite(price)) {
      throw new Error(`parseShillerCsv: line ${lineNumber} price "${priceCell}" is not a finite number`)
    }

    parsed.push({ lineNumber, isoDate, price, dividendCell: dividendCell ?? '' })
  }

  return parsed
}

export function parseShillerCsv(csvText: string): ShillerRow[] {
  const parsed = parseShillerLines(csvText)

  let lastNonEmptyDividendIndex = -1
  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i]!.dividendCell !== '') lastNonEmptyDividendIndex = i
  }
  for (let i = 0; i <= lastNonEmptyDividendIndex; i++) {
    if (parsed[i]!.dividendCell === '') {
      throw new Error(
        `parseShillerCsv: line ${parsed[i]!.lineNumber} (${parsed[i]!.isoDate}) has an empty dividend cell, but a later row carries one; this is a hole, not an unpublished month`,
      )
    }
  }

  const kept = parsed.slice(0, lastNonEmptyDividendIndex + 1)
  const dropped = parsed.slice(lastNonEmptyDividendIndex + 1)
  if (dropped.length > 0) {
    process.stdout.write(
      `parseShillerCsv: dropped ${dropped.length} trailing row(s) with an empty dividend cell: ${dropped.map((r) => r.isoDate).join(', ')}\n`,
    )
  }

  return kept.map((row) => ({ date: row.isoDate, price: row.price, dividend: Number(row.dividendCell) }))
}

/**
 * The newest dated row's ISO date in a Shiller-shaped CSV, including a trailing row whose
 * dividend cell is empty. D-27's staleness check needs this rather than `parseShillerCsv`'s
 * return value: an unpublished trailing dividend does not mean a stale file (the committed file
 * may have just been freshly re-downloaded and simply reflects that Shiller has not published
 * this month's trailing-twelve-month sum yet), and the 75-day threshold was derived against this
 * raw newest-row date. Returns null when the table has no data rows.
 */
export function shillerRawNewestDate(csvText: string): string | null {
  const parsed = parseShillerLines(csvText)
  return parsed[parsed.length - 1]?.isoDate ?? null
}

export interface NasdaqNormalizeResult {
  /** Canonical rows in ascending date order, zero-valued rows already dropped. */
  rows: CanonicalRow[]
  /** ISO dates of every dropped zero-valued row, in the order encountered in the source file
   *  (descending, newest first). Never sorted: the run prints these in encounter order so a
   *  reader can see them alongside the file they came from. */
  droppedDates: string[]
}

/**
 * `5`. Two dropped rows are expected on every run of the committed export (today's not-yet-
 * published placeholder plus the one historical Hurricane Sandy closure), and that count does not
 * accumulate over time. Five is headroom for one or two further vendor closures without being
 * loose enough to absorb a format change: a vendor that starts emitting zeros for real trading
 * days is a data problem, not a parsing one, and this normalizer must not launder that into the
 * committed series (see `normalizeNasdaq`'s doc comment for the full reasoning).
 */
export const MAX_NASDAQ_ZERO_ROWS = 5

const NASDAQ_EXPECTED_HEADER = ['Trade Date', 'Index Value', 'Net Change', 'High', 'Low']

/**
 * Parses the Nasdaq index-history export (the vendor behind `raw/manual/XNDX.csv`, the Nasdaq-100
 * Total Return index, D-04, D-14) into the canonical schema. Every quirk of this export is
 * measured and named in plan 02-07's `<interfaces>` section; this function implements its nine
 * rules in order.
 *
 * Zero-valued rows (today's not-yet-published placeholder and the one historical Sandy-closure
 * phantom bar) are dropped here, in the normalizer, rather than admitted through the compiler's
 * `raw/calendar-exceptions.json` override. That file exists to accept a real vendor bar on a date
 * the reference calendar lacks; using it here would instead admit a fabricated 0.0 index level
 * into the compiled Nasdaq-100 total-return series and then whitelist the date, which is not what
 * the override file is for. D-03 puts per-source normalization defects in the fetch script, and a
 * defect in one vendor's export is exactly that kind of concern, never the compiler's. The drop is
 * never silent: every dropped date is returned and the run prints it, and exceeding
 * `MAX_NASDAQ_ZERO_ROWS` throws naming the count and the dates, so a vendor that starts emitting
 * zeros for real trading days surfaces as a build failure rather than being absorbed.
 *
 * Throws naming the header when the header line does not match the expected five column names
 * exactly. Throws naming the count and the dates when more than `MAX_NASDAQ_ZERO_ROWS` rows are
 * dropped. Throws naming the date when the reversed rows are not strictly ascending or carry a
 * duplicate date.
 */
export function normalizeNasdaq(csvText: string): NasdaqNormalizeResult {
  const withoutBom = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText
  const lines = splitLines(withoutBom)
  if (lines.length === 0) {
    throw new Error('normalizeNasdaq: empty response, expected a header line plus data rows')
  }

  const headerFields = splitCsvFields(lines[0]!)
  const headerMatches =
    headerFields.length === NASDAQ_EXPECTED_HEADER.length &&
    NASDAQ_EXPECTED_HEADER.every((name, i) => headerFields[i] === name)
  if (!headerMatches) {
    throw new Error(
      `normalizeNasdaq: expected header "${NASDAQ_EXPECTED_HEADER.join(',')}", got "${lines[0]}"`,
    )
  }
  const dateIdx = headerFields.indexOf('Trade Date')
  const valueIdx = headerFields.indexOf('Index Value')

  interface ParsedRow {
    isoDate: string
    value: number
  }
  const parsedRows: ParsedRow[] = []
  const droppedDates: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1
    const fields = splitCsvFields(lines[i]!)
    if (fields.every((field) => field === '')) {
      continue
    }

    const dateCell = fields[dateIdx]
    if (dateCell === undefined || dateCell === '') {
      throw new Error(`normalizeNasdaq: line ${lineNumber} has an empty date cell`)
    }
    const dateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(dateCell)
    if (!dateMatch) {
      throw new Error(`normalizeNasdaq: line ${lineNumber} date "${dateCell}" is not in "M/D/YY" form`)
    }
    const month = dateMatch[1]!.padStart(2, '0')
    const day = dateMatch[2]!.padStart(2, '0')
    const twoDigitYear = Number(dateMatch[3])
    // Pivot at seventy: a year below seventy is in the two thousands, seventy or above is in the
    // nineteen hundreds. This series begins in 1999 and cannot contain a year this pivot resolves
    // wrongly (see plan 02-07's <interfaces> section).
    const century = twoDigitYear < 70 ? 2000 : 1900
    const isoDate = `${century + twoDigitYear}-${month}-${day}`

    const valueCell = fields[valueIdx]
    if (valueCell === undefined || valueCell === '') {
      throw new Error(`normalizeNasdaq: line ${lineNumber} (${isoDate}) has an empty value cell`)
    }
    const value = Number(valueCell.replace(/,/g, ''))
    if (!Number.isFinite(value)) {
      throw new Error(`normalizeNasdaq: line ${lineNumber} (${isoDate}) value "${valueCell}" is not a finite number`)
    }

    if (value === 0) {
      droppedDates.push(isoDate)
      continue
    }

    parsedRows.push({ isoDate, value })
  }

  if (droppedDates.length > MAX_NASDAQ_ZERO_ROWS) {
    throw new Error(
      `normalizeNasdaq: dropped ${droppedDates.length} zero-valued row(s), exceeding MAX_NASDAQ_ZERO_ROWS (${MAX_NASDAQ_ZERO_ROWS}): ${droppedDates.join(', ')}`,
    )
  }

  const ascending = parsedRows.slice().reverse()
  for (let i = 1; i < ascending.length; i++) {
    const prev = ascending[i - 1]!
    const curr = ascending[i]!
    if (curr.isoDate === prev.isoDate) {
      throw new Error(`normalizeNasdaq: duplicate date "${curr.isoDate}" after reversal`)
    }
    if (curr.isoDate < prev.isoDate) {
      throw new Error(
        `normalizeNasdaq: rows out of ascending order after reversal at "${curr.isoDate}" (previous was "${prev.isoDate}")`,
      )
    }
  }

  return {
    rows: ascending.map((row) => ({ date: row.isoDate, value: row.value })),
    droppedDates,
  }
}

/**
 * Emits the canonical CSV: header line `date,value`, LF line endings, trailing newline. Throws
 * when rows are unsorted or carry a duplicate date, or when a value is not finite. Does not sort
 * `rows` itself: an unsorted input is a bug in the caller, not something to paper over.
 */
export function toCanonicalCsv(rows: readonly CanonicalRow[]): string {
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!
    const curr = rows[i]!
    if (curr.date === prev.date) {
      throw new Error(`toCanonicalCsv: duplicate date "${curr.date}"`)
    }
    if (curr.date < prev.date) {
      throw new Error(
        `toCanonicalCsv: rows out of ascending order at "${curr.date}" (previous was "${prev.date}")`,
      )
    }
  }

  const lines = ['date,value']
  for (const row of rows) {
    if (!Number.isFinite(row.value)) {
      throw new Error(`toCanonicalCsv: value for "${row.date}" is not a finite number`)
    }
    lines.push(`${row.date},${row.value}`)
  }
  return `${lines.join('\n')}\n`
}

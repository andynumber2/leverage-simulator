/**
 * tools/fetch-data/src/normalize.ts
 *
 * Per-vendor column extraction into the canonical `date,value` schema (D-03). Every vendor-
 * specific column decision lives here, never in the compiler.
 *
 * FRED CSV shape (confirmed live this session, correcting 02-RESEARCH.md's Code Examples, which
 * were never confirmed via a direct pull there — both direct fetches attempted during research
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
 * Stooq CSV shape (per 02-RESEARCH.md, not independently re-confirmed this session — Stooq is
 * fetched by a human via Route C, never by this script):
 *
 *   Date,Open,High,Low,Close,Volume
 *   2009-06-25,39.87,40.35,38.85,39.61,15000
 *
 * `normalizeStooq` extracts `Date` and `Close` by header name (not fixed column position), so a
 * vendor column reorder doesn't silently mis-map, and throws naming the header when either column
 * is absent.
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

/**
 * Extracts `date,value` rows from a Stooq daily CSV, dropping every other column. Throws naming
 * the header when the expected `Date`/`Close` column is absent, or naming the line number when a
 * row's `Close` value is not a finite number.
 */
export function normalizeStooq(csvText: string): CanonicalRow[] {
  const lines = splitLines(csvText)
  if (lines.length === 0) {
    throw new Error('normalizeStooq: empty response, expected a header line plus at least one row')
  }

  const header = lines[0]!.split(',').map((h) => h.trim())
  const dateIdx = header.indexOf('Date')
  const closeIdx = header.indexOf('Close')
  if (dateIdx === -1 || closeIdx === -1) {
    throw new Error(
      `normalizeStooq: expected "Date" and "Close" columns, got header "${lines[0]}"`,
    )
  }

  const rows: CanonicalRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1
    const fields = lines[i]!.split(',')
    const dateStr = fields[dateIdx]
    const closeStr = fields[closeIdx]
    if (dateStr === undefined || closeStr === undefined) {
      throw new Error(`normalizeStooq: line ${lineNumber} has fewer fields than the header declares`)
    }
    const value = Number(closeStr)
    if (!Number.isFinite(value)) {
      throw new Error(`normalizeStooq: line ${lineNumber} Close value "${closeStr}" is not a finite number`)
    }
    rows.push({ date: dateStr, value })
  }
  return rows
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
  /** Shiller's trailing-twelve-month nominal dividend sum ("D" column) — NOT a single month's
   *  cash amount. See Pitfall 1. */
  dividend: number
}

/**
 * Derives an annualized dividend yield per monthly observation as `dividend / price`. Shiller's
 * "D" column is already a trailing-twelve-month sum, so this ratio is directly the annualized
 * yield; it must never be multiplied by twelve or otherwise re-annualized (Pitfall 1 — that
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
 * Parses a human-converted copy of Shiller's `ie_data.xls` "Data" sheet (saved to CSV, e.g. via
 * `soffice --headless --convert-to csv`) into `ShillerRow`s. Locates the header row by scanning
 * for a row whose cells include both "Date" and "P" (Shiller's sheet carries several preamble
 * rows before the real table), then reads columns by header name so a column reorder doesn't
 * silently mis-map. Shiller's Date column is a decimal year.month where the month is NOT
 * zero-padded in a way that survives numeric round-tripping (e.g. "1871.1" is ambiguous between
 * January and October if read as a bare float) — this parser requires the Date cell to be a
 * zero-padded string of the form "YYYY.MM" or "YYYY.M" with M read from the string, never from
 * the parsed float, and throws naming the raw cell when it isn't.
 *
 * UNVERIFIED against the real converted file: this session has no network path to
 * econ.yale.edu (see sources.ts), so this parser has not been run against Shiller's actual
 * output. Re-verify column names and the preamble-row-skip logic against the real
 * `raw/manual/SPX-DIV-MONTHLY.csv` once a human supplies it, per MANUAL-DOWNLOAD.md.
 */
export function parseShillerCsv(csvText: string): ShillerRow[] {
  const lines = splitLines(csvText)
  let headerIndex = -1
  let dateIdx = -1
  let priceIdx = -1
  let dividendIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i]!.split(',').map((c) => c.trim())
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

  const rows: ShillerRow[] = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const lineNumber = i + 1
    const cells = lines[i]!.split(',').map((c) => c.trim())
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
    const month = dateMatch[2]!.padStart(2, '0')
    if (Number(month) < 1 || Number(month) > 12) {
      throw new Error(`parseShillerCsv: line ${lineNumber} date "${dateCell}" has an out-of-range month`)
    }
    const isoDate = `${year}-${month}-01`

    const price = Number(priceCell)
    const dividend = Number(dividendCell)
    if (!Number.isFinite(price)) {
      throw new Error(`parseShillerCsv: line ${lineNumber} price "${priceCell}" is not a finite number`)
    }
    if (!Number.isFinite(dividend)) {
      throw new Error(`parseShillerCsv: line ${lineNumber} dividend "${dividendCell}" is not a finite number`)
    }

    rows.push({ date: isoDate, price, dividend })
  }

  return rows
}

/**
 * Emits the canonical CSV: header line `date,value`, LF line endings, trailing newline. Throws
 * when rows are unsorted or carry a duplicate date, or when a value is not finite. Does not sort
 * `rows` itself — an unsorted input is a bug in the caller, not something to paper over.
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

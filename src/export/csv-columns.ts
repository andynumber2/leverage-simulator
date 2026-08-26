/**
 * src/export/csv-columns.ts
 *
 * D-06: the single declaration of the CSV column set, in one fixed order, with these exact
 * header names -- shared by `csv.worker.ts` (which writes cells in this order) and
 * `tests/app/export-csv.test.ts` (which reads column positions from here, never from hardcoded
 * indices), so the two cannot drift. Changing this order or dropping a column later invalidates
 * every recompute recipe already written against an exported file (Task 1's reversibility note).
 *
 * Exactly D-06's eight columns: no per-bar financing charge, expense charge or leveraged return.
 * Those numbers exist nowhere in the kernel's output today (F-03); adding them was declined under
 * D-06 rather than shipped as a CSV-only parallel implementation that could drift from the kernel.
 *
 * T-08-06 (formula-injection mitigation): every cell in this column set is either a kernel-
 * computed number written with `String()` or an ISO date resolved from the compiled calendar, so
 * no cell can begin with an equals, plus, minus or at sign in a way a spreadsheet evaluates as a
 * formula. Any FUTURE column carrying free text must be prefixed with an apostrophe or a tab
 * before it reaches a cell -- `tests/app/export-csv.test.ts` asserts no emitted data cell starts
 * with one of those four characters.
 */

export interface CsvColumn {
  key: string
  header: string
}

export const CSV_COLUMNS: readonly CsvColumn[] = [
  { key: 'date', header: 'date' },
  { key: 'indexReturn', header: 'indexReturn' },
  { key: 'shortRate', header: 'shortRate' },
  { key: 'calendarDaysElapsed', header: 'calendarDaysElapsed' },
  { key: 'contributionFlag', header: 'contributionFlag' },
  { key: 'contributionAmount', header: 'contributionAmount' },
  { key: 'longGapFlag', header: 'longGapFlag' },
  { key: 'portfolioValue', header: 'portfolioValue' },
] as const

export const CSV_HEADER_LINE: string = CSV_COLUMNS.map((column) => column.header).join(',')

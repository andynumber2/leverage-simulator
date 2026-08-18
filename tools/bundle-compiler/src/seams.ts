/**
 * tools/bundle-compiler/src/seams.ts
 *
 * The typed seam record and its collector (D-16). No seam is produced by plan 02-01; later plans
 * (splice, interpolation, carry-forward) populate this. This plan defines the type and emits an
 * empty array per series.
 */

export type SeamKind = 'splice' | 'interpolation' | 'carry-forward'

export interface SeamRecord {
  kind: SeamKind
  firstDate: string
  lastDate: string
  sourceBefore: string
  sourceAfter: string
  method: string
  /**
   * True when this seam replaces a genuinely-daily input with one derived from a lower-frequency
   * source (a monthly-to-daily interpolation, or a splice whose sourceBefore is a monthly
   * series). False for a carry-forward inside an otherwise-daily source (e.g. a bond-market
   * holiday): that does not make the source stop being daily. `computeTierRanges` (tiers.ts)
   * scans this boolean, never the free-text `method` string, so a tier boundary never depends on
   * prose (plan 02-04, D-16).
   */
  degradesToNonDaily: boolean
}

/** Accumulates seam records and returns them sorted by firstDate ascending then kind ascending. */
export class SeamCollector {
  private readonly items: SeamRecord[] = []

  add(record: SeamRecord): void {
    this.items.push(record)
  }

  records(): SeamRecord[] {
    return [...this.items].sort((a, b) => {
      if (a.firstDate !== b.firstDate) return a.firstDate < b.firstDate ? -1 : 1
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
      return 0
    })
  }
}

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

/**
 * src/export/download.ts
 *
 * The one Blob-to-download primitive shared by the PNG clipboard-failure fallback (this plan) and
 * the CSV export (plan 08-02). `URL.createObjectURL` + a synthetic `<a download>` click is the
 * standard, zero-dependency browser pattern for triggering a file save without a server round
 * trip or a memory-heavy data-URL. `URL.revokeObjectURL` runs in a `finally` (T-08-04) so a throw
 * from the anchor click itself can never leak the object URL and grow page memory unbounded
 * across repeated exports.
 *
 * Deliberately free of any PNG-specific or CSV-specific knowledge -- callers decide the Blob's
 * MIME type and the filename; this function only wires the download mechanics.
 */

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    try {
      anchor.click()
    } finally {
      document.body.removeChild(anchor)
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

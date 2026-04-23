/**
 * CSV download utility — browser-only, no server required.
 *
 * @param filename  Suggested filename (e.g. "people-export.csv")
 * @param rows      2-D array of strings; first row should be headers.
 */
export function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

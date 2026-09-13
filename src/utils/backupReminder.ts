const KEY_EDITS = 'rootline.editsSinceExport'
const KEY_DISMISSED = 'rootline.backupBannerDismissedAt'

export function readEditsSinceExport(): number {
  const raw = localStorage.getItem(KEY_EDITS)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function writeEditsSinceExport(count: number): void {
  localStorage.setItem(KEY_EDITS, String(Math.max(0, count)))
}

export function markExported(): void {
  writeEditsSinceExport(0)
  localStorage.removeItem(KEY_DISMISSED)
}

export function markEditAndShouldRemind(previous: number): { next: number; remind: boolean } {
  const next = previous + 1
  writeEditsSinceExport(next)
  // First successful write, and every 5 edits thereafter.
  const remind = next === 1 || next % 5 === 0
  return { next, remind }
}

export function dismissBackupBanner(): void {
  localStorage.setItem(KEY_DISMISSED, new Date().toISOString())
}

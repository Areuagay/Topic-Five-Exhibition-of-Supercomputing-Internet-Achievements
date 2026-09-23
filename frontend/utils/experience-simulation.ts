/** Compressed demo time: even small files have visible feedback; TB files stay usable. */
export function uploadDurationMs(bytes: number): number {
  const size = Number.isFinite(bytes) ? Math.max(0, bytes) : 0
  return Math.min(12000, Math.round(1500 + 450 * Math.log2(1 + size / 8192)))
}

export function uploadPercentage(elapsed: number, duration: number): number {
  return Math.min(99, Math.max(0, Math.floor(elapsed / duration * 100)))
}

export function canViewResult(run?: { status: string; progress: number; has_detail?: boolean; has_result?: boolean } | null): boolean {
  return !!run && run.status === 'success' && run.progress >= 100 && (run.has_result ?? run.has_detail) === true
}

export interface DataEntry { key: string; value: unknown }
export interface DataBlock extends DataEntry { fullWidth: boolean }

const isScalar = (value: unknown): boolean => value === null || typeof value !== 'object'

export function isCompactValue(value: unknown): boolean {
  return isScalar(value) || (Array.isArray(value) && value.length <= 8 && value.every(isScalar))
}

function isCompactObject(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every(isCompactValue)
}

// Pair only simple tables with comparable visible row counts. Nested structures,
// wide tables, and unpaired sections keep the full available width.
function tableHeight(value: unknown): number | null {
  if (!Array.isArray(value) || !value.length) return null
  if (!value.every(row => !!row && typeof row === 'object' && !Array.isArray(row)
    && Object.values(row).every(isScalar))) return null
  const columns = new Set(value.flatMap(row => Object.keys(row)))
  return columns.size <= 6 ? Math.min(value.length, 9) : null
}

export function layoutDataBlocks(entries: DataEntry[]): DataBlock[] {
  const compact = entries.filter(entry => isCompactObject(entry.value))
  const other = entries.filter(entry => !isCompactObject(entry.value))
  const blocks = [...compact, ...other].map(entry => ({ ...entry, fullWidth: true }))
  for (let index = compact.length; index + 1 < blocks.length; index++) {
    const first = tableHeight(blocks[index]!.value)
    const second = tableHeight(blocks[index + 1]!.value)
    if (first === null || second === null || Math.abs(first - second) > 2) continue
    blocks[index]!.fullWidth = false
    blocks[index + 1]!.fullWidth = false
    index++
  }
  return blocks
}

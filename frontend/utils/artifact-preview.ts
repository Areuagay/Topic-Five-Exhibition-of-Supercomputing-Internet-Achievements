export function previewKind(artifact: { name: string; format?: string; preview_supported?: boolean }) {
  if (artifact.preview_supported === false) return undefined
  const format = (artifact.format || artifact.name.split('.').pop() || '').toLowerCase().replace(/^\./, '')
  if (['png','jpg','jpeg','webp','gif','svg','avif','bmp','ico'].includes(format)) return 'image'
  if (['mp4','webm','ogv'].includes(format)) return 'video'
  if (['mp3','wav','ogg','m4a','flac'].includes(format)) return 'audio'
  if (format === 'csv') return 'csv'
  if (format === 'json') return 'json'
  if (['txt','log','md','yaml','yml','xml'].includes(format)) return 'text'
  return undefined
}

export function parseCsvPreview(text: string, incomplete = false, maxRows = 501, maxColumns = 60) {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false, started = false, truncated = incomplete
  const field = () => { if (row.length < maxColumns) row.push(cell); else truncated = true; cell = '' }
  const record = () => { field(); rows.push(row); row = []; started = false }
  const input = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!
    started = true
    if (quoted) {
      if (char === '"') { if (input[i+1] === '"') { cell += '"'; i++ } else quoted = false }
      else cell += char
    } else if (char === '"' && cell === '') quoted = true
    else if (char === ',') field()
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i+1] === '\n') i++
      record()
      if (rows.length >= maxRows) { truncated ||= i < input.length-1; return { rows, truncated } }
    } else cell += char
  }
  if (quoted && !incomplete) throw new Error('CSV quoted field is incomplete')
  if (started && !incomplete) { if (rows.length < maxRows) record(); else truncated = true }
  return { rows, truncated }
}

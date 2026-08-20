/**
 * 格式化工具：数字 / 字节 / 耗时 / 时间 / 状态文案映射。
 */

export function formatNumber(value?: number | string | null, digits = 0): string {
  if (value === undefined || value === null || value === '') return '-'
  const n = Number(value)
  if (Number.isNaN(n)) return String(value)
  return n.toLocaleString('zh-CN', { maximumFractionDigits: digits })
}

export function formatPercent(value?: number | string | null, digits = 1): string {
  if (value === undefined || value === null || value === '') return '-'
  const n = Number(value)
  if (Number.isNaN(n)) return String(value)
  return `${n.toFixed(digits)}%`
}

/** 字节数 → 人类可读（B / KB / MB / GB / TB） */
export function formatBytes(bytes?: number | string | null): string {
  if (bytes === undefined || bytes === null || bytes === '') return '-'
  const n = Number(bytes)
  if (Number.isNaN(n)) return String(bytes)
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

/** 秒 → 人类可读耗时（如 2小时13分） */
export function formatDuration(seconds?: number | string | null): string {
  if (seconds === undefined || seconds === null || seconds === '') return '-'
  const s = Math.max(0, Math.floor(Number(seconds)))
  if (Number.isNaN(s)) return String(seconds)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}天${h}小时`
  if (h > 0) return `${h}小时${m}分`
  if (m > 0) return `${m}分${sec}秒`
  return `${sec}秒`
}

export function formatMs(ms?: number | string | null): string {
  if (ms === undefined || ms === null || ms === '') return '-'
  const n = Number(ms)
  if (Number.isNaN(n)) return String(ms)
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`
  return `${n} ms`
}

/** ISO 时间 → 本地日期时间字符串 */
export function formatTimestamp(iso?: string | null, withSeconds = false): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (x: number) => String(x).padStart(2, '0')
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return withSeconds ? `${base}:${pad(d.getSeconds())}` : base
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '-'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  return `${d} 天前`
}

/* ==================== 状态 → 文案 / Element Plus Tag 类型 ==================== */

const STATUS_TEXT: Record<string, string> = {
  pending: '排队中',
  queued: '排队中',
  running: '运行中',
  success: '成功',
  failed: '失败',
  stopped: '已停止',
  online: '在线',
  degraded: '降级',
  offline: '离线',
  unknown: '未知',
  migrating: '迁移中',
  available: '可用',
  active: '活跃',
  inactive: '未激活',
  simulated: '模拟',
  ok: '正常',
}

export function statusText(status?: string | null): string {
  if (!status) return '-'
  return STATUS_TEXT[status] ?? status
}

const STATUS_TAG: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'primary'> = {
  success: 'success',
  online: 'success',
  available: 'success',
  ok: 'success',
  running: 'primary',
  active: 'primary',
  migrating: 'warning',
  degraded: 'warning',
  queued: 'warning',
  pending: 'info',
  stopped: 'warning',
  offline: 'info',
  unknown: 'info',
  failed: 'danger',
  simulated: 'info',
}

export function statusTagType(status?: string | null): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (!status) return 'info'
  return STATUS_TAG[status] ?? 'info'
}

const LEVEL_TEXT: Record<string, string> = {
  info: 'INFO',
  debug: 'DEBUG',
  warning: 'WARN',
  warn: 'WARN',
  error: 'ERROR',
}

export function levelText(level?: string | null): string {
  if (!level) return 'INFO'
  return LEVEL_TEXT[level] ?? level.toUpperCase()
}

export function truncate(str?: string | null, max = 24): string {
  if (!str) return ''
  return str.length > max ? `${str.slice(0, max)}…` : str
}

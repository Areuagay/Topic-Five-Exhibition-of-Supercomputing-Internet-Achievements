/** Client-side demo values only; never use these as online-user measurements. */
export function onlineUserDemoDelay(random: () => number = Math.random): number {
  return 5000 + Math.floor(random() * 5001)
}

export function nextOnlineUserDemoCount(
  baseline: number,
  previous: number,
  random: () => number = Math.random,
): number {
  const base = Number.isFinite(baseline) ? Math.max(0, Math.round(baseline)) : 0
  if (base === 0) return 0
  const radius = Math.max(1, Math.round(base * 0.02))
  const lower = Math.max(0, base - radius)
  const upper = base + radius
  const current = Number.isFinite(previous)
    ? Math.min(upper, Math.max(lower, Math.round(previous)))
    : base
  const direction = random() < 0.5 ? -1 : 1
  const step = 1 + Math.floor(random() * Math.max(1, Math.round(base * 0.003)))
  const next = Math.min(upper, Math.max(lower, current + direction * step))
  return next === current ? current - direction : next
}

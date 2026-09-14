export type Point2 = { x: number; y: number }
export type TimedPoint = Point2 & { z: number; t: number }
export function spatialBounds(points: Point2[]) {
  const valid = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (!valid.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  const xs = valid.map(p => p.x), ys = valid.map(p => p.y)
  const lowX = Math.min(...xs), highX = Math.max(...xs), lowY = Math.min(...ys), highY = Math.max(...ys)
  const half = Math.max(highX - lowX, highY - lowY, 1) * .56
  const x = (lowX + highX) / 2, y = (lowY + highY) / 2
  return { minX: x - half, maxX: x + half, minY: y - half, maxY: y + half }
}
export function trajectoryTimes(tracks: { points: TimedPoint[] }[]) {
  return [...new Set(tracks.flatMap(track => track.points.map(p => p.t)).filter(Number.isFinite))].sort((a, b) => a - b)
}
// Hold the latest measured observation, without interpolation or future samples.
export function sampleAt(points: TimedPoint[], time: number) {
  let result: TimedPoint | undefined
  for (const point of points) if (Number.isFinite(point.t) && point.t <= time && (!result || point.t > result.t)) result = point
  return result
}

import { createReadStream, statSync } from 'node:fs'
import { resolve } from 'node:path'

// These are supplied scene recordings, not outputs produced by the current run.
// IDs deliberately differ from the superseded A01/U01 operator recording plan.
export const SCENARIO_VIDEOS = [
  { id: 'vehicle-models', domain: 'automotive', scenario_id: 'vehicle-crash', title: '车辆模型展示', duration_seconds: 90, source_path: '汽车高保/A01_external_flow.mp4' },
  { id: 'vehicle-drop', domain: 'automotive', scenario_id: 'vehicle-crash', title: '汽车毁伤 · 坠落', duration_seconds: 90, source_path: '汽车毁伤-坠落/A02_vehicle-crash.mp4' },
  { id: 'vehicle-falling-object', domain: 'automotive', scenario_id: 'vehicle-crash', title: '汽车毁伤 · 坠物', duration_seconds: 90.87, source_path: '汽车毁伤-坠物/A03_vehicle-crash.mp4' },
  { id: 'vehicle-collision', domain: 'automotive', scenario_id: 'vehicle-crash', title: '汽车毁伤 · 冲撞', duration_seconds: 65.83, source_path: '汽车毁伤-冲撞/A04_vehicle-crash.mp4' },
  { id: 'uav-visual-avoidance', domain: 'uav', scenario_id: 'path-planning', title: 'RGB / 深度视觉避障', duration_seconds: 65, source_path: '无人机-基于RGB-深度视觉避障/U01_path-planning.mp4' },
  { id: 'uav-flight', domain: 'uav', scenario_id: 'path-planning', title: '起飞、侧飞、返航与降落', duration_seconds: 75, source_path: '无人机-常规起飞-前行-左右侧飞-返航-降落/U02_path-planning.mp4' },
]

export function resolveScenarioVideo(id, repoRoot, mediaDir = process.env.SCENARIO_VIDEO_DIR) {
  const entry = SCENARIO_VIDEOS.find(item => item.id === id)
  if (!entry) return null
  const candidates = mediaDir
    ? [resolve(mediaDir, `${entry.id}.mp4`)]
    : [resolve(repoRoot, 'artifacts/videos', `${entry.id}.mp4`), resolve(repoRoot, 'AAA/课题五递交视频-12', entry.source_path)]
  for (const path of candidates) {
    try { const stat = statSync(path); if (stat.isFile() && stat.size > 0) return { path, size: stat.size } } catch { /* absent on this installation */ }
  }
  return null
}

export function listScenarioVideos(domain, scenarioId, repoRoot, mediaDir) {
  return SCENARIO_VIDEOS.filter(item => item.domain === domain && item.scenario_id === scenarioId)
    .map(({ source_path, ...entry }) => ({
      ...entry,
      source_type: 'provided',
      available: !!resolveScenarioVideo(entry.id, repoRoot, mediaDir),
      video_url: `/api/v1/scenario-videos/${entry.id}/content`,
    }))
}

// Stream recordings instead of loading hundreds of MB into memory. Browser
// seeking needs byte ranges, including open-ended and suffix ranges.
export function sendScenarioVideo(req, res, file, headers = {}) {
  let start = 0
  let end = file.size - 1
  const range = req.headers.range
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    let valid = !!match && !!(match[1] || match[2])
    if (valid) {
      if (!match[1]) {
        const suffix = Number(match[2])
        valid = Number.isSafeInteger(suffix) && suffix > 0
        start = Math.max(0, file.size - suffix)
      } else {
        start = Number(match[1])
        const requestedEnd = match[2] ? Number(match[2]) : end
        valid = Number.isSafeInteger(start) && Number.isSafeInteger(requestedEnd) && start < file.size && requestedEnd >= start
        end = Math.min(end, requestedEnd)
      }
    }
    if (!valid) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${file.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': 0 })
      res.end()
      return
    }
  }
  res.writeHead(range ? 206 : 200, {
    ...headers,
    'Content-Type': 'video/mp4',
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${file.size}` } : {}),
  })
  if (req.method === 'HEAD') { res.end(); return }
  const stream = createReadStream(file.path, { start, end })
  stream.on('error', () => res.destroy())
  res.on('close', () => stream.destroy())
  stream.pipe(res)
}

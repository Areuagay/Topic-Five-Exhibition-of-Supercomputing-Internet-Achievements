import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'

export function createProvidedResults(root) {
  const directory = resolve(root, 'artifacts/provided')
  const indexPath = resolve(directory, 'index.json')
  // A missing package has no samples; a corrupt package is an explicit error.
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : { results: [], assets: [] }
  return {
    find(domain, scenarioId) {
      return index.results.find(item => item.domain === domain && item.scenario_id === scenarioId) ?? null
    },
    file(id, preview = false) {
      const asset = index.assets.find(item => item.id === id)
      if (!asset || (preview && !asset.preview_supported)) return null
      const path = resolve(directory, asset.path)
      if (!path.startsWith(directory + sep) || !existsSync(path) || !statSync(path).isFile()) return null
      if (!realpathSync(path).startsWith(realpathSync(directory) + sep)) return null
      return { path, name: asset.name }
    },
  }
}

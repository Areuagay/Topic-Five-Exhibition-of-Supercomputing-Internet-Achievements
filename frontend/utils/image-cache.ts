/** Component-owned decoded frames; no global state or cross-run retention. */
export function createImageCache<T>(load: (url: string) => Promise<T>, capacity = 24) {
  const entries = new Map<string, Promise<T>>()
  return {
    get(url: string): Promise<T> {
      const existing = entries.get(url)
      if (existing) return existing
      if (entries.size >= capacity) entries.delete(entries.keys().next().value!)
      const result = load(url).catch(error => { if (entries.get(url) === result) entries.delete(url); throw error })
      entries.set(url, result)
      return result
    },
    clear() { entries.clear() },
  }
}

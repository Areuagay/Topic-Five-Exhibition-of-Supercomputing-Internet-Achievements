import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

/** Keep layout stable; animate only compositor properties, never table height. */
export function useExperienceMotion(root: Ref<HTMLElement | undefined>, step: Ref<number>, animateOnMount = true) {
  let animation: Animation | undefined
  let generation = 0
  let disposed = false
  let releaseTimer: ReturnType<typeof setTimeout> | undefined
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

  async function reveal(direction = 1, changing = false) {
    const current = ++generation
    const surface = root.value
    if (!surface) return
    const rect = surface.getBoundingClientRect()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    clearTimeout(releaseTimer)
    animation?.cancel()
    // Reserve the old layout before KeepAlive swaps children. This also keeps
    // the scrollbar present, so table column widths do not change mid-entry.
    surface.style.minHeight = `${Math.max(rect.height, innerHeight - rect.top)}px`
    await nextTick()
    if (disposed || current !== generation) return
    const content = surface.querySelector<HTMLElement>('.experience-step-content')
    if (!content) return
    content.style.opacity = reduced ? '' : '0'
    // Element Plus measures a newly activated table on the next frame. Let
    // that single layout settle before revealing it, instead of resizing it.
    await frame()
    await frame()
    if (disposed || current !== generation) return
    content.style.opacity = ''
    if (!reduced) {
      animation = content.animate([
        { opacity: 0, transform: `translateY(${direction * 6}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' })
    }
    const deepInPage = changing && rect.top < -80
    if (deepInPage) window.scrollTo({ top: scrollY + rect.top - 24, behavior: reduced ? 'instant' : 'smooth' })
    // Only release unused space; retain the visible working area for short
    // empty states. No repeated height writes or per-frame table reflows.
    releaseTimer = setTimeout(() => {
      if (disposed || current !== generation) return
      surface.style.minHeight = `${Math.max(0, innerHeight - surface.getBoundingClientRect().top)}px`
    }, deepInPage && !reduced ? 600 : reduced ? 0 : 250)
  }
  watch(step, (next, previous) => { void reveal(next >= previous ? 1 : -1, true) }, { flush: 'pre' })
  onMounted(() => { if (animateOnMount) void reveal() })
  onBeforeUnmount(() => { disposed = true; generation++; animation?.cancel(); clearTimeout(releaseTimer) })
}

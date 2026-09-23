import { animate, stagger } from 'motion'
import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

/** One interruptible motion system for six steps. It never delays navigation. */
export function useExperienceMotion(root: Ref<HTMLElement | undefined>, step: Ref<number>) {
  const animations: ReturnType<typeof animate>[] = []
  let generation = 0
  let disposed = false
  let contentObserver: ResizeObserver | undefined
  const stop = () => { contentObserver?.disconnect(); animations.splice(0).forEach(animation => animation.cancel()) }
  async function reveal(direction = 1, preserveHeight = false) {
    const current = ++generation
    const surface = root.value
    const fromHeight = surface?.getBoundingClientRect().height ?? 0
    // A short empty/result state still fills the visible working area. This
    // prevents browser scroll clamping from dragging the navigation upward.
    const viewportFloor = surface ? Math.max(0, window.innerHeight - Math.max(24, surface.getBoundingClientRect().top)) : 0
    stop()
    // KeepAlive can briefly remove its old subtree before the next is mounted.
    // Reserve that space before Vue patches, so the browser cannot clamp scrollY.
    if (surface && preserveHeight) surface.style.height = `${fromHeight}px`
    await nextTick()
    if (disposed || current !== generation || !surface) return
    const content = surface.querySelector<HTMLElement>('.experience-step-content')
    if (!content) { surface.style.height = ''; return }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { surface.style.height = ''; surface.style.minHeight = `${viewportFloor}px`; surface.style.overflow = ''; return }
    if (preserveHeight) {
      const toHeight = Math.max(viewportFloor, content.offsetHeight)
      // Tables/charts can finish their first layout after nextTick. Never
      // animate below their actual content height while they are settling.
      surface.style.minHeight = `${toHeight}px`
      contentObserver = new ResizeObserver(() => { surface.style.minHeight = `${Math.max(viewportFloor, content.offsetHeight)}px` })
      contentObserver.observe(content)
      surface.style.overflow = 'clip'
      const resize = animate(surface, { height: [`${fromHeight}px`, `${toHeight}px`] }, { duration: .34, ease: [.22, 1, .36, 1] })
      animations.push(resize)
      void resize.then(() => {
        if (disposed || current !== generation) return
        contentObserver?.disconnect()
        surface.style.height = ''
        surface.style.minHeight = `${viewportFloor}px`
        surface.style.overflow = ''
      })
    }
    animations.push(animate(content, { opacity: [0, 1], x: [direction * 10, 0] }, {
      duration: .28, ease: [.22, 1, .36, 1],
    }))
    // Animate card contents so filter transitions retain ownership of the outer card.
    const cards = Array.from(content.querySelectorAll<HTMLElement>('.resource-card-head, .operator-main')).slice(0, 8)
    if (cards.length) animations.push(animate(cards, { opacity: [0.4, 1], y: [8, 0] }, {
      duration: 0.3, delay: stagger(0.035), ease: [0.22, 1, 0.36, 1],
    }))
  }
  watch(step, (next, previous) => { void reveal(next >= previous ? 1 : -1, true) }, { flush: 'pre' })
  onMounted(() => { void reveal() })
  onBeforeUnmount(() => { disposed = true; generation++; stop() })
}

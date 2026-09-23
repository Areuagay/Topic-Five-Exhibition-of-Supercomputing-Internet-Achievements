import { animate, stagger } from 'motion'
import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

/** One interruptible motion system for six steps. It never delays navigation. */
export function useExperienceMotion(root: Ref<HTMLElement | undefined>, step: Ref<number>) {
  const animations: ReturnType<typeof animate>[] = []
  let generation = 0
  let disposed = false
  const stop = () => { animations.splice(0).forEach(animation => animation.cancel()) }
  async function reveal(direction = 1) {
    const current = ++generation
    stop()
    await nextTick()
    if (disposed || current !== generation || !root.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const surface = root.value
    animations.push(animate(surface, { opacity: [0.4, 1], x: [direction * 14, 0] }, {
      type: 'spring', duration: 0.42, bounce: 0,
    }))
    // Animate card contents so filter transitions retain ownership of the outer card.
    const cards = Array.from(surface.querySelectorAll<HTMLElement>('.resource-card-head, .operator-main')).slice(0, 8)
    if (cards.length) animations.push(animate(cards, { opacity: [0.4, 1], y: [8, 0] }, {
      duration: 0.3, delay: stagger(0.035), ease: [0.22, 1, 0.36, 1],
    }))
  }
  watch(step, (next, previous) => { void reveal(next >= previous ? 1 : -1) })
  onMounted(() => { void reveal() })
  onBeforeUnmount(() => { disposed = true; generation++; stop() })
}

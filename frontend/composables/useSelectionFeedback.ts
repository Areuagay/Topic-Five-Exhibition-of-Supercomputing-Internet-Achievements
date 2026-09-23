import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

/** Animate only changed selections; repeated clicks cancel the previous feedback. */
export function useSelectionFeedback(root: Ref<HTMLElement | undefined>, selected: Ref<string[]>) {
  const running = new Map<HTMLElement, Animation>()
  let version = 0
  let disposed = false
  watch(selected, async (next, previous) => {
    const current = ++version
    const before = new Set(previous)
    const after = new Set(next)
    await nextTick()
    if (disposed || current !== version || !root.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let index = 0
    root.value.querySelectorAll<HTMLElement>('[data-selection-id]').forEach(card => {
      const id = card.dataset.selectionId ?? ''
      if (before.has(id) === after.has(id)) return
      running.get(card)?.cancel()
      // Independent CSS scale leaves Vue's filter/move transform free to animate.
      const animation = card.animate({ scale: after.has(id) ? ['0.992', '1'] : ['1.004', '1'] }, {
        duration: 380, easing: 'cubic-bezier(.22, 1, .36, 1)', delay: index++ * 35,
      })
      running.set(card, animation)
      void animation.finished.catch(() => {}).then(() => { if (running.get(card) === animation) running.delete(card) })
    })
  })
  onBeforeUnmount(() => { disposed = true; version++; running.forEach(animation => animation.cancel()); running.clear() })
}

import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/** Follow the active control, including when the row wraps on narrow screens. */
export function useSlidingHighlight(activeIndex: Ref<number>) {
  const track = ref<HTMLElement>()
  const ready = ref(false)
  const style = ref({ width: '0px', height: '0px', transform: 'translate(0px, 0px)' })
  let observer: ResizeObserver | undefined
  let frame = 0
  let disposed = false
  function update(): void {
    const item = track.value?.querySelectorAll<HTMLElement>('[data-highlight-item]')[activeIndex.value]
    if (!item) return
    style.value = { width: `${item.offsetWidth}px`, height: `${item.offsetHeight}px`, transform: `translate(${item.offsetLeft}px, ${item.offsetTop}px)` }
  }
  watch(activeIndex, update, { flush: 'post' })
  onMounted(async () => {
    await nextTick()
    if (disposed) return
    update()
    frame = requestAnimationFrame(() => { ready.value = true })
    observer = new ResizeObserver(update)
    if (track.value) {
      observer.observe(track.value)
      track.value.querySelectorAll<HTMLElement>('[data-highlight-item]').forEach(item => observer?.observe(item))
    }
  })
  onBeforeUnmount(() => { disposed = true; observer?.disconnect(); cancelAnimationFrame(frame) })
  return { track, ready, style }
}

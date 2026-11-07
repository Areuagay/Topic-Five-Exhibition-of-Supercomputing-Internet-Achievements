export function positionDagPopover(frame: { width:number; height:number }, node: { left:number; right:number; top:number; bottom:number }, width:number, height:number) {
  const edge = 12, gap = 12
  const visibleLeft = Math.max(0,node.left), visibleRight = Math.min(frame.width,node.right)
  if (visibleLeft >= visibleRight || node.bottom <= 0 || node.top >= frame.height) return null
  const anchor = (visibleLeft+visibleRight)/2
  const panelLeft = Math.max(edge,Math.min(frame.width-width-edge,anchor-width/2))
  const arrow = anchor-panelLeft
  if (arrow < 12 || arrow > width-12) return null
  const above = node.top-gap-height >= edge
  const below = node.bottom+gap+height <= frame.height-edge
  if (!above && !below) {
    if (height > frame.height - edge * 2) return null
    // Keep details accessible when zooming leaves no vertical clearance.
    // Prefer beside the node; narrow canvases use an inset overlay.
    const left = node.right + gap + width <= frame.width - edge ? node.right + gap + width / 2
      : node.left - gap - width >= edge ? node.left - gap - width / 2 : panelLeft + width / 2
    return { left, top:Math.max(edge, Math.min(frame.height - height - edge, (node.top + node.bottom - height) / 2)), placement:'floating' as const, arrow }
  }
  return { left:panelLeft+width/2, top:above ? node.top-gap : node.bottom+gap, placement:above ? 'top' as const : 'bottom' as const, arrow }
}

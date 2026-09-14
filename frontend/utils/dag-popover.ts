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
  if (!above && !below) return null
  return { left:panelLeft+width/2, top:above ? node.top-gap : node.bottom+gap, placement:above ? 'top' as const : 'bottom' as const, arrow }
}

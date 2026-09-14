import type { EChartsCoreOption } from 'echarts/core'
import { quantityLabel } from './workspace'
export const drugChartStyle = {
  animation: true, animationDuration: 500, animationDurationUpdate: 180,
  color: ['#1769d2', '#4d8b78', '#b57820', '#8f7aac', '#c36d59'],
  textStyle: { fontFamily: '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif', fontSize: 13, fontWeight: 500 },
}
export function distributionChart(bins: { min: number; max: number; count: number }[] | undefined, label: string, unit?: string): EChartsCoreOption {
  return {
    ...drugChartStyle, tooltip: { trigger: 'axis', confine: true }, grid: { left: 64, right: 24, top: 32, bottom: 66 },
    xAxis: { type: 'category', name: quantityLabel(label, unit), nameLocation: 'middle', nameGap: 38, axisLabel: {
      rotate: 0, margin: 12, hideOverlap: true, interval: Math.max(0, Math.ceil((bins?.length ?? 0) / 6) - 1),
      formatter: (_value: string, index: number) => { const bin = bins?.[index]; return bin ? String(Number(((bin.min + bin.max) / 2).toPrecision(4))) : '' },
    }, data: bins?.map(b => `${b.min}～${b.max}`) ?? [] },
    yAxis: { type: 'value', name: '数量', minInterval: 1, splitLine: { lineStyle: { color: '#edf1f5' } } },
    series: [{ type: 'bar', name: '数量', barMaxWidth: 42, data: bins?.map(b => b.count) ?? [] }],
  }
}

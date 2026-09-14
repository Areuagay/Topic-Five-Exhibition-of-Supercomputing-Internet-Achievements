import type { EChartsCoreOption } from 'echarts/core'
import { quantityLabel, waveSeries } from './workspace'

export function scientificLines(rows: Record<string, unknown>[] | undefined, xKey: string, xLabel: string, series: { key: string; label: string }[], units?: Record<string, string | undefined>): EChartsCoreOption {
  return {
    animation: true,
    animationDuration: 500,
    animationDurationUpdate: 180,
    color: ['#1769d2', '#b57820', '#4d8b78'],
    textStyle: { fontFamily: '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif', fontSize: 13, fontWeight: 500 },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, textStyle: { color: '#606266' } },
    grid: { left: 76, right: 24, top: 38, bottom: 66 },
    xAxis: { type: 'value', name: quantityLabel(xLabel, units?.[xKey]), nameLocation: 'middle', nameGap: 28 },
    yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#edf1f5' } } },
    series: series.map(item => ({ name: quantityLabel(item.label, units?.[item.key]), type: 'line', smooth: false, showSymbol: false, connectNulls: false, lineStyle: { width: 2 }, data: waveSeries(rows, xKey, item.key) })),
  }
}

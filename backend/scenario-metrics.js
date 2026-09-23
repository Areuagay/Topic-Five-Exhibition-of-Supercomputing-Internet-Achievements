/** Scientific metric cards and charts share the same simulated sample values. */
export function scenarioMetrics(scenarioId, data, progress) {
  if (!data) return null
  const fraction = Math.max(0, Math.min(1, progress / 100))
  const sample = series => series?.[Math.min(series.length - 1, Math.floor((series.length - 1) * fraction))] ?? {}
  const metric = (name, label, value, unit = '') => ({ name, label, value: Number(value) || 0, unit })
  if (scenarioId === 'pinn-acceleration') {
    const point = sample(data.pinn_training_series)
    const error = sample(data.prediction_error_series)
    return [metric('epoch', '训练轮次', point.epoch, 'epoch'), metric('physics_loss', '物理约束损失', point.physics_loss), metric('data_loss', '数据拟合损失', point.data_loss), metric('l2_error', 'L2预测误差', error.l2_error)]
  }
  if (scenarioId === 'fatigue-life') {
    const point = sample(data.damage_series)
    const locations = data.critical_locations ?? []
    return [metric('cycles', '载荷循环次数', point.cycle, '次'), metric('damage_ratio', '累积损伤', point.damage_ratio), metric('critical_locations', '关键位置数', locations.length, '处'), metric('min_life', '最短预测寿命', Math.min(...locations.map(l => l.predicted_life)), '次')]
  }
  if (scenarioId === 'path-planning') {
    const point = sample(data.cost_series)
    return [metric('iteration', '搜索迭代', point.iteration, '次'), metric('best_cost', '最优路径代价', point.best_cost), metric('average_cost', '平均路径代价', point.average_cost), metric('obstacles', '环境障碍物', data.environment?.obstacles?.length, '个')]
  }
  if (scenarioId === 'admet-prediction') {
    const summary = data.admet_summary ?? {}
    const completed = Math.round((summary.total ?? 0) * fraction)
    const passed = Math.round((summary.passed ?? 0) * fraction)
    return [metric('completed_compounds', '已评估分子', completed, '个'), metric('passed_compounds', '通过筛选', passed, '个'), metric('risk_compounds', '未通过筛选', completed - passed, '个'), metric('total_compounds', '候选分子总数', summary.total, '个')]
  }
  if (scenarioId === 'high-throughput-screening') {
    const summary = data.batch_summary ?? {}
    return [metric('completed_materials', '已计算材料', Math.round((summary.completed ?? 0) * fraction), '个'), metric('converged_materials', '已收敛材料', Math.round((summary.converged ?? 0) * fraction), '个'), metric('failed_materials', '未收敛材料', Math.round((summary.failed ?? 0) * fraction), '个'), metric('qualified_materials', '合格候选材料', Math.round((summary.qualified ?? 0) * fraction), '个')]
  }
  return null
}

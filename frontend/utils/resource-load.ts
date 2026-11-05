/**
 * 数据上传对适配中心负载的模拟增幅。
 *
 * 演示口径：每上传一份数据，适配本场景的算力中心 CPU / GPU 利用率在平台基线值上
 * 增长 0.4%（相对值，单次不超过 0.5 个百分点）；最多累计 5 份，避免数值增长过大。
 * 结果保留两位小数，与资源调度面板 0.01% 的展示精度一致。
 */
export const DATASET_LOAD_GAIN_PER_UPLOAD = 0.004
export const DATASET_LOAD_MAX_UPLOADS = 5

/** 已上传数据份数对应的相对增幅（0.004 = 0.4%）。 */
export function datasetLoadGain(uploadedCount: number): number {
  if (!Number.isFinite(uploadedCount)) return 0
  const count = Math.max(0, Math.min(DATASET_LOAD_MAX_UPLOADS, Math.floor(uploadedCount)))
  return count * DATASET_LOAD_GAIN_PER_UPLOAD
}

/** 按已上传数据份数放大基线利用率，返回保留两位小数的百分比数值。 */
export function applyDatasetLoad(baseUtilization: number, uploadedCount: number): number {
  const base = Number.isFinite(baseUtilization) ? Math.max(0, Math.min(100, baseUtilization)) : 0
  const value = base * (1 + datasetLoadGain(uploadedCount))
  return Math.min(100, Math.round(value * 100) / 100)
}

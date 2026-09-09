# 模拟专业域数据（Simulated Domain Data）

> **重要声明**：本目录与相关 mock 数据全部为 **simulated / synthetic demo data**，仅用于课题五成果展示平台的前端专业可视化联调与演示。  
> **不得**将其解释为真实超算计算结果、真实科研实验结果、真实四中心运行数据或第三方测评数据。

## 1. 覆盖的 12 个场景

| 领域 | 场景 ID（仓库实际） | 代表 run_id | 说明 |
|------|---------------------|-------------|------|
| geodynamics | `wave-propagation` | GEO-20260811-0001 | 波场 / residual / seismogram |
| geodynamics | `tectonic-evolution`（别名 plate-tectonics） | GEO-20260811-0010 | 温度场 / 速度场 / 非线性残差 |
| llm | `llm-pretraining` | LLM-20260811-0001 | Loss / LR / GPU / checkpoint |
| llm | `pinn-acceleration` | LLM-20260811-0010 | PINN loss / residual field |
| automotive | `vehicle-crash` | AUTO-20260811-0001 | 能量 / 加速度 / 侵入 |
| automotive | `fatigue-life` | AUTO-20260811-0010 | 损伤 / S-N / 热点图 |
| uav | `swarm-coordination` | UAV-20260811-0001 | 代表轨迹采样（非全量 1000 机） |
| uav | `path-planning` | UAV-20260811-0010 | 环境 / A* 路径 / cost |
| drug | `virtual-screening` | DRUG-20260811-0001 | funnel / score / top candidates |
| drug | `admet-prediction` | DRUG-20260811-0010 | ADMET 属性与筛选规则 |
| dft | `band-dos` | DFT-20260811-0001 | SCF / band / DOS / 结构 |
| dft | `high-throughput-screening` | DFT-20260811-0010 | 材料批次 / 四中心分配 |

## 2. 数据落点（向后兼容）

保留原有公共结构：`workflow` / `metrics` / `logs` / `artifacts`。

新增专业数据统一写入：

- `data.domain_data`（完整 run-detail）
- `data.metrics.domain_data`（保证 `GET .../metrics` 也能取到）

所有新增对象带有：

- `source_type: "simulated"`
- `execution_mode: "simulated"`（继承自 run）

旧字段（如 `metrics.metrics`、`energy_series`、`gpu_metrics`、`cluster_progress` 等）保持可读，前端旧页面不报错。

## 3. 如何重新生成

依赖：Python 3 + `numpy` / `pandas` / `matplotlib` / `Pillow`

```bash
python scripts/generate_all_domain_data.py
python scripts/validate_simulated_data.py
python scripts/check_artifacts.py
python scripts/smoke_api.py
```

单场景：

```bash
python scripts/generate_all_domain_data.py --only wave-propagation
```

## 4. 固定 seed 机制

```text
seed = int(sha256(run_id)[:8], 16)
```

可用 `--seed` 覆盖。同一 `run_id` 多次生成结果可复现。

## 5. Artifact 目录

```text
artifacts/simulated/{domain}/{scenario_id}/{run_id}/...
artifacts/simulated/artifact_index.json
```

PNG 图均带 `SIMULATED` / `Simulated Compound` 角标。

## 6. 后端如何提供

现有 API 不变：

- `GET /api/v1/{domain}/runs/{run_id}`
- `GET /api/v1/{domain}/runs/{run_id}/metrics`
- `GET /api/v1/{domain}/runs/{run_id}/artifacts`

新增文件接口（不改学科 API）：

- `GET /api/v1/files/{artifact_id}/preview`
- `GET /api/v1/files/{artifact_id}/download`

文件读取受限于 `artifacts/`，拒绝 `..` 路径穿越；映射来自 `artifact_index.json`。

## 7. 前端应使用的字段

优先读取 `detail.domain_data` 或 `metrics.domain_data` 中各场景字段，例如：

- wave: `residual_series`, `seismogram_series`, `wavefield_frames`, `domain_partitions`
- crash: `energy_series`, `acceleration_series`, `intrusion_series`, `critical_results`
- swarm: `trajectory_samples`, `formation_series`, `collision_events`
- path: `environment`, `best_path`, `cost_series`
- drug screen: `screening_funnel`, `score_distribution`, `top_candidates`
- band/dos: `scf_series`, `band_structure`, `dos_series`, `structure`

产物预览使用 artifacts 中的 `preview_url` / `download_url`。

## 8. 验证命令

```bash
python scripts/validate_simulated_data.py   # -> validation_report.json, PASS/FAIL
python scripts/check_artifacts.py           # -> artifact_check_report.json
python scripts/smoke_api.py                 # API 契约冒烟（无需 Node）
```

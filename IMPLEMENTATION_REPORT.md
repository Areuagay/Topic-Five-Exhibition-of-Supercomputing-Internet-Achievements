# IMPLEMENTATION_REPORT — 12 场景模拟专业数据扩充

## 1. 新增文件

- `scripts/generate_domain_data/common.py`
- `scripts/generate_domain_data/geo_wave.py`
- `scripts/generate_domain_data/geo_plate.py`
- `scripts/generate_domain_data/llm_pretrain.py`
- `scripts/generate_domain_data/pinn.py`
- `scripts/generate_domain_data/vehicle_crash.py`
- `scripts/generate_domain_data/fatigue.py`
- `scripts/generate_domain_data/uav_swarm.py`
- `scripts/generate_domain_data/uav_path.py`
- `scripts/generate_domain_data/drug_screen.py`
- `scripts/generate_domain_data/admet.py`
- `scripts/generate_domain_data/dft_band_dos.py`
- `scripts/generate_domain_data/dft_high_throughput.py`
- `scripts/generate_all_domain_data.py`
- `scripts/validate_simulated_data.py`
- `scripts/check_artifacts.py`
- `scripts/smoke_api.py`
- `artifacts/simulated/**`（PNG/CSV/JSON + `artifact_index.json`）
- `docs/SIMULATED_DOMAIN_DATA.md`
- `validation_report.json` / `artifact_check_report.json` / `smoke_api_report.json`

## 2. 修改文件

- `backend/server.js`：新增 `GET /api/v1/files/{id}/preview|download`（限 `artifacts/`，防穿越）
- 12 个已有 `mock-data/*/run-details/*.json`：追加 `domain_data`、增强部分 `metrics` 序列、追加本地可服务 artifacts（未删除旧字段）

## 3. 仓库扫描结论（A–E 摘要）

**A. 目录**：`mock-data/{domain}/` 含 scenarios / runs / run-details 等；每域仅 2 个有详情的代表 run（0001 / 0010）。

**B. Schema**：run-detail 为 `{code,message,data,timestamp}`；`data.metrics` 为对象（含 `progress` + `metrics[]` + 可选专业序列）；`artifacts[]` 使用 `/api/v1/files/{id}/preview|download`。

**C. 后端映射**：`server.js` 将 `/runs/{id}/metrics|artifacts|...` 提取为 `data` 子字段；原先无真实文件服务。

**D. 冲突**：板块场景仓库 ID 为 `tectonic-evolution`（非 prompt 中的 `plate-tectonics`）——已按现网 ID 适配并写 `scenario_alias`。`energy_series` 旧键名 `kinetic/internal/hourglass` 保留，同时在 `domain_data` 提供 `*_energy` 键。

**E. 策略**：最小侵入追加 `domain_data`；专业数据同步进 `/metrics`；不新增 12 套 API。

## 4. 各场景生成内容与数据量

| 场景 | 主要内容 | 量级（约） | 本地 artifact |
|------|----------|------------|---------------|
| wave-propagation | residual / seismogram / wavefield / partitions | 40 / 160 / 10 帧 / 8 分区 | 12 |
| tectonic-evolution | T/V 序列 + nonlinear + 场图 | 48 / 48 / 35 + 8×2 PNG | 17 |
| llm-pretraining | training / gpu / parallel / ckpt | 80 / 12 GPU / 5 ckpt | 2 |
| pinn-acceleration | pinn series / error / residual 36×36 | 70 epochs | 3 |
| vehicle-crash | energy / accel / intrusion | 120 / 160 / 120 | 4 |
| fatigue-life | damage / SN / locations + map | 70 / 15 / 8 | 2 |
| swarm-coordination | 40 机代表轨迹 + formation | 70 pts × 40 | 2 |
| path-planning | env + A* path + cost | 100×100 / ~40 cost | 3 |
| virtual-screening | funnel + bins + top16 分子图 | funnel 百万级计数（不落明细） | 17 |
| admet-prediction | 36 candidates + risk/dist | 36 | 2 |
| band-dos | scf20 / 12 bands×80k / dos160 | — | 3 |
| high-throughput | 200 materials + ranking | 200 / top20 | 2 |

总计：`artifact_index` 登记 **69** 条；`artifacts/simulated` 约 **76** 文件 / **~2.0 MB**。

## 5. API 是否修改

- 学科 URL：**未改**
- **新增**：文件 preview/download（已有 URL 约定落地）
- `/metrics` 现可返回 `domain_data`

## 6. Validation / Artifact / Smoke 结果

- `validate_simulated_data.py` → **PASS**（`validation_report.json`）
- `check_artifacts.py` → **PASS**（`artifact_check_report.json`）
- `smoke_api.py` → **PASS**（12 run × {detail,metrics,artifacts} = 36；含文件预览与穿越拒绝）

说明：本机未安装 Node.js，故用 `scripts/smoke_api.py` 按 `server.js` 同等路由契约做冒烟；`backend/server.js` 已实现相同文件接口，安装 Node 后可直接 `node backend/server.js` 验证。

## 7. 尚未解决 / 已知限制

- 仓库存在嵌套副本目录（`mock-data/mock-data`、`backend/backend`），本次未清理，以免误删。
- `GEO-20260811-0009` 在 `runs.json` 标 `has_detail=true` 但无详情文件——沿用原状，未扩 run。
- 旧 artifacts 中仍有 `gfs://` 占位条目（无本地文件）；新增本地条目并存，checker 对 `gfs://` 跳过存在性。
- 未生成 crash.gif/mp4（成本与体积权衡；已有 3 张 stress PNG）。

## 8. 后续前端专业工作台可直接使用的字段

统一入口：`data.domain_data` 或 `metrics.domain_data`。

- Geo wave: `residual_series`, `seismogram_series`, `wavefield_frames[].preview_url`, `domain_partitions`
- Geo plate: `temperature_series`, `velocity_series`, `nonlinear_series`, `field_frames`
- LLM: `training_series`, `gpu_metrics`, `parallel_config`, `checkpoint_events`
- PINN: `pinn_training_series`, `prediction_error_series`, `residual_field`, `sampling_statistics`
- Crash: `energy_series`, `acceleration_series`, `intrusion_series`, `critical_results`
- Fatigue: `damage_series`, `sn_curve`, `critical_locations`
- Swarm: `trajectory_samples`, `formation_series`, `collision_events`, `mission_targets`
- Path: `environment`, `best_path`, `cost_series`, `path_preview`
- Drug screen: `screening_funnel`, `score_distribution`, `top_candidates`
- ADMET: `admet_summary`, `candidate_properties`, `risk_distribution`, `property_distribution`
- Band/DOS: `scf_series`, `band_structure`, `dos_series`, `structure`
- HT: `batch_summary`, `materials`, `candidate_ranking`, `cluster_distribution`

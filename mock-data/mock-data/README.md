# mock-data — 课题五前端模拟数据

本目录存放「超算互联网资源共享平台 — 课题五」前端联调所需的**模拟数据**（100 条记录），严格遵循
[`docs/api/`](../docs/api/) 目录下 7 份 OpenAPI 3.0.1 接口契约（唯一事实来源）。

> ⚠️ **重要声明**：本目录所有数据均为 `simulated`（本地模拟数据），仅用于界面联调与流程演示，
> **不得**作为真实超算验收、跨中心验收的实测证据。所有记录均显式携带 `source_type: "simulated"` 标记。

## 数据总览（100 条记录）

| 领域 | 目录 | 场景 | 任务记录数 | 运行 ID 前缀 |
| --- | --- | --- | --- | --- |
| 地球动力学 | `geodynamics/` | 地震波传播模拟 / 板块构造数值模拟 | 14 | `GEO-` |
| AI 大模型训练 | `llm/` | 大语言模型分布式预训练 / PINN 科学计算加速 | 14 | `LLM-` |
| 汽车结构仿真 | `automotive/` | 整车碰撞仿真 / 结构疲劳寿命预测 | 14 | `AUTO-` |
| 大规模无人机协同仿真 | `uav/` | 千架无人机集群协同控制 / 航迹规划与避障 | 14 | `UAV-` |
| 跨中心虚拟药物筛选 | `drug/` | 百万级化合物库虚拟筛选 / ADMET 性质预测 | 14 | `DRUG-` |
| 第一性原理材料计算 | `dft/` | 能带结构与态密度 / 高通量材料筛选 | 14 | `DFT-` |
| 函数多中心联调 | `multicenter/` | 四中心资源 / 部署矩阵 / 调用链路 / 扩缩容与迁移 | 16（调用 12 + 迁移 4） | `INV-` / `MIG-` |

合计 **100 条**任务记录。

## 目录结构

```
mock-data/
├── README.md               # 本说明
├── index.json              # 全局索引：领域元信息、记录统计（首页读取）
├── geodynamics/            # 地球动力学（GEO）
│   ├── scenarios.json      # GET /api/v1/geodynamics/scenarios
│   ├── scenario-details.json
│   ├── params-schema.json  # GET .../params-schema
│   ├── benchmark.json      # GET .../benchmark
│   ├── operators.json      # 关联算子注册列表
│   ├── runs.json           # 14 条运行任务记录
│   └── run-details/        # 精选任务完整详情（workflow/metrics/logs/artifacts）
├── llm/                    # AI 大模型训练（LLM）—— 结构同上
├── automotive/             # 汽车结构仿真（AUTO）—— 结构同上
├── uav/                    # 无人机协同仿真（UAV）—— 结构同上
├── drug/                   # 药物筛选（DRUG）—— 结构同上
├── dft/                    # 材料计算（DFT）—— 结构同上
└── multicenter/            # 函数多中心联调
    ├── clusters.json       # GET /api/v1/multicenter/clusters
    ├── topology.json       # GET /api/v1/multicenter/topology
    ├── functions.json      # GET /api/v1/multicenter/functions
    ├── deployment-matrix.json
    ├── workloads.json      # GET /api/v1/multicenter/workloads
    ├── invocations.json    # 12 条跨中心函数调用记录
    ├── migrations.json     # 4 条跨中心迁移记录
    └── details/            # 调用详情 / 调用链路 trace / 迁移详情
```

## 统一响应结构

每个场景/接口数据文件均按平台统一响应结构包装（`data` 为业务数据）：

```json
{
  "code": 200,
  "message": "success",
  "data": { },
  "timestamp": "2026-08-11T11:00:00+08:00"
}
```

`runs.json` / `invocations.json` / `migrations.json` 中的 `data` 为记录数组，可直接供前端列表渲染。

## 前端联调说明

前端 `frontend/js/api/` 通过 `fetch` 读取本目录 JSON 文件（模拟真实 HTTP 响应，延迟约 120~400ms）。
由于浏览器 `file://` 协议禁止跨目录读取，**必须通过 HTTP 静态服务访问**，详见 [`frontend/README.md`](../frontend/README.md)。

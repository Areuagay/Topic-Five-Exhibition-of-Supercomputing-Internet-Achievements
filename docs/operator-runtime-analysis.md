# 应用示范六领域算子运行环境分析

数据来源：超算平台算子库 <http://192.168.95.138:8890/operator> 的本地快照
`mock-data/operator-library/backend-operators.json`（87 个算子，2026-07-30 抓取），
经 `scripts/sync-operator-library.mjs` 按应用示范分配表生成六个领域的 `operators.json`。

## 判定规则

平台函数注册示例里同时存在 `runtimeType` 和 `runtime` 两个字段：

- `runtimeType` 是平台的部署 / 调用方式：`singularity`、`docker`、`docker-run`、`instance`；
- `runtime` 才是实际镜像：`.sif` 结尾为 Singularity 镜像，`hub.cngrid.org:5000/...:tag`
  或 `local/...:tag` 为 Docker 镜像。

因此运行环境按 `runtime` 判定，`runtimeType=instance` 仅作为部署方式显示为「平台实例」，
不再把所有算子统一写成 Singularity。资源字段优先取注册示例，缺失时用调用示例补全；
CPU 至少按单核调用计，内存未声明时显示「按需」。

## 六个领域的真实分布

| 领域 | 算子数 | Singularity | Docker | 平台实例部署 | 结论 |
| --- | ---: | ---: | ---: | ---: | --- |
| 地球动力学 | 4 | 4 | 0 | 2（supg、uzawa） | 不全相同；2 个为平台实例 |
| AI 模型训练 | 9 | 0 | 9 | 0 | 全部 Docker |
| 汽车设计 | 14 | 12 | 2（ipfno、transolver） | 0 | Singularity + Docker |
| 仿真计算 | 13 | 13 | 0 | 0 | 全部 Singularity |
| 药物设计 | 9 | 8 | 1（ligand-preparation） | 0 | Singularity + Docker |
| 材料计算 | 14 | 14 | 0 | 0 | 全部 Singularity |

合计 63 个领域算子：Singularity 51 个、Docker 12 个。**并非六个领域都是 Singularity。**

典型证据：

- `supg` / `uzawa`：`runtimeType=instance`，但 `runtime=/public/home/wxn/image/scnet/common/supg.sif`，
  实际运行环境是 Singularity，只是以平台实例方式部署。
- `ipfno` / `transolver`：`runtimeType=docker-run`，
  `runtime=hub.cngrid.org:5000/scnet/cars/...:tag`，实际运行环境是 Docker。
- AI 模型训练 9 个算子：`runtime=local/ai-operator/...:20260629`，全部 Docker。
- 药物设计 `ligand-preparation`：`runtime=hub.cngrid.org:5000/scnet/bio/meeko:cpu20250813`，Docker。

## 界面改动

1. 算子卡片「运行环境」直接显示 `runtime_label`，平台实例在下方以小字标注「平台实例」。
2. 算子选择工具栏新增「运行环境」筛选，可按 Singularity / Docker 查看。
3. 工作流 DAG 节点和「运行详情」浮层显示每个算子真实的运行环境与部署方式。
4. 运行记录详情新增「本条任务算子」条，列出当前算子及其运行环境、CPU / GPU。

## 复现

```powershell
node scripts/sync-operator-library.mjs --offline
node scripts/migrate-run-operators.mjs
```

`sync-operator-library.mjs` 只重新生成算子卡片与场景推荐；`migrate-run-operators.mjs`
负责把历史运行记录的工作流算子替换为当前算子，并补齐节点资源与时间字段。

# 课题五 API 接口规范（OpenAPI）

本目录保存课题五「超算互联网应用成果展」前后端联调的标准 OpenAPI 接口文档，是前后端联调、Apifox 导入调试及模拟数据验证的唯一事实来源（Single Source of Truth）。

所有文档均为 **OpenAPI 3.0.1** 规范，采用 Apifox 导入兼容格式：包含中文接口名称、接口说明、请求/响应示例、字段中文名（`title`）、字段说明（`description`）以及 Mock 规则（`x-apifox-mock`）。

## 文档清单

| 文件 | 接口标题 | 接口数 | 版本 | 路径前缀 | 覆盖场景 |
| --- | --- | --- | --- | --- | --- |
| [Topic5-GeoDynamics.openapi.json](Topic5-GeoDynamics.openapi.json) | 课题五-地球动力学模拟接口 | 19 | 1.4.0 | `/api/v1/geodynamics` | 地球动力学数值模拟（含一键体验数据准备数据集接口） |
| [Topic5-AI-LLM-Training.openapi.json](Topic5-AI-LLM-Training.openapi.json) | 课题五-AI 大模型训练接口 | 19 | 1.4.0 | `/api/v1/llm` | 大语言模型分布式预训练、PINN 科学计算 AI 加速（含一键体验数据准备数据集接口） |
| [Topic5-AutoStruct-Sim.openapi.json](Topic5-AutoStruct-Sim.openapi.json) | 课题五-汽车结构仿真接口 | 19 | 1.4.0 | `/api/v1/automotive` | 整车碰撞仿真、结构疲劳寿命预测（含一键体验数据准备数据集接口） |
| [Topic5-UAV-CoSim.openapi.json](Topic5-UAV-CoSim.openapi.json) | 课题五-大规模无人机协同仿真接口 | 19 | 1.4.0 | `/api/v1/uav` | 千架无人机集群协同控制、航迹规划与避障（含一键体验数据准备数据集接口） |
| [Topic5-CrossCenter-DrugScreen.openapi.json](Topic5-CrossCenter-DrugScreen.openapi.json) | 课题五-跨中心虚拟药物筛选接口 | 19 | 1.4.0 | `/api/v1/drug` | 百万级化合物库虚拟筛选、药物分子 ADMET 性质预测（含一键体验数据准备数据集接口） |
| [Topic5-DFT-MaterialCalc.openapi.json](Topic5-DFT-MaterialCalc.openapi.json) | 课题五-第一性原理材料计算接口 | 19 | 1.4.0 | `/api/v1/dft` | 材料能带结构与态密度计算、高通量材料筛选（含一键体验数据准备数据集接口） |
| [Topic5-MultiCenter-Debug.openapi.json](Topic5-MultiCenter-Debug.openapi.json) | 课题五-函数多中心联调接口 | 17 | 1.3.0 | `/api/v1/multicenter` | 四中心资源状态、函数部署矩阵、跨中心调用链路、工作负载扩缩容与迁移 |

## 学科仿真接口通用约定

除多中心联调文档外，其余六个学科文档均遵循同一套接口骨架，各学科仅替换业务字段与场景数据：

| 方法与路径 | 说明 |
| --- | --- |
| `GET  /{prefix}/scenarios` | 获取可仿真场景列表 |
| `GET  /{prefix}/datasets` | 获取本学科仿真输入数据集清单（一键体验「数据准备」步骤） |
| `GET  /{prefix}/scenario-details` | 批量获取全部场景详情（前端场景列表/详情一次拉取） |
| `GET  /{prefix}/params-schema` | 批量获取全部场景参数 Schema 映射（前端动态渲染表单） |
| `GET  /{prefix}/benchmark` | 批量获取全部场景基准（Benchmark）数据映射，用于对比展示 |
| `GET  /{prefix}/operators` | 获取算子（函数）列表 |
| `GET  /{prefix}/runs` | 获取任务运行列表（支持按 `scenario_id`、`status` 过滤） |
| `GET  /{prefix}/scenarios/{scenario_id}` | 获取单个场景详情 |
| `GET  /{prefix}/scenarios/{scenario_id}/params-schema` | 获取场景参数 Schema（前端动态渲染表单） |
| `GET  /{prefix}/scenarios/{scenario_id}/benchmark` | 获取场景基准（Benchmark）数据，用于对比展示 |
| `POST /{prefix}/scenarios/{scenario_id}/runs` | 提交一次仿真/训练任务 |
| `GET  /{prefix}/runs/{run_id}` | 查询任务状态与进度 |
| `POST /{prefix}/runs/{run_id}/stop` | 停止任务 |
| `GET  /{prefix}/runs/{run_id}/workflow` | 获取任务执行工作流（节点可视化） |
| `GET  /{prefix}/runs/{run_id}/metrics` | 获取任务运行指标（如 Loss、资源利用率曲线） |
| `GET  /{prefix}/runs/{run_id}/logs` | 获取任务运行日志 |
| `GET  /{prefix}/runs/{run_id}/artifacts` | 获取任务产出物（结果文件、图表等） |
| `POST /{prefix}/operators/register` | 注册科学计算算子 |
| `POST /{prefix}/operators/{name}/{version}/invoke` | 调用已注册算子 |

> **一键体验扩展**：六个学科文档（`/api/v1/geodynamics`、`/api/v1/llm`、`/api/v1/automotive`、`/api/v1/uav`、`/api/v1/drug`、`/api/v1/dft`）均提供 `GET /{prefix}/datasets`，返回本学科仿真输入数据集清单，用于「一键体验」流程的**数据准备**步骤展示。

## 平台通用端点（收录于多中心联调文档）

多中心联调文档除四中心资源、函数部署、调用链路、工作负载与迁移接口外，还收录了前端首页与结果文件相关的平台通用端点：

| 方法与路径 | 说明 |
| --- | --- |
| `GET  /api/v1/index` | 获取成果展首页总览数据（学科域、场景与四中心基础信息） |
| `GET  /api/v1/files/{artifact_id}/preview` | 预览运行结果文件（直接返回文件二进制流，内容类型随格式变化） |
| `GET  /api/v1/files/{artifact_id}/download` | 下载运行结果文件（响应头含 `Content-Disposition` 附件信息） |
| `GET  /api/v1/multicenter/deployment-matrix` | 获取函数部署矩阵（与 `/api/v1/multicenter/functions/deployment-matrix` 等价） |
| `GET  /api/v1/multicenter/invocations` | 获取函数调用记录列表 |
| `GET  /api/v1/multicenter/migrations` | 获取跨中心迁移记录列表 |

## 统一响应结构

所有接口均返回平台统一响应结构：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | integer | 业务状态码，成功固定为 `200` |
| `message` | string | 返回文字说明，成功为 `success` |
| `data` | object/array | 业务数据，随接口不同而变化 |
| `timestamp` | string | 服务端生成响应的 ISO 8601 时间 |

## 模拟数据标记约定

当前阶段联调使用模拟数据，**必须显式标记，不得冒充真实超算运行数据**：

- 学科仿真接口：通过 `source_type` 字段区分，取值 `real`（真实数据）或 `simulated`（本地模拟数据）。
- 多中心联调接口：通过 `source_type` 或 `execution_mode` 字段区分，取值 `real` / `simulated` / `replay`（历史回放）。
- 模拟数据仅用于界面联调与流程演示，**不得作为真实超算验收、跨中心验收的实测证据**。

## 使用原则

1. 前端按照本目录 OpenAPI 定义调用接口。
2. 后端按照本目录 OpenAPI 定义返回数据。
3. 不允许前端或后端单方面修改公共接口字段。
4. 如需调整接口，需先在 Apifox 中确认，再重新导出 OpenAPI 文件并提交 Git。
5. 当前模拟数据需标记为 `simulated`，不得作为真实超算运行数据使用。
6. 接口路径、字段命名（`snake_case`）、统一响应结构为公共契约，变更须同步更新文档与前后端代码。

## 接口变更流程

1. 在 Apifox 中修改接口定义并评审确认。
2. 从 Apifox 导出 OpenAPI 3.0.1 JSON 文件。
3. 覆盖本目录对应 `Topic5-*.openapi.json` 文件并更新版本号。
4. 同步更新上方文档清单表格（接口数、版本、覆盖场景）。
5. 提交 Git，并在提交说明中注明变更点。

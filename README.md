# Topic Five - Exhibition of Supercomputing Internet Achievements

课题五“跨中心大规模解算云原生与应用示范”工程展示平台。

## 当前阶段

当前版本用于本地开发、模拟数据联调和前端展示。

当前实现原则：

- 前端 Web 系统：真实运行
- REST API：真实运行
- 任务状态机：真实运行
- Workflow / Metrics / Logs / Artifacts：通过真实 API 获取
- 六大应用科学计算结果：当前采用模拟数据
- 四中心资源状态：同步超算平台首页「全局资源视图」（见下文）
- 各领域资源调度：同样展示这四个中心的资源内容；上传负载按中心记录在全局共享状态中，
  任一领域上传数据后所有领域读到同一份计数（每份 0.4%，单次 ≤0.5 个百分点，保留两位小数）
- 函数部署 / 调用追踪 / 负载迁移：由四中心资源状态推导，保证与平台数据自洽
- 后续真实后台接入时，通过 Adapter 替换 Simulation Engine

> 模拟数据不得作为真实超算运行或正式验收实测数据。

## 后端数据同步

“函数多中心联调”的四个算力中心资源状态取自超算平台首页「全局资源视图」的四张卡片
（超算名称、CPU、GPU、运行任务、排队等待、资源状态），脚本会把平台数据落成快照，
再据此重算拓扑、部署矩阵、工作负载、调用追踪与迁移记录：

```powershell
node scripts/sync-multicenter-backend.mjs
# 或在 frontend 目录
npm run sync:backend
# 默认读取 http://192.168.95.138:8890/ ，可用环境变量覆盖
$env:MULTICENTER_BACKEND_URL = 'http://192.168.95.138:8890/'
```

- 快照：`mock-data/multicenter/backend-snapshot.json`（含来源地址与抓取时间）
- 平台不可达时自动回退到该快照，脚本仍可重复执行
- 应用示范保留长沙 / 广州 / 昆山 / 济南地名作为卡片小字，超算名称与资源状态跟随平台
- 六大领域的运行记录、运行详情中的集群名称也随脚本同步，避免与资源调度显示不一致
- 平台暂未开放函数部署、调用与迁移接口，这三块按四中心运行任务 / 排队等待推导：
  每中心每 4 个运行任务折算 1 个就绪实例，调用条数等于运行任务数，迁移只发生在非维护中心之间

## Applications

1. 地球物理
2. AI模型训练
3. 汽车设计
4. 仿真计算
5. 药物设计
6. 材料计算
7. 函数多中心联调

## Architecture

Browser
  ↓
Frontend
  ↓ /api
FastAPI Backend
  ↓
Simulation Engine
  ↓
Mock Data / SQLite / Artifacts

## Repository

- `frontend/` 前端工程
- `backend/` 模拟后端工程
- `mock-data/` 十二个应用场景模拟数据
- `docs/api/` OpenAPI 接口基线
- `artifacts/` 示例结果文件
- `deploy/` 服务器部署配置

## API Specification

See `docs/api/`.
1
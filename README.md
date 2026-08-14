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
- 四中心资源和跨中心状态：当前采用模拟数据
- 后续真实后台接入时，通过 Adapter 替换 Simulation Engine

> 模拟数据不得作为真实超算运行或正式验收实测数据。

## Applications

1. 地球动力学模拟
2. AI 大模型训练
3. 汽车结构仿真
4. 大规模无人机协同仿真
5. 跨中心虚拟药物筛选
6. 第一性原理材料计算
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
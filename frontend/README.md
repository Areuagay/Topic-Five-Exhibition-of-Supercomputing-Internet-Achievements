# 课题五 · 超算互联网应用成果展 — 前端（Vue 3 + Nuxt 3）

对齐项目技术栈选型重构的前端展示页：**Vue 3 + Nuxt 3**（SSR）、**Element Plus** 组件库、
**Pinia** 状态管理、**ECharts** 数据可视化、**AntV X6** 工作流 DAG。零后端依赖，
开发阶段由 Nitro server 直接读取 `../mock-data` 提供模拟数据；接入真实后端时仅需一处配置切换。

## 技术栈

| 层级 | 技术选型 | 本项目使用 |
|---|---|---|
| 前端框架 | Vue 3 + Nuxt 3 | ✅ Nuxt 3.14（SSR，文件路由） |
| UI 组件库 | Naive UI / Element Plus | ✅ Element Plus（`@element-plus/nuxt` 按需自动导入） |
| 状态管理 | Pinia | ✅ `stores/app.ts`（域名元信息缓存） |
| 图表可视化 | ECharts | ✅ `components/BaseChart.vue`（按需注册折线/柱状/饼/图） |
| 流程图编辑 | AntV X6 / LogicFlow | ✅ `components/WorkflowDag.vue`（X6 只读 DAG 展示） |

## 环境要求

- **Node.js ≥ 18（推荐 20 LTS）** 与 npm —— 本目录源码在此环境安装依赖后运行。
- 无需数据库 / 消息队列 / 容器，纯前端静态展示。

## 快速启动

```bash
cd frontend
npm install        # 安装依赖（postinstall 自动执行 nuxt prepare）
npm run dev        # 开发模式，默认 http://localhost:3000
```

生产构建：

```bash
npm run build      # 产物在 .output/
npm run preview    # 本地预览构建产物
```

## 目录结构

```
frontend/
├── app.vue                     # 根组件（NuxtLayout + NuxtPage）
├── nuxt.config.ts              # Nuxt 配置（modules / runtimeConfig）
├── package.json
├── assets/css/main.css         # 全局样式（科技蓝主题 + Element Plus 变量覆盖）
├── layouts/default.vue         # 默认布局（页头 + 内容 + 页脚）
├── components/
│   ├── AppHeader.vue           # 顶部导航（首页 / 6 学科域 / 多中心联调）
│   ├── StatusBadge.vue         # 状态徽章（状态 → Element Plus Tag）
│   ├── MetricCards.vue         # 指标统计卡组
│   ├── BaseChart.vue           # ECharts 封装（折线/柱状/图）
│   └── WorkflowDag.vue         # AntV X6 工作流 DAG（只读展示）
├── composables/
│   ├── useApi.ts               # API 访问层（统一响应解析，支持真实后端切换）
│   └── useFormat.ts            # 格式化工具（数字/字节/耗时/时间/状态映射）
├── stores/app.ts               # Pinia：域名与集群元信息缓存
├── types/index.ts              # TS 类型（与 OpenAPI 契约、mock-data 对齐）
├── pages/                      # Nuxt 文件系统路由
│   ├── index.vue                                   # → /                   总览
│   ├── domains/[domain]/scenarios/index.vue        # → /domains/:domain/scenarios 场景列表
│   ├── domains/[domain]/scenarios/[scenarioId].vue # → 场景详情（指标/基准/算子/参数）
│   ├── domains/[domain]/runs/index.vue             # → 运行列表（搜索/状态筛选）
│   ├── domains/[domain]/runs/[runId].vue           # → 运行详情（进度/DAG/指标/日志/产物）
│   └── multicenter/index.vue                       # → /multicenter 多中心联调
└── server/
    ├── utils/mock.ts           # mock 路径映射与 JSON 读取
    └── api/[...path].ts        # Nitro mock API：GET /api/... → ../mock-data/*.json
```

## 数据来源：模拟数据 → 真实后端无缝切换

### 当前（模拟数据）

- 数据文件位于工作区根目录 [`../mock-data`](../mock-data)（61 个 JSON、100 条记录，
  与 `docs/api/` 7 份 OpenAPI 契约字段一致，统一响应 `{code, message, data, timestamp}`）。
- Nitro server 端点 `GET /api/[...path]` 将前端请求映射为 mock-data 文件并原样返回：

| 前端请求 | mock 文件 |
|---|---|
| `/api/index` | `mock-data/index.json` |
| `/api/domains/:domain/scenarios` | `mock-data/{domain}/scenarios.json` |
| `/api/domains/:domain/benchmark` | `mock-data/{domain}/benchmark.json` |
| `/api/domains/:domain/runs` | `mock-data/{domain}/runs.json` |
| `/api/domains/:domain/runs/:runId` | `mock-data/{domain}/run-details/{runId}.json` |
| `/api/multicenter/invocations/:id` | `mock-data/multicenter/details/{id}.json` |
| … | … |

### 切换为真实后端

后端完成前后端对齐后（字段契约与 `docs/api` 一致），只需修改
[`nuxt.config.ts`](nuxt.config.ts) 中 `runtimeConfig.public.apiBase` 指向真实 API 网关：

```ts
runtimeConfig: {
  public: {
    apiBase: 'https://api.example.com/api/v1', // 指向真实后端
  },
},
```

前端 `composables/useApi.ts` 统一通过 `$fetch(\`${apiBase}${path}\`)` 请求，代码零改动。

## 路由表

| 路径 | 页面 |
|---|---|
| `/` | 总览：统计卡、学科应用入口、算力中心状态 |
| `/domains/:domain/scenarios` | 应用场景列表 |
| `/domains/:domain/scenarios/:scenarioId` | 场景详情：指标、架构、算子、基准图、参数 |
| `/domains/:domain/runs` | 运行记录：状态统计、搜索、筛选 |
| `/domains/:domain/runs/:runId` | 运行详情：进度、任务信息、指标图表、DAG、日志、产物 |
| `/multicenter` | 多中心联调：集群拓扑、函数部署矩阵、调用追踪、负载迁移 |

## 常见问题

- **`npm` 报找不到 package.json（ENOENT）**：常见于 CMD 下跨盘符切目录未生效——
  若项目在 F 盘而当前在 C 盘，`cd f:\...` 不会切换驱动器，必须用 **`cd /d`**：
  ```cmd
  cd /d f:\task5\Topic-Five-Exhibition-of-Supercomputing-Internet-Achievements\frontend
  ```
  切过去后提示符应变为 `f:\task5\...\frontend>`，再执行 `npm run dev`。
- **命令找不到 node / npm（已安装但终端不识别）**：若 Node.js 安装在非默认路径
  （本机实测为 `D:\Program Files\nodejs`）且当前终端 PATH 未生效，可先执行一次：
  ```cmd
  set "PATH=D:\Program Files\nodejs;%PATH%"
  ```
  再运行 `npm install` / `npm run dev`；或直接新开一个终端窗口（安装器已写入
  用户 PATH，新窗口会自动生效）。
- **端口占用**：`npm run dev` 默认 3000，可用 `npm run dev -- --port 3001` 指定。
- **mock 404**：确认 `mock-data/` 位于工作区根目录（与 `frontend/` 同级），
  或通过环境变量 `MOCK_DATA_DIR` 指定其绝对路径。
- **类型报错**：首次 `npm install` 后 Nuxt 会生成 `.nuxt/tsconfig.json`，IDE 类型提示自动恢复。

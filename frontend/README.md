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


## 专业工作台（公共底座 + 地震波）

目前 12 个场景均已接入独立专业工作台：`wave-propagation`、`tectonic-evolution`、`llm-pretraining`、`pinn-acceleration`、`vehicle-crash`、`fatigue-life`、`swarm-coordination`、`path-planning`、`virtual-screening`、`admet-prediction`、`band-dos`、`high-throughput-screening`。各工作台按实际接口字段显示；缺失的数据块单独呈现空状态，接口缺口详见下文。

- `components/run/ScenarioWorkspace.vue`：场景组件映射和独立状态显示。
- `config/scenario-workspaces.ts`：12 个正式场景 ID、领域及启用状态。
- `types/domain-data.ts`：12 场景的 canonical domain_data 类型；尚未产出的字段可缺省。
- `components/domain-workspaces/geodynamics/WavePropagationWorkspace.vue`：波场播放/滑块、Residual 对数曲线、Seismogram、分区摘要。
- `components/run/ArtifactPreview.vue`、`ArtifactActions.vue`：图片/GIF/视频/JSON/CSV 预览和下载错误提示。文本最多预览 256 KiB，原文件不变。

CSV 以只读表格展示（首行表头、固定表头、行号和横向滚动），支持引号内逗号/换行及转义引号，保留原始字符串。最多展示 500 行数据、60 列和 256 KiB，截断时独立提示，完整内容通过下载获取。JSON 保持格式化文本；常见图片、音视频和 txt/log/md/yaml/xml 文本使用对应预览。按支持的格式和 preview_supported 判断按钮；仅有下载地址的受支持文件可用该地址预览，其他格式只提供下载。预览失败使用统一面板，下载失败在按钮旁弹出可关闭/重试的提示，不撑高表格行。

产物回归：`node browser-tests/artifact-previews.mjs`；CSV 解析测试：`node --test tests/csv-preview.test.mjs`。
- `components/run/ResourceState.vue`：分区 Loading/Error/Empty 和重试。

### 启动与接口

先在仓库根目录运行 `node backend/server.js`（3001），再在 frontend 运行 `npm run dev`。
打开 `/domains/geodynamics/runs/GEO-20260811-0001`，在运行指标下方查看专业工作台。

任务摘要来自 `/api/v1/{domain}/runs/{run_id}`；Workflow、Metrics、Logs、Artifacts 在浏览器中独立调用对应子路径。专业数据只读取 `/metrics` 的 `response.data.domain_data`，不读取摘要内兼容副本，也不从页面导入 JSON。浏览器 Network 可以直接查看这四个请求。单个子接口慢、失败或为空不阻断其他区域；失败时可单独重试。

`NUXT_PUBLIC_API_BASE` 可指向另一个 HTTP API 前缀（如 `https://example.com/api/v1`），默认通过 Nuxt 代理到 3001。Artifact 的 `/api/v1/files/...` 相对路径也通过同一配置解析。跨域接入时后端须提供 CORS。按展示调整，专业区和媒体不再重复显示模拟来源文字；任务来源字段和原始 PNG 水印保留。波场预览采用固定高度和解码后换帧，慢速请求时保留上一帧，避免下方曲线上移。

目前开发依据仓库已有 HTTP 响应；仓库 OpenAPI 仍为 1.2.0，后续契约冻结需要与后端核对。当前服务中的旧 gfs 占位 Artifact 可能不可用，界面会显示预览/下载失败并允许重试。

### 验证

- `npm test`：现有页面契约 + 新增 URL/曲线数据/场景注册表行为测试。新增测试使用 Node 22.18+ 的原生 TypeScript 支持。
- `npm run typecheck`、`npm run build`：类型与生产构建。
- 已安装 Playwright 与 Chrome 时，启动前后端后执行 `node browser-tests/wave-workspace.mjs`。可通过 `FRONTEND_URL` 指定前端地址，通过 `PLAYWRIGHT_MODULE` 指定 Playwright 模块路径。
- 浏览器检查覆盖 HTTP 子资源、播放/滑块、CSV 预览、无效文件、Metrics 失败重试、缺帧、产物失败、慢接口隔离、刷新恢复及 12 代表任务回归。
- 截图默认写入 `../.runtime-logs/wave-1920.png` 与 `wave-1366.png`；可用 `SCREENSHOT_DIR` 调整输出目录。

切帧布局回归：`node browser-tests/wave-frame-stability.mjs` 人为延迟第二帧，检查旧帧保留及曲线位置在加载前、中、后保持不变。

### 板块构造工作台

`TectonicEvolutionWorkspace.vue` 提供温度/速度场切换、8 组时间帧播放、对应最高/平均值与趋势、非线性残差曲线。数值使用与当前场图相同时间的真实采样点，无匹配点时显示 —，不插值。单位读取可选的 `domain_data.units` 元数据（time / temperature / velocity / residual）；有值才显示括号单位，缺省或空字符串仅显示量名称，不猜测或转换。当前响应没有此元数据，因此不显示单位。

入口：`/domains/geodynamics/runs/GEO-20260811-0010`。浏览器回归：`node browser-tests/tectonic-workspace.mjs`，覆盖场图切换、数值一致性、播放、两种桌面尺寸和缺图降级。

场图预览在组件内保留最多 24 张已解码图片，用两个并发任务预加载，组件卸载后释放引用。切换复用图片节点，不重复请求 no-store 文件；短于 180ms 的等待不闪现加载提示。`browser-tests/tectonic-units-cache.mjs` 验证重复切换零新增请求，以及接口有/无单位的展示。

### 单位显示规则

所有支持指标元数据的展示使用统一规则：单位缺省、null 或空白时省略，有值才显示。地震波使用 `domain_data.units` 的 time / simulation_time / amplitude / residual，板块使用 time / temperature / velocity / residual。通用 GPU、能量、SCF 曲线使用 `/metrics` 的 `units[字段名]`，或 `metrics[]` 中同名条目的 `unit`。指标卡和 Benchmark 沿用各项自己的 unit，不从数值推断单位。资源字段名自带单位（如 memory_gb）和由进度计算的百分比仍遵循原接口语义。

### AI 场景工作台

预训练 `LLMPretrainingWorkspace.vue` 提供 Loss/LR/吞吐、GPU 指标切换和 hover/键盘选择、DP/TP/PP、检查点时间线（点击同步 Loss 图中范围内的步数标线）。PINN 提供三类 Loss 开关、36×36 原始残差热力图及 Tooltip、采样统计和预测误差。独立数据块缺失时保留其他区域；单位来自 domain_data.units，缺省省略。size_gb 等自带单位的字段遵循原契约。

入口为 `/domains/llm/runs/LLM-20260811-0001` 与 `LLM-20260811-0010`。运行 `node browser-tests/ai-workspaces.mjs` 验证 GPU/Checkpoint/损失曲线交互、缺失残差场、1920/1366 布局。

### 汽车场景工作台

碰撞 `VehicleCrashWorkspace.vue` 提供应力图切换、关键结果、能量、加速度和侵入量曲线。疲劳 `FatigueLifeWorkspace.vue` 提供损伤云图、危险位置选择及对应应力和寿命、损伤累积与 S–N 曲线。媒体使用独立 Artifacts 接口中可预览的文件，接口失败可单独重试，不影响指标曲线。当前接口没有危险位置到云图坐标的映射，选择位置仅联动数值与说明，不虚构空间高亮。

入口为 `/domains/automotive/runs/AUTO-20260811-0001` 与 `AUTO-20260811-0010`。运行 `node browser-tests/automotive-workspaces.mjs` 验证图片切换、位置联动、产物失败重试及 1920/1366 布局。

### 无人机场景工作台

集群协同 `SwarmCoordinationWorkspace.vue` 提供采样轨迹的 X–Y / X–Z 等比例投影、真实时间点播放、单机选择、碰撞位置和任务目标，以及编队误差和任务数量曲线。播放保留该时刻之前最近的实测采样点，不插值；离开组件后停止计时器。事件只有 step，轨迹只有 t，因此不将碰撞步数映射成轨迹时间。当前显示采样轨迹，不以采样数量代表整个集群。

航迹规划 `PathPlanningWorkspace.vue` 显示接口给出的矩形/圆形障碍物、起终点、最优路径、代价曲线和可选原始结果图。未提供路径长度或耗时就不编造数值。坐标和代价单位读取可选 `domain_data.units`，没有则省略。

入口为 `/domains/uav/runs/UAV-20260811-0001` 与 `UAV-20260811-0010`。运行 `node browser-tests/uav-workspaces.mjs` 验证投影、播放、选择、障碍物几何、预览失败、数据块缺失、单位和两种桌面尺寸。

### 药物场景工作台

虚拟筛选 `VirtualScreeningWorkspace.vue` 提供筛选漏斗、得分直方图、按原始排名/对接得分/分子量/LogP 排序的候选表、编号搜索和候选图像切换。TOP-N 阶段数量与实际返回候选数分别显示。当前服务没有返回计划中的 `cluster_progress`，计算中心进度显示暂无数据。

ADMET `ADMETWorkspace.vue` 提供通过状态筛选、编号搜索、性质排序、候选雷达图、可点击选择候选的属性热力图、风险分布和五种性质直方图。筛选阈值和 passed 均来自接口，不在前端重新判定；雷达范围由返回数值和分箱确定，不假设统一概率区间。热力图颜色表示原始数值大小，不将颜色映射为临床风险结论。各图表的单位读取可选 `domain_data.units`，缺省省略。没有完整五项性质时显示相应空状态，不以零填补雷达图。

入口为 `/domains/drug/runs/DRUG-20260811-0001` 与 `DRUG-20260811-0010`。运行 `node browser-tests/drug-workspaces.mjs` 验证排序、搜索、图像切换、通过筛选、雷达/热力图选择、动态规则和单位、缺失数据块与两种桌面布局。

### DFT 场景工作台

`BandDOSWorkspace.vue` 显示共用能量范围的能带和 DOS、可选费米能级标线、SCF 总能量/能量变化切换、晶格矩阵与可选择原子的坐标投影。能带严格按返回的 k_positions 绘制；当前 k_labels 没有对应刻度位置，仅显示高对称路径名称，不推断标签位置。原子坐标未声明分数/笛卡尔约定，按原始坐标展示，不推断晶胞变换和化学键。能量单位来自 units.energy，其他量使用各自字段元数据。

`HighThroughputWorkspace.vue` 显示批次统计、材料搜索/排序、中心/收敛/排名筛选、形成能-带隙散点选择、候选排名联动和中心任务分配。排名成员不替代 qualified 总数；不在前端重算后端筛选结论。

入口为 `/domains/dft/runs/DFT-20260811-0001` 与 `DFT-20260811-0010`。运行 `node browser-tests/dft-workspaces.mjs` 验证 SCF/原子切换、材料筛选排序和排名联动、缺失分区、单位和两种桌面布局。

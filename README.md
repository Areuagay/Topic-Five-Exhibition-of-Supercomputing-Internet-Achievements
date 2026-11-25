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

多中心总览的“在线人数”每5–10秒在预置人数附近变化，标题旁明确保留“模拟”标记；
切换页签、页面隐藏或离开页面时停止刷新。该演示不改写后台人数。
只有各中心的 `concurrent_users_source` 均为 `simulated` 时才启用随机演示；
实测来源为 `real` 时保留上报值，缺少来源时显示“来源待核验”标记。

## 后端数据同步

“函数多中心联调”的四个算力中心资源状态取自超算平台首页「全局资源视图」的四张卡片
（超算名称、CPU、GPU、运行任务、排队等待、资源状态），脚本会把平台数据落成快照，
再据此重算拓扑、部署矩阵、工作负载、调用追踪与迁移记录：

```powershell
node scripts/sync-multicenter-backend.mjs
# 仅使用仓库中的平台快照
node scripts/sync-multicenter-backend.mjs --offline
# 或在 frontend 目录
npm run sync:backend
# 默认读取 http://192.168.95.138:8890/ ，可用环境变量覆盖
$env:MULTICENTER_BACKEND_URL = 'http://192.168.95.138:8890/'
```

- 快照：`mock-data/multicenter/backend-snapshot.json`（含来源地址与抓取时间）
- 平台不可达时自动回退到该快照，脚本仍可重复执行
- 按超算名称匹配城市与硬件，不依赖平台卡片顺序；资源状态跟随对应的超算
- 四中心对应关系：天河新一代 → 长沙 / 飞腾CPU + 迈创DSP；神威·太湖之光 → 济南 / 神威26010 众核处理器；
  曙光星云 → 昆山 / 国产CPU + 寒武纪MLU；银河 III → 广州 / Intel Xeon + Xeon Phi；调度器均为 SLURM
- 首页索引中的中心名称与架构、六大领域运行记录中的集群名称随脚本一起更新
- 六大领域的运行记录、运行详情中的集群名称也随脚本同步，避免与资源调度显示不一致
- 平台暂未开放函数部署、调用与迁移接口，这三块按四中心运行任务 / 排队等待推导：
  每中心每 4 个运行任务折算 1 个就绪实例，调用条数等于运行任务数，迁移只发生在非维护中心之间

## 场景演示视频

运行详情与体验流程的结果页在工作流和资源统计下方展示预录场景视频，支持切换、暂停、全屏和进度拖动。
汽车 `vehicle-crash` 关联车辆模型、坠落、坠物、冲撞四条视频；无人机 `path-planning` 关联视觉避障和常规飞行两条视频。
其余场景暂不关联视频。视频是提供方的预录场景演示，不代表当前模拟任务实际生成了这些结果，也不按旧 A01/U01 编号推断算子绑定。

- 映射：`backend/scenario-videos.js`，沿用现有工作流，不修改节点或算子。
- 六条主视频通过 Git LFS 保存在 `artifacts/videos/<视频ID>.mp4`，开发和部署均优先读取此目录。`AAA/` 仅作为本地原材料的备用来源，不提交到仓库。
- 克隆仓库前安装 Git LFS，克隆后执行 `git lfs pull` 获取视频实体文件（不能只下载 GitHub 源码 ZIP 中的 LFS 指针）。
- 可通过 `SCENARIO_VIDEO_DIR` 指定统一视频目录，其中使用 `<视频ID>.mp4` 命名。
- `scripts/package-deploy.mjs` 会将已存在的六条主视频复制到部署包，缺失时提示；不重复打包切片。
- 列表接口：`GET /api/v1/{domain}/scenarios/{scenarioId}/videos`；视频接口：`GET/HEAD /api/v1/scenario-videos/{id}/content`，支持 HTTP Range。
- 没有配置视频时不显示视频区；已配置但文件缺失时显示重试提示。切换视频或离开结果页会停止播放。

## 本地文件上传与预览

「输入数据」的六领域 33 个可上传项默认配好小规模演示文件，可直接预览、导入，也可点击「更换文件」。默认文件采用对应数据项的中文下载名称，上传后显示实际文件名；只校验内容、CSV 表头及 JSON 字段与类型，不要求固定文件名。单文件上限 5 MB，校验成功后保存并自动预览，失败时保留原数据。预览中可「恢复默认」。刷新或重启保留用户文件；上传存入 `.runtime-data/`，不修改 `mock-data/uploads/` 中的默认文件。详细说明、格式边界及接口见 [上传样例说明](mock-data/uploads/README.md)。

## 算子库同步

六大领域「算子选择」中的卡片与「场景推荐」同步自超算平台「算子库」
（<http://192.168.95.138:8890/operator>），接口为 `/api/v1/operator-libraries` 与
`/api/v1/operator-libraries/{id}`。平台接口需要登录态，首次同步时传入浏览器中的 sessionId：

```powershell
$env:SCNET_SESSION_ID = '<登录平台后的 sessionId>'
node scripts/sync-operator-library.mjs
# 或在 frontend 目录
npm run sync:operators

# 不传登录态时直接使用仓库快照，按分配表重新生成各领域数据
node scripts/sync-operator-library.mjs --offline
```

- 快照：`mock-data/operator-library/backend-operators.json`（含平台来源、抓取时间与 87 个算子详情）
- 平台上的「生物信息场景」11 个和「通用计算场景」13 个不属于应用示范的六个领域，
  同步时排除，不进入任何领域的算子列表；领域内实际使用 63 个算子：
  地球动力学 4、AI模型训练 9、汽车设计 14、材料计算 14、仿真计算 13、药物设计 9
- 分配表：`scripts/operator-library-assignments.json`，按算子标题一一对应到领域 / 方向，
  其余字段（摘要、镜像、调用入口、CPU/GPU/内存、资源要求、类型与所属场景）全部取自平台详情
- 63 个领域算子分别落入 6 个领域的 12 个方向：算子既出现在领域「全部算子」列表中，
  又在该方向的 `scenario-details.json` 里作为「场景推荐」
- 卡片样式保持不变，只替换标题、摘要、资源与「运行详情」；运行详情展示平台镜像、调用入口、
  运行环境、部署方式、资源要求、算子类型与所属场景
- 运行环境按平台函数注册示例中的真实 `runtime` 判定：`.sif` 镜像显示 Singularity，
  `hub…:tag` / `local/…:tag` 镜像显示 Docker；`runtimeType=instance` 作为部署方式单独标注为「平台实例」。
  六个领域并非全是 Singularity：AI 模型训练为 Docker，汽车设计为 Singularity + Docker，
  地球动力学为 Singularity（其中 2 个以平台实例方式部署）
- 算子选择卡片提供「运行环境」筛选，可按 Singularity / Docker 过滤
- 同步脚本会把运行详情里已失效的 `selected_operator_ids` 迁移到新算子；执行
  `node scripts/migrate-run-operators.mjs` 可进一步重建历史记录的工作流节点，并按算子补齐
  CPU / GPU / 内存 / 运行消耗核时，同时对齐起止时间。迁移 `.runtime-data/` 前请先停止后端，
  避免运行中的内存状态覆盖迁移结果。

地球动力学的两个板块已按实际工作流实体扩展 DAG：分别固定保留 SUPG / Uzawa，
其他算子可选；8 个内置流程实体自动加入编排并显示执行进度，不进入算子选择。
其他五个领域的十个板块分别配置 10–19 个固定流程实体，覆盖领域专属的输入检查、
计算分支、结果校验与归档；进度直接显示在 DAG 节点中。
依赖、历史记录更新与模拟执行边界见 [工作流说明](docs/workflow-execution.md)。

## 提供方实测算例

结果页在对应场景默认显示「实测算例结果」，可切换「当前任务数据」。实测算例是提供方的独立结果，页面上方的任务状态、工作流与资源消耗仍属于当前演示任务。

- 地球动力学 / 地幔对流与构造演化（`tectonic-evolution`）：CitcomCU caseA 第 12500 步，模拟时间 0.0347853，49×49×49 网格；展示温度与速度模长的 18°E 剖面、全场统计和原始结果图。材料只有一个快照，不生成时间演化曲线；原文未提供物理单位。
- AI 模型训练 / 分布式预训练（`llm-pretraining`）：图文训练的 `ai-data-prep`、`transformers-trainer`、`peft-lora`、`pytorch-ddp` 四个算子的原始日志、数据划分、损失、准确率与三次并行对比。利用率提升采用日志中的相对百分比。日志提及的模型/适配器路径不代表已提供文件，不生成下载链接。
- 汽车和无人机的录制工作流文档明确将参数标为示例。目前只接入已提供的视频；数值指标待收到实测文件后接入。

原文件与可重复生成的展示索引位于 `artifacts/provided/`，部署脚本会一并复制。重新导入：

```powershell
python scripts/import-provided-results.py --geodynamics-zip "地球动力_结果.zip" --workflow "geodynamics-workflow.json" --training-log "训练算子输出.md"
```

导入会验证 ZIP CRC、14 个 SHA256、原始分块与 VTR 的网格/字段、训练数据划分和对比均值。速度分量由原始 theta/phi/radius 对应到 VTR radius/theta/phi，重叠网格保留源文件值，不平滑或平均。替换索引后重启后端。

接口：`GET /api/v1/{domain}/runs/{runId}/measured-result` 按任务场景返回算例或 `null`；`GET /api/v1/provided-files/{assetId}/preview|download` 只开放登记的原始文件。验证：`node --test backend/tests/provided-results.test.mjs`；浏览器验证：`node frontend/browser-tests/provided-results.mjs`（需 Playwright，可通过 `PLAYWRIGHT_MODULE` 指定模块）。

## Applications

1. 地球动力学
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

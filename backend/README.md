# 模拟后端服务（Mock Backend）

为「课题五·超算互联网应用成果展」提供 REST API `http://localhost:3001/api/v1/*`：

- **GET**：返回项目根目录 [`mock-data/`](../mock-data) 下的 JSON 数据（统一响应结构
  `{ code, message, data, timestamp }`）；
- **POST / PUT / PATCH / DELETE**：模拟写操作，回显请求体并返回成功响应
  （`data` 中带 `method` / `path` / `body`），保证前后端任何接口调用都能联通。

## 技术说明

- **零第三方依赖**：基于 Node.js 原生 `http` 模块实现，无需 `npm install`（Node >= 18）；
- **与前端共享运行时**：前端为 Nuxt（Node 生态），前后端技术栈统一；
- **前后端分离**：前端通过 `http://localhost:3000/api/v1/*`（Nuxt dev server 代理转发到本服务 3001 端口）访问；
- 后续接入真实后端（如 FastAPI）时，仅需替换前端 `nuxt.config.ts` 中的代理目标或
  `runtimeConfig.public.apiBase`，前端页面代码零改动。

## 启动

```bash
node backend/server.js            # 在项目根目录执行
# 或
cd backend && node server.js      # 或 npm start
```

默认监听 `http://127.0.0.1:3001`。

> 若 `node` 不在 PATH 中（本机 Node 安装于 `D:\Program Files\nodejs`），可使用完整路径：
> `"D:\Program Files\nodejs\node.exe" backend\server.js`

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `BACKEND_HOST` | `127.0.0.1` | 监听地址 |
| `BACKEND_PORT` | `3001` | 监听端口 |
| `MOCK_DATA_DIR` | `<repo>/mock-data` | 模拟数据目录 |

Windows CMD 示例：

```cmd
set BACKEND_PORT=3001
node backend\server.js
```

## 接口列表（前缀 `/api/v1`）

> GET 返回对应数据文件；POST / PUT / PATCH / DELETE 返回模拟成功响应（不落库）。

| 方法 | 路径 | 数据文件 |
| --- | --- | --- |
| GET | `/api/v1/index` | `index.json` |
| GET | `/api/v1/{domain}/scenarios` | `{domain}/scenarios.json` |
| GET | `/api/v1/{domain}/scenario-details` | `{domain}/scenario-details.json` |
| GET | `/api/v1/{domain}/params-schema` | `{domain}/params-schema.json` |
| GET | `/api/v1/{domain}/benchmark` | `{domain}/benchmark.json` |
| GET | `/api/v1/{domain}/operators` | `{domain}/operators.json` |
| GET | `/api/v1/{domain}/runs` | `{domain}/runs.json` |
| GET | `/api/v1/{domain}/runs/{runId}` | `{domain}/run-details/{runId}.json` |
| GET | `/api/v1/multicenter/clusters` | `multicenter/clusters.json` |
| GET | `/api/v1/multicenter/topology` | `multicenter/topology.json` |
| GET | `/api/v1/multicenter/functions` | `multicenter/functions.json` |
| GET | `/api/v1/multicenter/deployment-matrix` | `multicenter/deployment-matrix.json` |
| GET | `/api/v1/multicenter/workloads` | `multicenter/workloads.json` |
| GET | `/api/v1/multicenter/invocations` | `multicenter/invocations.json` |
| GET | `/api/v1/multicenter/invocations/{id}` | `multicenter/details/{id}.json` |
| GET | `/api/v1/multicenter/migrations` | `multicenter/migrations.json` |
| GET | `/api/v1/multicenter/migrations/{id}` | `multicenter/details/{id}.json` |

其中 `{domain}` 取值：`geodynamics`、`llm`、`automotive`、`uav`、`drug`、`dft`。

## 快速验证

```bash
# 直接验证后端
curl http://localhost:3001/api/v1/llm/scenarios

# 经前端 Nuxt dev server 验证（需先启动前端 npm run dev）
curl http://localhost:3000/api/v1/llm/scenarios
```

## 前端联调说明

1. 启动后端：`node backend\server.js`（端口 3001）；
2. 启动前端：`cd frontend && npm run dev`（端口 3000）；
3. 浏览器访问 `http://localhost:3000`，页面数据请求 `http://localhost:3000/api/v1/*`，
   由 Nuxt 的 `routeRules.proxy` 转发到本服务。

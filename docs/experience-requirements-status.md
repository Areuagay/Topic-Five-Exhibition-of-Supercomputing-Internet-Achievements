# 体验需求核对（2026-09-23）

本表区分聊天中提出的体验优化与附件 P0/P1/P2 的完整开发范围。依据当前前后端代码和已有体验验证记录核对；不是第三方验收结论。

## 聊天中的功能与体验要求

| 要求 | 当前情况 |
| --- | --- |
| 六大领域同步 | 六领域、12 场景复用同一套六步组件，上传、算子选择、监控和结果交互共用 |
| 按大小模拟上传 | 已实现约 2–12 秒模拟进度、取消、完成与移除反馈；上传的是预置条目 |
| 有结果／无结果模拟数据 | 已实现，运行中、失败、停止和无成果记录不开启最终结果 |
| 运行中进度持续变化 | 使用服务端时间推进，工作流、列表、详情共享运行状态 |
| 前端人工操作检查 | 已有十二场景功能检查记录；本轮只做关键交互与运行检查 |
| 按钮、布局、过渡质感 | 持续修订中，最终视觉认可由用户确认 |
| 完成后保留服务 | 前后端服务持续运行 |

## 附件 P0/P1：不能按全文声明完成

当前有六步浏览、预置数据上传/移除、算子提交生成任务、动态工作流与监控、专业结果展示。但以下附件要求尚未完整落地：

- 任意 Runtime Dataset 的新建和删除（目前移除只重置预置条目的上传状态）。
- 自主选择 2–4 个中心并实时更新算力预测（目前资源页是中心适配范围与负载展示）。
- Dataset、Params、中心、算子组成完整可编辑任务配置和预测。
- 先预览按中心数生成的并行 Workflow，再在 Step 4 确认创建任务（当前在 Step 3 提交算子时创建）。
- 应用任务停止、删除、复制的完整操作链。

因此，“六领域十二场景可运行”不等于 P0/P1 的全部验收项已经满足。

## 附件 P2：已有展示基础，联动和证据仍有缺口

已有多中心拓扑、函数列表、部署矩阵、Workloads、调用与迁移记录、Trace／迁移详情的读取和展示入口。

尚不能宣称完成的部分：

- 应用核心算子到函数服务、调用、容器实例的端到端映射。
- 从界面实际发起 Function Invoke、自动扩缩容演示、跨中心迁移，并反馈到资源与部署矩阵。
- 六领域专门的跨中心验收 Run、中心泳道和跨中心执行摘要。
- 指标证据区、第三方报告信息、接口文档地址和开发者调用示例。

`useApi.ts` 中多中心接口当前以 GET 读取展示为主，不能把已有的模拟记录展示当成上述写入与联动操作已经完成。

## 本轮设计与动效参考

- [Radix Themes Button](https://github.com/radix-ui/themes/blob/main/packages/radix-ui-themes/src/components/button.css) 与 [Base Button](https://github.com/radix-ui/themes/blob/main/packages/radix-ui-themes/src/components/_internal/base-button.css)：参考 solid / soft / ghost 的层级、尺寸和反馈区分，自行实现项目 CSS。
- [FormKit AutoAnimate](https://github.com/formkit/auto-animate/blob/master/src/index.ts)：参考删除元素脱离文档流、旧位置保留、其他元素同步补位的处理。
- [Vue TransitionGroup](https://github.com/vuejs/core/blob/main/packages/runtime-dom/src/components/TransitionGroup.ts)：使用现有 Vue 能力实现列表位移动画。

未引入另一套组件库或复制完整开源组件。继续使用项目已有 Vue、Element Plus 和浏览器动画能力。

本轮修改前回退提交：`94ec9e0`。

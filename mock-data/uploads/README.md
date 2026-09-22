# uploads — 数据准备上传样例

本目录存放「一键体验 · 数据准备」环节中，供用户**手动上传**的模拟数据样例文件。

- 目录命名：`uploads`（上传），一级子目录按学科域划分（当前仅 `geodynamics`）。
- 文件命名：以对应数据集 `dataset_id` 前缀命名，便于后端接口按数据集自动映射。
- 文件类型：包含 `JSON` 与 `CSV` 两类，模拟真实场景中可上传的输入数据。
- 所有文件均为 `simulated`（本地模拟数据），仅用于界面联调与流程演示。

上传流程：前端「上传」按钮 → `POST /api/v1/geodynamics/datasets/{datasetId}/upload`
→ 后端读取本目录对应文件并回写 `mock-data/geodynamics/datasets.json`（数据改变经接口落地）。

# API Specifications

本目录保存课题五前后端联调的标准 OpenAPI 接口文档。

当前包含：

- geodynamics.openapi.json
- llm.openapi.json
- automotive.openapi.json
- uav.openapi.json
- drug.openapi.json
- dft.openapi.json
- multicenter.openapi.json

## 使用原则

1. 前端按照本目录 OpenAPI 定义调用接口。
2. 后端按照本目录 OpenAPI 定义返回数据。
3. 不允许前端或后端单方面修改公共接口字段。
4. 如需调整接口，需先在 Apifox 中确认，再重新导出 OpenAPI 文件并提交 Git。
5. 当前模拟数据需标记为 simulated，不得作为真实超算运行数据使用。
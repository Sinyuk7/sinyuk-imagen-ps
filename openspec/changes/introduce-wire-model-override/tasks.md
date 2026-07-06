## 1. Data Model And Storage

- [x] 1.1 将持久化结构收敛为 `modelId`、`baseModelId`、`wireModelId`，并更新 `UserModelConfig` 与 `SaveUserModelConfigInput`
- [x] 1.2 更新 UXP JSON storage、Chrome IndexedDB storage、in-memory repositories 与 test fakes 的 schema 校验和读写逻辑，要求新 schema 写入 `wireModelId`
- [x] 1.3 调整 storage 读取逻辑：旧 schema config 缺少 `wireModelId` 时直接判定非法并丢弃，并补对应测试

## 2. Runtime Resolution

- [x] 2.1 调整 `saveUserModelConfig()` 校验，使 `baseModelId` 继续锚定官方 preset，`wireModelId` 独立保存
- [x] 2.2 重构 `ResolvedModelConfig`，输出 `configModelId`、`capabilityModelId`、`wireModelId` 三个确定字段
- [x] 2.3 调整 runtime dispatch 注入逻辑，使 provider request 始终发送 `wireModelId`

## 3. Provider Contract Integration

- [x] 3.1 修改 `resolveImageModelRule()`、`resolveProviderResolvedOutput()` 及相关 callsite，显式接收 capability model 参数
- [x] 3.2 保持 `ProviderModelExecution.modelId` 继续表示最终上游 wire model，并补充 request builder / contract tests
- [x] 3.3 验证不依赖全局 catalog `aliases/prefixes/patterns` 也能支持 profile-local wire route 场景
- [x] 3.4 为 relay route 小于官方上限能力的场景补充收窄输出矩阵测试

## 4. UI And Regression

- [x] 4.1 调整 model config 编辑页，将“请求模型 ID”暴露到 `Advanced settings` 并更新说明文案
- [x] 4.2 在列表与相关展示面增加轻量 meta，显示当前 `wireModelId` 与稳定 identity 的差异
- [x] 4.3 增加 `dispatch.provider.start` 等关键日志字段，记录 `configModelId`、`capabilityModelId`、`wireModelId`
- [x] 4.4 运行 application command、storage、UI、provider contract 相关回归测试并记录结果

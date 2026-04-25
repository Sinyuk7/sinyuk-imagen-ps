# providers Open Items

> 仅记录当前仍有效的未解决事项，不包含已完成 planned changes 或历史愿景。

## 1. ProviderDescriptor.configSummary 长期形态未定

- **type**: needs decision
- **evidence**: 原 STATUS.md 中标记为待定；当前为可选摘要对象
- **impact**: 影响 provider descriptor 的公开契约稳定性
- **next_action**: 在后续 change 中决定是否升级为 schema summary 或移除

## 2. ProviderInvokeResult.raw 是否作为稳定公开字段

- **type**: needs decision
- **evidence**: 原 STATUS.md 中标记为待定；当前保留为调试开口
- **impact**: 影响 invoke result 的公开契约与调试接口设计
- **next_action**: 决定长期保留（需文档化）或降级为内部调试接口

## 3. contract / registry / mock 测试覆盖不足

- **type**: confirmed debt
- **evidence**: 原 Change 4（add-provider-verification-harness）仅部分完成，已补充 openai-compatible 关键行为测试
- **impact**: 基础模块缺乏回归保护
- **next_action**: 补充 contract、registry、mock 的单元测试

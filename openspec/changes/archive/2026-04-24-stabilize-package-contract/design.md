## Context

`packages/providers` 当前仍处于“文档意图明确、代码近乎空壳”的阶段：[packages/providers/src/index.ts](/D:/github/sinyuk-imagen-ps/packages/providers/src/index.ts) 仅为空导出，[packages/providers/package.json](/D:/github/sinyuk-imagen-ps/packages/providers/package.json) 也尚未对齐 PRD 中约定的工具链与依赖基线。与此同时，[packages/core-engine/src/types/provider.ts](/D:/github/sinyuk-imagen-ps/packages/core-engine/src/types/provider.ts) 已经把 engine 侧的 provider 边界收敛为 `ProviderRef`、`ProviderDispatchAdapter`、`ProviderDispatcher`。

当前 change 的任务不是实现 provider，而是稳定 package contract，让后续 `mock provider`、`openai-compatible provider`、registry 和 transport 都在同一套契约上生长。约束同时来自三处：

- `core-engine` 不理解 provider 参数语义
- IO 只能在 `app/host` 或 adapter 边界，不能进入 engine
- `providers` 只拥有 provider semantics、validation、API mapping，不拥有 settings persistence、host IO 或 runtime lifecycle

外部参考 `D:\github\sinyuk-imagen\core\generation\_internal\providers` 的结论也比较清楚：可以借鉴“`provider` / `request-builder` / `response-parser` / `diagnostics`”的分层方式，但不能照搬其 `BaseImageProvider`、vendor SDK 中心、文件读取与图片物化混入 provider 的边界形状。

## Goals / Non-Goals

**Goals：**
- 稳定 `packages/providers` 的公开 contract 层与入口导出，使包可以被其他模块可靠引用
- 明确 `Provider` 与 `ProviderDispatchAdapter` 的桥接责任，避免后续实现各自发明适配面
- 定义最小 canonical request、config、result、diagnostics、descriptor shape
- 收敛 `AssetRef` 与 `Asset` 的关系，避免为了“看起来独立”而引入空心抽象
- 对齐 `package.json` 的依赖与脚本基线，使 contract 层能够独立编译

**Non-Goals：**
- 不实现 registry、mock provider、openai-compatible provider、transport、retry、error-map
- 不引入官方 SDK，不定义 vendor-native contract
- 不处理 settings persistence、secret storage、host IO、文件物化
- 不做 cross-provider 参数统一，不扩展到 web app 或 multi-host

## Decisions

### 1. `Provider` 与 `ProviderDispatchAdapter` 显式分层
- **选择**：`packages/providers` 维护自己的 `Provider<TConfig, TRequest>` 契约，同时定义一个显式 bridge/factory，把 provider 实例适配为 `@imagen-ps/core-engine` 所需的 `ProviderDispatchAdapter`
- **理由**：`Provider` 拥有 config/request validation、descriptor、invoke 语义；`ProviderDispatchAdapter` 只是 engine 可调用的极小桥接面。如果把两者揉成一个接口，engine contract 会被 provider 内部语义反向污染
- **替代方案**：让 registry 直接返回 `ProviderDispatchAdapter`（rejected：会把 registry、provider contract、engine 适配三层耦合在一起）
- **替代方案**：让具体 provider 类直接实现 `ProviderDispatchAdapter`（rejected：会让 provider 内部 shape 被 engine 侧固化）

### 2. `AssetRef` 暂定与 `Asset` 等价或显式 alias
- **选择**：在 contract 稳定化阶段，`AssetRef` 不重新发明一个与 `Asset` 平行但语义空心的结构；优先将其定义为与 `@imagen-ps/core-engine` 的 `Asset` 等价，或以显式 alias 包装
- **理由**：当前真正的未决问题不是资源寻址花样，而是 provider contract 的最小稳定面。过早把 `AssetRef` 做成新类型，只会制造额外桥接成本
- **替代方案**：立即引入独立 `AssetRef { id/url/data/... }`（rejected：没有新增信息，却会扩大后续实现面）

### 3. canonical request 只表达“最小意图”
- **选择**：`CanonicalImageJobRequest` 只保留 `operation`、`prompt`、`inputAssets`、`maskAsset`、`output`、`providerOptions`
- **理由**：当前阶段要证明的是 provider 语义能被限制在 `packages/providers`，而不是把各家 provider 参数做统一模型。最小意图足以支撑后续 `generate` / `edit` baseline，又不会把 `size`、`quality`、`background` 等分歧过早写死
- **替代方案**：把 `params` / `extra` 作为松散字典放在中心位置（rejected：会让 contract 失去约束力）
- **替代方案**：把 `prepared_reference_image_path`、`debug_mode`、raw payload snapshot 带入 request（rejected：这些属于 host 或实现细节，不是稳定 contract）

### 4. diagnostics 和 response normalization 进入 contract，但 transport 细节延期
- **选择**：本 change 定义 `ProviderDiagnostics` / `ProviderInvokeResult` 的稳定 shape，但不定义具体 HTTP transport、retry、error map 的实现细节
- **理由**：diagnostics 和 normalized result 是跨模块可观察的契约；HTTP strategy、指数退避、上游错误分类则是后续 provider 实现 change 的工作
- **替代方案**：本 change 一并冻结 transport API（rejected：当前信息不足，且会把实现细节误写成稳定事实）

### 5. package root 只导出稳定 contract，不泄漏未来目录结构
- **选择**：`src/index.ts` 仅 re-export 稳定 contract 与 bridge interface；不把未来 `registry/`、`providers/`、`transport/` 的目录草图当作既成事实
- **理由**：当前 change 的核心是 package contract，而不是宣告某个目录布局已经最终确定。文档里允许“暂定”，实现上也应避免把目录草图提升为承诺
- **替代方案**：在入口里预导出所有未来模块名（rejected：会把未实现结构伪装成稳定公开面）

### 6. 工具链基线属于本 change 的一部分
- **选择**：`package.json` 对齐 `zod`、`@types/node`、`TypeScript >= 5.9`、`Vitest >= 4.1` 与跨平台 `clean`
- **理由**：如果工具链基线不先修正，contract 文件即使写出来，也无法作为稳定地基被验证与消费
- **替代方案**：把依赖修正延后到实现 change（rejected：会让 contract change 处于“文档上成立、工程上不成立”的状态）

## Risks / Trade-offs

- **[Risk] bridge 责任定义过重，导致 `providers` 反向拥有 engine 运行时语义** → **Mitigation**：bridge 只负责把 `Provider` 实例收敛为 `ProviderDispatchAdapter`，不承担 registry、lifecycle、store 或 retry 策略
- **[Risk] canonical request 过于保守，后续真实 provider 接入时发现字段不足** → **Mitigation**：保留 `providerOptions` 作为受控透传空间；等真实 `openai-compatible` 接入完成后再做 refine
- **[Risk] `AssetRef` 暂定等价于 `Asset`，未来若出现更强引用语义需要调整** → **Mitigation**：使用 alias 或薄包装，而非深度耦合；后续可以在不破坏现有 contract 的前提下追加字段
- **[Trade-off] 当前不冻结 transport API，会让下一阶段仍有设计工作** → 接受此 trade-off；这能避免把不成熟的 HTTP 细节误写成长期契约
- **[Trade-off] package root 先只导出 contract，会让未来新增实现模块时需要再次扩展公开面** → 接受此 trade-off；比过早承诺更可控

## Migration Plan

1. 创建并收敛 `src/contract/` 下的公开类型与桥接接口
2. 更新 `src/index.ts` 只导出 contract 层公开面
3. 修正 `package.json` 的依赖与脚本基线，确保 contract-only build 可运行
4. 后续 `implement-registry-and-mock` 与 `implement-openai-compatible-provider` 直接消费本 change 的 contract；若实现中发现 contract 不足，先回到 OpenSpec refine，而不是绕开 contract 私自扩展

回滚策略较简单：如果后续实现证明某个 contract 决策错误，可以在下一次变更里调整 contract 文件与入口导出；本 change 不涉及运行时数据迁移。

## Open Questions

- `ProviderDescriptor` 中是否需要放入 schema summary，还是仅暴露 capability / operations / display metadata
- `ProviderDispatchAdapter` bridge 最终由独立 factory 暴露，还是由每个 provider 实例提供 `toAdapter()` 方法
- `ProviderInvokeResult.raw` 是否长期保留，还是只作为调试期开口
- `openai-compatible` baseline 的 model policy 是否需要在 contract 层留下专门类型，还是延后到实现层

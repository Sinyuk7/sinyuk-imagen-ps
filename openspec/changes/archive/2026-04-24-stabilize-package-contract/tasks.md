## 1. Tooling Baseline

- [x] 1.1 对齐 `packages/providers/package.json` 的依赖基线，补入 `zod`、`@types/node`，并将 `TypeScript`、`Vitest` 升级到文档要求的最低版本
- [x] 1.2 修正 `packages/providers/package.json` 中的 `clean` 脚本，使其在当前 Windows/Node 环境下可用
- [x] 1.3 检查 `packages/providers/tsconfig*.json` 是否支持 contract-only 编译，并在必要时补齐与新依赖基线一致的设置

## 2. Public Contract Surface

- [x] 2.1 创建 `packages/providers/src/contract/` 下的 capability、config、request、result、diagnostics 类型文件，并保持 JSDoc 与中文说明风格一致
- [x] 2.2 定义 `ProviderDescriptor` 与 `Provider<TConfig, TRequest>` 接口，明确 `describe`、`validateConfig`、`validateRequest`、`invoke` 的最小公开契约
- [x] 2.3 收敛 `AssetRef` 与 `@imagen-ps/core-engine` `Asset` 的关系，优先采用等价或 alias 方案，避免引入额外平行资源模型
- [x] 2.4 定义 `CanonicalImageJobRequest` 与 `ProviderInvokeResult` 的稳定 shape，确保不包含 host IO、文件路径或 vendor-specific raw request 字段

## 3. Engine Bridge And Exports

- [x] 3.1 定义从 `Provider` 到 `ProviderDispatchAdapter` 的 bridge interface 或 factory，明确 bridge 责任不包含 registry、runtime lifecycle 或 transport 细节
- [x] 3.2 更新 `packages/providers/src/index.ts`，仅导出稳定 contract 与 bridge 相关公开面，不预暴露未实现的未来模块
- [x] 3.3 将 `openai-compatible` baseline 的通用接入约束记录到 contract 注释中，包括 `baseURL`、`apiKey`、`defaultModel`、`extraHeaders` 等实例级配置点（针对具体真实 provider 的调研留待后续 change）

## 4. Verification

- [x] 4.1 运行 `packages/providers` 的 build，确认 contract 层在无具体 provider 实现的情况下可以通过编译
- [x] 4.2 复核公开导出与 `openspec/changes/stabilize-package-contract/specs/provider-contract/spec.md` 一致，确保 proposal / design / spec / tasks 没有边界冲突
- [x] 4.3 将仍未收敛的事项记录到 `packages/providers/STATUS.md` 或后续 change 输入中，尤其是 `ProviderDescriptor` 细节、bridge 暴露方式与 `raw` 字段去留

## Why

当前 provider 配置仍以单个 `providerId -> config` 的短期存储抽象为中心，runtime 也倾向于启动时静态注入 adapter；这会阻碍多 provider profile、CLI/UI 共享配置、secret 分离和保存后即时生效。现在需要先建立 provider storage 与 discovery 基础，避免后续 `packages/providers` 的 model resolution、generation hardening、image edit 在错误的持久化与发现边界上继续扩展。

## What Changes

- 引入 provider profile 作为一等概念，区分 provider implementation/family 与用户配置的 provider instance/profile。
- 定义 provider profile repository、secret reference、resolved provider config、provider config resolver 的行为边界。
- 将 provider discovery 明确拆成两层：编译期 provider implementation registry 与运行时持久化 provider profile discovery。
- 更新 `docs/STORAGE_DESIGN.md`，补充 provider profile lifecycle、cross-surface storage 策略、runtime config resolution 与 secret 分离规则。
- 扩展 shared commands 的 provider 配置能力，从单一 config get/save 走向 profile list/get/save/delete/test 的用例语义。
- 为 runtime 从静态 config adapter 注入演进到 dispatch-time config resolution 提供设计与任务路径。
- 非目标：不实现动态外部 JS provider 插件加载；不引入 provider marketplace；不实现 asset cache；不把 UXP/Node storage implementation 下沉到 `packages/providers` 或 `packages/core-engine`。

## Capabilities

### New Capabilities
- `provider-profile-discovery`: 管理持久化 provider profiles，支持启动时发现已配置 profiles、secret 引用、跨 surface 存储策略和 runtime 配置解析。

### Modified Capabilities
- `shared-commands-provider-config`: 将 provider config 命令语义从单个 provider config 扩展为 provider profile lifecycle，并保持 shared commands 不直接 IO。
- `runtime-assembly`: runtime 需要支持基于 provider profile 的 dispatch-time config resolution，避免启动时长期持有 secret-bearing provider config。

## Impact

- Affected docs: `docs/STORAGE_DESIGN.md`。
- Affected packages: `packages/shared-commands`、`packages/providers` 的 contract 使用方式、`packages/core-engine` 的 adapter 注入边界、`apps/cli` 的 config adapter/commands、`apps/app` 的未来 UXP storage adapter 接入点。
- Affected APIs: provider config commands、runtime assembly adapter creation、future provider dispatch 参数中的 profile selection 语义。
- Dependencies: 不新增外部 runtime dependency；保持 storage adapter-first，host-specific IO 留在 surface/adapter 层。

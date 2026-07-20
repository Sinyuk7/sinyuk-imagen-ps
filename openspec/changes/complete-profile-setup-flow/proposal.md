## Why

当前保存 Profile 后即成为可见、可选择对象，即使尚未拥有任何 `UserModelConfig`；删除最后一个模型也会重新制造这种零模型 Profile。主界面和执行层还各自以“首项回退”补偿缺少显式模型的状态，编辑任意 Profile 则会意外改写 active Profile。用户无法从产品表面区分创建中、可用和运行时必然失败的对象。

本变更将“用户看见且可选择的 Profile”收敛为：配置结构合法、至少拥有一个 Model Config 的可用对象。连接可达性仍由独立测试和实际请求决定，不成为创建完成条件。

## What Changes

- 新建 Profile 的主操作改为 `Continue`：保存合法 Profile 配置后，根据已有模型、endpoint model hint 和 Official Catalog 精确匹配，完成创建或路由到既有的 Model Configuration / Profile Models 页面。
- 引入仅供创建流程使用的内部 setup 生命周期；未完成首个 Model Config 的 Profile 不进入 Provider 列表、主界面 selector、active Profile 持久化或成功反馈。取消、返回和启动恢复会清理遗留 setup 数据与 secrets。
- 要求 ready Profile 始终至少拥有一个 `UserModelConfig`；拒绝删除最后一个模型，Profile 删除是移除最后一个模型的唯一正常路径。
- 将主界面和 Provider admission 收敛为显式的 `{ profileId, modelId }` 选择，不再以模型列表第一项作为静默回退。
- 编辑既有 ready Profile 只保存或删除 Profile，不改变 active Profile；endpoint model hint 在编辑中仅作为新增模型的预填上下文，不能把保存操作变成创建流程。
- **BREAKING** 移除 `Profile.enabled` 的持久化和运行时语义；当前状态 Profile 一律可参与可用性判定，setup 隔离不复用 `enabled`。
- 保留现有 Profile / Model Config 两层数据边界、既有页面和独立连接测试；不新增用户可见的“待配置 Profile”状态，也不承诺连接可达或真实生成成功。

## Capabilities

### New Capabilities

- `profile-setup-completion`: 定义新建 Profile 从合法连接配置到首个 Model Config、可见、可选和可激活的完成合同。
- `profile-model-availability`: 定义 ready Profile 的最少模型不变量、显式模型选择、最后模型删除和废弃 `enabled` 后的运行时边界。

### Modified Capabilities

无。

## Impact

- `packages/application/src/commands`: Profile 保存/删除、模型保存/删除、Profile 列表、endpoint import 结果和 Generation admission contract。
- `apps/app/src/shared/ui`: Settings Add、Settings Detail、Profile Models、Model Configuration、AppShell、Main composer 及其 Chrome/UXP harness。
- UXP/Chrome persistence：Profile、secrets、Model Config 和 active Profile 的 setup 清理与当前状态读写。
- Provider registry、Official Catalog 和 connection test 不改变协议职责；只被用于模型完成路由和精确自动添加判断。
- 相关 application contract tests、shared UI tests、Chrome adapter tests，以及 `pnpm validate`。

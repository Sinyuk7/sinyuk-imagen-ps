## Context

Profile 与 `UserModelConfig` 已分属独立 repository：前者保存 `apiFormat`、连接、鉴权、billing 与 secret refs，后者保存 model identity、`wireModelId`、`requestStrategyId` 和能力矩阵。`saveUserModelConfig()` 要求 Profile 已存在，所以新建流程无法在首个模型保存前完全不落盘。

当前 `saveProviderProfile()` 会立即将 Profile 暴露给列表和 active selection；`SettingsAddPage` 将其视为保存成功。`AppShell` 和 Provider backend 又在没有显式模型时选择模型列表第一项。最后一个模型可被删除，`enabled` 仍混合了持久化、UI 和 admission 语义。

本设计保留两层模型、既有四个页面和独立连接测试，只收敛 Profile 的完成边界。

## Goals / Non-Goals

**Goals:**

- 将用户可见、可选、可激活的 Profile 定义为 ready Profile：Profile 结构合法且至少有一个 `UserModelConfig`。
- 让新建流程从 `Continue` 到首个模型完成形成单一闭环，不引入用户可见的待配置状态或页面。
- 让编辑既有 ready Profile 保持 `Save | Delete` 语义，保持当前 active Profile。
- 消除 UI 与 backend 的首模型静默回退，并移除 `enabled` 语义。
- 在 command 边界保护最后一个 Model Config 不被删除。

**Non-Goals:**

- 不把连接测试、safe probe 或真实生成设为创建完成前提。
- 不修改 Provider 协议、Official Catalog 的匹配规则、远端 model discovery wire format 或输出能力模型。
- 不增加用户可见的 Profile lifecycle、默认模型或持久化模型选择。
- 不提供旧 Profile 数据迁移；项目采用 current-state，旧 `enabled` 数据不构成兼容合同。

## Decisions

### 1. setup 是内部持久化状态，ready 是唯一产品状态

新建 `Continue` 先以 `setup` 保存合法 Profile 与 secrets。setup Profile 只允许创建路由按 `profileId` 访问；`listProviderProfiles()`、主界面 selector、active Profile 恢复和成功提示都只处理 ready Profile。首个 Model Config 保存成功后，application 负责将 setup Profile 提升为 ready。

选择内部 setup 而非完全内存 draft：Model Config 现有 repository 必须引用已存在的 Profile，且 secrets 不能交给跨页面 React state。选择 setup 而非复用 `enabled=false`：禁用是执行语义，不能同时表示创建过程。

### 2. 创建结果由 application 统一判断，UI 只消费路由 outcome

application 的创建 orchestration 在保存 Profile 后按以下顺序输出：

1. 已有 Model Config，完成 setup。
2. endpoint hint 的 `wireModelId` 已拥有配置，完成 setup。
3. hint 与兼容 Official Catalog entry 精确匹配，创建确定的 Model Config 并完成 setup。
4. hint 存在但无精确匹配，返回 Model Configuration seed。
5. 其余情况返回 Profile Models seed。

UI 不重复这个判断，也不把 discovery suggestions 当作 owned models。精确匹配是 `apiFormat` 兼容、官方 `modelId` 精确相等、策略确定；不得使用前缀、域名或营销名猜测。

### 3. setup 退出必须删除，不提供隐形长期草稿

创建路由返回、取消或失败后，application 删除 setup Profile、关联 Model Config 和 secrets。启动时也清理遗留 setup Profile。若首个模型已写入但 promotion 失败，Profile 仍不可见，且完成命令必须可安全重试或清理，不能以半完成数据进入主界面。

选择清理而非“下次继续”：用户明确不需要可见的待配置概念；保留隐形长期 Profile 会造成难以解释的名字占用和 secret 残留。

### 4. ready Profile 始终有模型，提交必须显式选择模型

删除模型 command 与其 repository primitive 在删除前保证目标 Profile 删除后仍至少有一个 Model Config；否则返回 validation error。主界面在没有显式选择模型时进入 `select-model` readiness，Provider admission、connection test 和 Profile test 也要求调用方明确提供 `modelId`，不再读取 `list()[0]`。

UI 可以在用户显式切换 Profile 后选择确定的单一模型作为交互便利，但该值仅是当前 UI state；不得持久化为 Profile default，也不得由 backend 再次推断。

### 5. active Profile 只由显式选择或首次完成创建写入

编辑 ready Profile 成功后只 reload 数据，不调用 active selection。新建流程完成后，只有当前没有 ready active Profile 时，才将新 Profile 设为 active；已有 active Profile 保持不变。删除当前 active Profile 后，应用按 ready Profile 列表选择替代项或清空。

### 6. 移除 `enabled`

`ProviderProfile.enabled`、保存输入、UI projection 和 Provider admission/readiness 对它的分支一并移除。读入端 SHALL 容忍缺少或遗留的 profile-level `enabled`，但不得把它投影回当前状态或作为运行条件。setup 隔离由生命周期承担；ready Profile 均是可参与正常调用的配置对象，实际连通性仍由请求结果决定。`connection.endpoints[].enabled` 是 endpoint failover 配置，明确不在移除范围。

## Risks / Trade-offs

- [setup 的多 repository 写入不是事务] → setup 永不公开；promotion/cleanup 设计为幂等，并对“模型已写入、promotion 未完成”建立测试。
- [自动添加错误模型会导致错误协议调用] → 仅对 `apiFormat` 兼容的 Official Catalog 精确 ID 自动添加；所有 alias 进入显式编辑。
- [删除最后模型的并发/陈旧 UI] → repository 提供原子“删除后至少保留一条”边界，application command 做最终检查，UI 禁用仅是辅助反馈。
- [移除 `enabled` 触及执行热路径] → provider admission、readiness、测试 fake、UXP/Chrome adapters 同批更新，并用 admission contract 验证。
- [取消清理可能删除用户刚输入的 secrets] → cleanup 仅接受 setup Profile id；ready Profile 永不走该路径。

## Migration Plan

1. 扩展 Profile persistence 与 application command contracts，先建立 setup/ready 隔离、cleanup 与不变量测试。
2. 接入 Add/Profile Models/Model Configuration 的创建路由和 completion callback。
3. 收敛 AppShell active selection 与 Composer/Provider backend 显式模型约束。
4. 删除 `enabled` 字段和所有分支，更新 fakes、adapters、tests 与 canonical engineering context。
5. 运行 targeted harness，再运行 `pnpm validate`。实现失败时不将 setup Profile 提升为 ready；回滚仅需移除新 lifecycle records，当前状态仓库无需生产数据迁移。

## Open Questions

无。新建完成时仅在当前 active Profile 为空才自动激活，作为本变更固定行为。

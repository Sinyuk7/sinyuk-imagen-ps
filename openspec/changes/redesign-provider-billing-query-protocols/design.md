## Context

当前 billing 查询链路把配置、UI 和 provider 适配耦合在 `mode: 'none' | 'official' | 'new-api'` 这套结构里，导致系统难以表达两类更常见的 relay 场景：复用当前 profile 的 `apiKey` 查询余额，以及使用单独 `billing token` 查询余额。与此同时，协议差异实际落在请求 method、path、鉴权位置与响应解析形状上，而不是落在 API format 或某个 provider family 本身上。

本次变更采用 current-state 前提：不兼容旧 billing 数据，不提供迁移路径，不维持旧 shape 的读写兼容。实现重点不是保护历史数据，而是建立一套更简单、可扩展、易测试的 billing query contract。

## Goals / Non-Goals

**Goals:**

- 用 source-based billing config 替换旧 `mode` 结构。
- 将 billing query protocol 抽到全局 registry，而不是挂在某个 provider descriptor 上逐个声明。
- 让每个 profile 独立保存 billing 查询参数、secret 引用与 `lastSuccessfulProtocolId`。
- 将 UI 收敛为 `Disabled`、`Use current API key`、`Use billing token` 三种用户可见模式。
- 让查询执行链支持隐藏 protocol fallback，并在成功后写回 `lastSuccessfulProtocolId` 与 `updatedAt`。
- 保持 `apiKey`、`billing token` 等 secret 继续走 `secretRefs/secretValues`，不进入 profile `config` 明文。

**Non-Goals:**

- 不实现旧 billing 数据迁移、兼容读取或自动修复。
- 不把 protocol 细节直接暴露成用户可见下拉项。
- 不引入任意自定义 HTTP 模板、脚本化表达式或用户可配置响应解析器。
- 不改变 generation request 的 API format `paths` 语义；billing `path` 与 generation `paths` 继续分离。

## Decisions

### 1. Billing 配置改为 per-profile source model

每个 profile 的 `config.billing` 改为 source-based shape：

- `disabled`
- `profile-api-key`
- `billing-token`

其中：

- `profile-api-key` 只保存 `path` 与 `lastSuccessfulProtocolId`
- `billing-token` 保存 `path`、`userId?`、`tokenSecretRef` 与 `lastSuccessfulProtocolId`

这样 UI 与持久化结构都围绕“凭证来源”建模，而不是围绕某个历史协议名建模。

选择原因：

- 用户理解成本最低。
- 与真实 relay 文档更贴近。
- 避免 `new-api` 这类协议名上浮成产品主抽象。

备选方案：

- 继续使用 `mode` 扩展更多枚举值：会把协议名直接污染产品模型，不采用。
- 在 UI 直接暴露 protocol 选择：用户需要理解过多协议细节，不采用。

### 2. Billing protocol 使用全局 registry，不按 provider descriptor 声明

系统内置全局 protocol registry，首批协议为：

- `credits-api-key-json-v1`
- `credits-token-json-v1`
- `new-api-user-bearer-v1`

每个 protocol 定义：

- 适用 `source`
- 请求 method / path 解析方式
- header/body 构造规则
- 响应解析规则

profile 的 billing 查询只依赖当前 profile 的 source、path、secret 与 `lastSuccessfulProtocolId`，不再依赖 `Gemini Generate Content` 或其他 provider descriptor 单独声明允许哪些协议。

选择原因：

- billing query 是跨 relay 的通用能力，不应再由 provider family 静态约束。
- 减少“某个 provider family 允许 A/B/C”的重复声明。
- 后续扩协议时只改 registry 与查询链，不需要同步改每个 descriptor。

备选方案：

- 继续由 provider descriptor 声明 supported protocols：会把 relay 协议差异错误地绑定到 provider family，不采用。

### 3. 查询执行链采用“profile 配置 + hidden protocol fallback”

执行顺序：

1. 读取当前 profile 的 billing config。
2. 根据 `source` 取出候选 protocol 集合。
3. 若存在 `lastSuccessfulProtocolId`，放到第一优先级。
4. 其余 protocol 按 registry 默认顺序尝试。
5. 首个成功 protocol 立即返回结果。
6. 若成功 protocol 与持久化 hint 不同，则写回该 profile 的 `lastSuccessfulProtocolId` 并更新 `updatedAt`。
7. 全部失败才向用户返回最终错误。

中间失败只作为内部 attempt evidence，不逐条上浮给 UI。

选择原因：

- 保持用户侧简单。
- 支持 protocol 扩展，而不要求用户理解兼容细节。
- 命中后可逐步收敛到稳定 protocol，减少后续无效尝试。

备选方案：

- 每次固定尝试所有协议且不记忆成功项：会重复发送多余请求，不采用。
- 只允许用户显式选择 protocol：增加 UI 复杂度，不采用。

### 4. `lastSuccessfulProtocolId` 直接持久化到 profile，并更新 `updatedAt`

成功命中 protocol 后，直接保存到当前 profile 的 `config.billing.lastSuccessfulProtocolId`，并更新 profile `updatedAt`。

选择原因：

- 简单直接，不需要额外 runtime-only metadata store。
- 跨会话可复用。
- 与当前 current-state 目标一致，允许“查询行为”影响 profile 元数据。

约束：

- `billingConfigFingerprint` 不得把 `lastSuccessfulProtocolId` 计入配置指纹；否则 hint 更新会无意义地清空余额缓存。

备选方案：

- 只保存在 runtime 内存：跨会话失效，不采用。
- 单独新增 metadata repository：超出本次目标，不采用。

### 5. Secret 统一收敛为 `apiKey` 与 `billingToken`

`Use current API key` 直接复用 profile 已有 `apiKey`。

`Use billing token` 使用单独 `billingToken` secret：

- profile `config.billing` 只保存 `tokenSecretRef`
- UI draft 只在编辑时持有明文 token
- `removedSecretNames`、`secretValues` 统一使用 `billingToken`

选择原因：

- 保持 secret 继续走既有 `secretRefs/secretValues` contract。
- 删除 `billingAccessToken` 这类旧协议导向命名。

### 6. 旧 billing shape 直接删除并拒绝

移除旧 `mode: 'official' | 'new-api'` 结构、旧 UI draft 和旧 schema 分支。若 profile 数据仍携带旧 billing shape，系统直接按无效配置处理，不提供兼容读取或迁移。

选择原因：

- 用户已明确要求不兼容旧数据。
- current-state 下直接删除旧 shape 比双轨维护更简单、更干净。

## Risks / Trade-offs

- [协议链扩展过快] → 通过 `source` 分组限制候选集，避免 profile-api-key 与 billing-token 混试。
- [中间失败全部吞掉后排查困难] → 在内部 diagnostics / tests 中保留 attempt evidence，但 UI 只显示最终失败。
- [`lastSuccessfulProtocolId` 写回触发 profile 变更语义] → 明确接受“余额查询成功会更新 profile metadata”，并在设计中写死该行为。
- [旧 billing 数据直接失效] → current-state 下接受该 breaking change，并在 proposal / spec / tasks 中明确不提供迁移。
- [billing hint 写回污染缓存] → 调整 billing fingerprint，排除 `lastSuccessfulProtocolId`。

## Migration Plan

本次不做旧数据迁移。

实现步骤上：

1. 删除旧 billing mode contract、draft、schema 与 helper。
2. 引入新的 source-based billing config 与 protocol registry。
3. 替换 add/edit 页面 UI 与保存逻辑。
4. 改写 runtime billing secret 解析与 queryBalance 执行链。
5. 更新 deterministic tests。

回滚策略：

- 若变更未发布，直接回退代码。
- 若已发布，回滚到旧代码即可；由于本次不承诺旧数据兼容，回滚后新写入 billing 数据不保证可读。

## Open Questions

- 首批 protocol 默认顺序是否固定为 registry 顺序，还是要在 path 命中某些已知前缀时提升对应 protocol 优先级；本次实现可先固定顺序，后续再增 path hint 优化。

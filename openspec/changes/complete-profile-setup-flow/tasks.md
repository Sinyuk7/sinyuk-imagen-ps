## 1. Application Profile 完成态

- [ ] 1.1 扩展 `ProviderProfile`、Profile repository 与 command contracts，表达内部 `setup` / `ready` lifecycle，并从公开 Profile projection 移除 `enabled`。
- [ ] 1.2 实现创建 orchestration command：保存合法 setup Profile 后，按 owned model、endpoint `wireModelId` hint 与 Official Catalog 精确匹配返回 ready、Model Configuration seed 或 Profile Models seed。
- [ ] 1.3 实现 setup promotion、取消清理与启动恢复清理；处理 secrets、Model Config 已写入但 promotion 未完成的幂等边界。
- [ ] 1.4 让 `listProviderProfiles()` 和 active Profile 读取边界只公开 ready Profile；保留创建路由对 setup Profile 的受限读取。
- [ ] 1.5 更新 `saveUserModelConfig()` 的完成回调，使首个成功模型配置可以提升 setup Profile；保持 Model Config 的 Profile-owned 边界不变。

## 2. 模型与生成不变量

- [ ] 2.1 为 Model Config repository 增加原子“删除后至少保留一条”边界，并让 `deleteUserModelConfig()` 以稳定 validation error 拒绝删除最后一个模型。
- [ ] 2.2 令 Provider admission、connection test 和 Profile test 都只接受显式 `modelId`，删除所有 `UserModelConfigRepository.list()[0]` fallback，并保证未提供模型不产生 provider request。
- [ ] 2.3 从 Profile 保存、config resolver、Provider readiness、adapters、fakes 与 tests 移除 profile-level `enabled` 语义；读入兼容遗留值，并保留 `connection.endpoints[].enabled` failover 语义。
- [ ] 2.4 确认 endpoint hint 的自动添加只覆盖 apiFormat-compatible Official Catalog 精确匹配；未知 alias 一律返回模型编辑 seed。

## 3. Profile 设置交互

- [ ] 3.1 将 Settings Add 主操作改为 `Continue`，消费 application outcome，且仅在 ready 后显示创建成功或更新公开 Profile/active state。
- [ ] 3.2 接入 setup Profile 的 Model Configuration / Profile Models 路由、首模型保存 completion 与取消/返回清理；不新增用户可见待配置页面或状态。
- [ ] 3.3 将 Settings Detail 收敛为 ready Profile 的 `Save | Delete`；保存编辑不改变 active Profile，endpoint hint 仅服务于显式新增模型。
- [ ] 3.4 更新 AppShell active Profile 规则：显式选择保持现状；仅在没有 ready active Profile 时于新建完成后激活；删除 active Profile 后选择 ready 替代项或清空。
- [ ] 3.5 更新主界面 Composer：没有显式模型时保持 `select-model` readiness；删除 UI 模型首项静默回退，并保留当前会话级选择而不持久化 default model。
- [ ] 3.6 在模型编辑 UI 对最后一个模型提供预防性反馈，但以 application command 的拒绝结果作为最终权威。

## 4. 双宿主持久化与验证

- [ ] 4.1 更新 UXP 与 Chrome Profile/secret/Model Config persistence adapters，使 lifecycle、setup cleanup 与 active Profile 只处理 ready Profile。
- [ ] 4.2 添加 application contract tests：创建 outcome 分流、setup 可见性、cleanup/promotion 幂等、精确 Catalog 自动添加、未知 alias seed、最后模型删除拒绝、显式模型 admission 与无 `enabled` 分支。
- [ ] 4.3 添加 shared UI/AppShell tests：Continue 路由、取消清理、首模型完成、编辑不抢 active、无模型不能发送、删除最后模型反馈。
- [ ] 4.4 更新 Chrome/UXP adapter contract tests，覆盖 restart cleanup、ready-only active persistence 和 secrets 不泄漏。
- [ ] 4.5 运行 targeted application/app tests、`pnpm check:policy` 与 `pnpm validate`；必要时执行受控 Chrome live-provider connection smoke，但不将其作为创建完成证明。

## 5. Canonical writeback

- [ ] 5.1 更新 `docs/ENGINEERING_CONTEXT.md`，记录 ready Profile 定义、setup 内部边界、显式模型提交与无 `enabled` 语义。
- [ ] 5.2 更新 `docs/TESTING.md`，记录本变更的 contract/harness 入口与“连接测试不证明生成”的验证边界。

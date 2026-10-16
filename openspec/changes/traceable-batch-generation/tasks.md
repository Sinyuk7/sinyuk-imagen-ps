## 1. Contract 与共享资源

- [x] 1.1 定义 Batch、child Task、minimal Task status、remote execution facts 和 remote output record 的 host-neutral contract。
- [x] 1.2 扩展 Task schema 与 decoder，保存 remote task ID、remoteStatus、remote outputs、submission-unknown 和 discarded 事实，并保持 secret-free 校验。
- [x] 1.3 定义共享 AssetStore/cache reference 与内容 hash 去重规则，补充 source image、Mask 和 provider input derivative 的引用生命周期；active/running Task 引用不得被清理。
- [x] 1.4 为 batch/task/resource contract 建立 deterministic fake、builder 和 persistence fixtures。

## 2. Provider 远程生命周期

- [x] 2.1 将 GRSAI adapter 拆分为 submit、poll、remote result normalization，持久化 `id`、`status`、`results[].url` 和 response diagnostics。
- [x] 2.2 将 RunningHub Standard Model adapter 拆分为 upload、submit、poll、remote result normalization，复用 catalog endpoint、`imageUrls`、`maskUrl` 和 `/openapi/v2/query`。
- [x] 2.3 为两个 adapter 增加 submit timeout 的 no-resubmit 语义；收到 remote ID 后只允许继续 poll 同一 ID。
- [x] 2.4 将下载从 provider protocol parsing 中分离为独立 materializer，但在正常执行 poll 成功后自动调用它并写入 AssetStore。
- [x] 2.5 增加 active-batch RunningHub upload promise dedup，不跨重启持久化临时 upload URL。
- [x] 2.6 增加 provider fixtures/fakes，覆盖多结果 URL、URL 过期、HTTP/JSON 异常、下载内容非图片、poll timeout 和 submission unknown。

## 3. 并发 Batch Application

- [x] 3.1 实现默认 10、范围 2–100 的 active slot admission；原子预留整批容量，batch 超过当前可用槽位时拒绝整批并返回等待错误。
- [x] 3.2 实现 batch child Task 独立 dispatch、独立 remote facts、独立失败和独立 slot release。
- [x] 3.3 删除或改写 pending queue 语义，确保 rejected batch 不创建 Task、不调用 provider、不留下半批次记录。
- [x] 3.4 实现本地 cancellation：停止本地 poll/download、标记 `discarded`、释放 slot，禁止服务端 cancel 和 submit retry。
- [x] 3.5 增加 application contract tests，覆盖 3 个并发任务、容量不足、超大 batch、单任务失败、取消后远程继续运行和 submit unknown。

## 4. 重启与主动置入

- [x] 4.1 实现插件启动时的轻量内部 Recovery：扫描持久化 `running` Task，对有 remote ID 的任务最多启动一次既有 poll/download 流程；不重新 submit、不自动置入，Recovery executor 计入 active slot。
- [x] 4.2 删除手动 `refresh remote status` 入口和相关 UI/契约；无 remote ID 的 `submission-unknown` 不自动恢复。
- [x] 4.3 实现用户主动置入时的单次 on-demand resolver：local Asset 优先，其次 remote URL download，最后 remote ID query 一次；正常执行期仍自动下载。
- [x] 4.4 将 Photoshop placement 收敛为当前 document + 既有 placement strategy；原始 layer 和 Mask 缺失不阻止置入，并由 host adapter 拥有 `executeAsModal`。
- [x] 4.5 增加 restart-recovery/placement action contract tests，覆盖当前文档置入、无文档失败、URL 过期、原始 layer/mask 删除、已有 Asset 快速路径、Recovery 单次启动和主动置入单次查询。

## 5. UI、清理与验证

- [x] 5.1 更新历史 UI 和 batch progress projection：仅用 batchId 做轻量关联，不引入用户可编辑 batch label；展示 child Task 独立状态、多结果 output 的逐项操作、等待提示、submission unknown、远程结果不可用和 discarded，不添加 `ready-to-place` 状态；completed 明确表示 provider result 已记录。
- [x] 5.2 删除或改写旧的 provider async manager、terminal projection、自动下载和旧单任务生命周期测试；保留仍适用的 TaskStore/AssetStore/placement contract。
- [x] 5.3 更新 `docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md`、`packages/providers/AGENTS.md` 和 README 的轻量追踪、缓存、并发和置入边界。
- [x] 5.4 增加 signed URL redaction、network domain 和 UXP placement boundary 的 deterministic contract checks。
- [x] 5.5 运行 providers/application affected tests、Chrome harness、TypeScript build、`pnpm check:policy` 和 `pnpm validate`。
- [ ] 5.6 运行 `pnpm release:verify`；真实 Photoshop/UXP 置入验收记录为 user-owned gate，不由 agent 自动执行。

## Context

当前 GRSAI 与 RunningHub adapter 已经能够构造请求、提交异步任务、轮询并下载图片，但 Application 生命周期把这些步骤作为一次连续执行处理。参考 `ComfyUI-Sinyuk-Nodes/sinyuk_nodes/features/image_api`，provider 协议已经明确：GRSAI 使用 `/v1/api/generate`、`/v1/api/result` 和 `results[].url`；RunningHub 固定使用 Standard Model API `/openapi/v2/...`、`/openapi/v2/query`、`/openapi/v2/media/upload/binary` 和 `results[].url`。

本变更优先解决可追溯性和多个独立生成任务的用户体验。设计接受远程 URL 过期、submit 响应丢失和用户不及时置入造成的资源丢失；插件重启只执行一次轻量、尽力而为的内部 Recovery，不建设长期后台恢复系统。Photoshop 只在用户主动点击置入时参与，不成为 provider 执行链的 owner。

## Goals / Non-Goals

**Goals:**

- 一次提交可包含多个互不影响的 child Task；每个 Task 独立保存请求、remote task ID、远程状态和结果 URL。
- 通过固定并发槽位限制同时执行的 Task；默认 10，允许 2–100；容量不足时整批立即拒绝并提示等待。
- 共享输入图片和 Mask 的 durable AssetStore/cache 引用，按内容或稳定引用去重。
- 把远程结果记录与结果下载、AssetStore 物化、Photoshop 置入分开，但正常执行期间在 poll 成功后自动下载并物化，保持现有体验。
- 本地取消只丢弃本地关注，不调用服务端取消，不重试 submit。
- 重启后由内部 Recovery 尝试恢复有 remote task ID 的未完成任务及尚未下载的结果；不提供手动 refresh，不自动置入。
- 置入默认使用当前文档和现有 placement 策略，不要求原始图层或 Mask 仍存在。

**Non-Goals:**

- 不支持本地等待队列、自动补槽、后台无限 poll、自动重新 submit 或服务端 cancel。
- 不把 provider 的 `QUEUED`、`RUNNING`、`SUCCESS` 等状态扩展成公共状态枚举。
- 不保证远程 URL 长期有效，不实现 URL 过期后的 provider 恢复或用户手动 refresh 功能。
- 不在生成完成后自动置入，不引入 `ready-to-place` 状态。
- 不支持 RunningHub 传统 `/task/openapi/...` 协议；只支持参考实现采用的 Standard Model API。

## Decisions

### 1. Admission 先检查整批容量

Application 维护当前进程内 active executor 数量。提交 batch 前以原子方式检查并预留 `active + batchSize <= maxConcurrency`；失败时返回明确的等待错误，不创建 Task、不占用槽位、不调用 provider。默认 `maxConcurrency=10`，配置范围为 2–100。Batch 是一次性启动的一组并发任务，不能超过当前可用槽位；本地取消或明确终态后立即释放槽位。该槽位只约束本地 executor，不代表 provider 端实际并发。

替代方案是建立 pending queue，但这会引入排队持久化、重启恢复和半批次失败语义，与轻量目标冲突。

### 2. 公共状态最小化与 output availability 分离

Task 公共状态只有 `running`、`completed`、`failed`、`discarded`。`running` 表示本地 executor 仍在 submit、poll 或执行期自动下载；`completed` 表示 provider 已返回成功结果且所有 remote output 已经落盘，不表示每个 output 当前一定有本地 Asset。每个 output 独立保存 remote URL、可选本地 Asset ref 和最近一次下载结果。provider 原始状态只放在 `remoteStatus` 诊断字段。submit 超时且没有 remote ID 记录为 `failed`，并带 `submission-unknown` 错误码；系统不得自动重试。

### 3. Remote result 与 materialized asset 分离

Task 的 `remoteOutputs` 保存 provider 返回的 URL、结果索引、观察时间、provider metadata 和可选过期提示。正常执行期间 poll 成功后立即写入 remote outputs，然后自动下载每个 URL 并尽力写入共享 AssetStore；下载失败不会抹掉远程结果记录，也不会重新生成。重启时，内部 Recovery 对有 remote task ID 的持久化 running Task 复用同一 submit/poll/download 流程，最多启动一次恢复执行；没有 remote ID 的任务不重提。Recovery 不执行 Photoshop 置入，也不提供用户可见的刷新入口。

替代方案是 provider adapter 直接返回 bytes，但会让 URL 追踪丢失，并把下载失败错误地等同于生成失败。

### 4. 共享输入资源

Batch 创建时将 source image、Mask 和 provider input derivative 物化到共享 AssetStore/cache；child Task 只保存 `TaskResourceRef`。缓存 key 使用内容 hash 或已有稳定 ref，命中时复用同一资源。Task 之间不复制图片字节。

### 5. 本地取消与远程执行解耦

本地 AbortSignal 终止当前 adapter 等待、poll 和下载，并将 Task 标记为 `discarded`。若取消与 submit 响应竞态发生，晚到的 remote ID 仍可写入 discarded Task，但不得继续 poll/download。服务端任务可以继续执行；后续结果不自动查询、不自动下载、不重新提交。该选择明确接受远程费用和结果丢失风险。

### 6. 轻量重启 Recovery 与主动置入

插件启动先读取 TaskStore 和 AssetStore 引用。持久化的 `running` Task 不在扫描时占用新会话 slot；对有 remote task ID 的 Task，内部 Recovery 尽力启动一次既有 poll/download 执行，启动后的 executor 按普通 active slot 计数，并受同一 `maxConcurrency` 限制。Recovery 不重新 submit、不调用 provider cancel、不自动置入；没有 remote ID 的 `submission-unknown` 不可恢复。若 Recovery 因容量或 provider/URL 失败而结束，保留原 Task、remote facts 和错误摘要，不创建 pending queue，也不提供手动 refresh 按钮。

用户点击置入时按以下顺序执行一次：优先使用本地 Asset；无本地 Asset 但有 remote URL 时尝试下载；只有 remote ID 且该 Task 仍可恢复时查询一次并尝试下载；没有可用资源则显示失败。置入目标由当前 Photoshop 文档和既有 placement 策略决定，原始 layer/mask 是否存在不参与判断。主动置入不触发新的后台轮询或重新生成。

### 7. Provider 上传复用与边界

参考 `batch_runner.py` 的 active-run digest promise dedup，同一 active batch 内相同输入允许复用同一个 RunningHub upload promise/URL；不跨重启持久化 upload URL。URL 只用于当前 submit，不作为长期 Task resource。共享本地资源的清理必须保留 active/running Task 引用。

### 8. Provider 边界复用参考实现

GRSAI 与 RunningHub 请求构造、catalog endpoint、上传字段、Mask 字段和结果解析复用当前 catalog 及参考实现逻辑。新 Application contract 只新增 submit/poll/remote result 记录边界，不暴露 provider raw request 到公共 UI。

## Risks / Trade-offs

- [Submit 超时后远程任务可能已创建] → 保存 `submission-unknown` 失败记录，禁止自动重试；允许用户接受一次结果丢失。
- [RunningHub CDN 约 24 小时、GRSAI URL 有未确认的短期有效期] → 结果 URL 立即落盘，用户主动置入时尽快尝试下载；过期视为正常可见失败。
- [并发值 100 可能触及 provider 限额] → 本地只保证 2–100 的配置合法，provider 限额通过普通失败返回，不建立第二套调度器。
- [多个 Task 共享缓存时误删资源] → AssetStore 按引用保留，清理逻辑必须在没有任何 Task 引用时才删除；active batch 的 upload promise 只在进程内复用。
- [UXP manifest 不允许结果 CDN 域名或重定向] → 下载 adapter 使用 manifest 允许的 network domains；域名不允许时记录 bounded download error。
- [签名 URL 出现在日志] → 原始 URL 只供 materializer 使用，普通 diagnostics 和 UI 只保存去 query/hash 后的安全 URL 摘要或 host/path。
- [下载期间用户切换 Photoshop 文档] → host placement 在用户点击时使用当前 document，并由 UXP adapter 自己拥有 `executeAsModal` 边界。
- [当前文档与原始文档不同] → 置入只依赖当前文档和现有 placement 计算，明确不保证还原原始图层位置。

## Migration Plan

1. 先定义 Batch、child Task、remote output 和共享 AssetStore 引用的 contract/fake。
2. 将 provider lifecycle 改为 submit/poll/record remote result，下载移动到独立 materializer。
3. 在 Application 加入整批 admission 和 active slot 释放逻辑。
4. 改写 TaskStore schema、历史视图和主动置入动作；删除旧的自动下载/终态绑定测试。
5. 增加 deterministic provider、batch、cache、restart-on-demand 和 placement contract tests。
6. 通过 providers/application affected tests、Chrome harness、TypeScript build、`pnpm validate` 和 policy checks；真实 Photoshop/UXP 验收仍由用户执行。

## 9. Batch 与多结果 UI 决策

Batch 不提供用户可编辑或必须展示的 batch label。持久化的 `batchId` 只用于 child Task 关联、批次进度汇总和故障排查；历史 UI 可以按 batchId、提交时间、provider 和 model 做轻量分组，不增加独立的 Batch 管理对象或命名流程。

一个 Task 返回多个 `results[]` 时，UI 按稳定结果索引逐项展示每个 output，并允许用户单独执行置入。单个 output 的下载失败或置入失败不得阻止同一 Task 的其他 output，也不得改变其他 child Task 的状态。底层仍只保留一个 child Task 和多个 remote output record。

`submission-unknown` 的公共状态仍为 `failed`，UI 必须显示：“提交结果未知，服务端可能已经创建任务；系统不会自动重试。”该文案解释提交不确定性，不把它描述成已确认的 provider 生成失败。

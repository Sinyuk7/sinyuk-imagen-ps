## Why

当前 provider 生成链把 submit、poll、结果 URL 下载和 Photoshop 置入绑定在同一条流程中，导致一次提交的远程执行事实无法独立追踪，也无法轻量地处理多个互不影响的生成任务。GRSAI 与 RunningHub 的结果 URL 有效期有限，插件关闭、网络失败或用户稍后置入时都可能丢失资源，因此需要先可靠记录远程结果，再按用户需要下载和置入。

## What Changes

- 增加 Batch 与独立 child Task 模型，支持一次提交多个互不影响的 provider 生成任务。
- 增加固定并发槽位 admission；默认并发数为 10，可配置范围为 2–100；槽位不足时立即拒绝整批提交并提示等待，不建立本地排队任务。
- 将 provider submit、poll、远程结果记录、本地 AssetStore 物化和 Photoshop 置入拆成可追踪边界；正常执行期间仍保持 poll 成功后自动下载图片的现有体验。
- 为每个 Task 持久化 provider、model、请求摘要、remote task ID、远程状态、结果 URL、URL 观察时间、错误摘要和本地 Asset 引用。
- 通过共享 AssetStore/cache 引用复用相同输入图片和 Mask，不为同一输入复制三份资源。
- 将本地取消定义为放弃本地任务；不调用服务端取消，不重试 submit，不等待或下载远程结果。
- 插件重启后由内部 Recovery 尽力恢复有 remote task ID 的未完成任务及尚未下载的结果；不提供手动 refresh，不自动置入。无法恢复时保留任务历史和错误信息。
- Photoshop 置入默认使用当前文档和现有 placement 策略；不要求原始图层或原始 Mask 仍然存在。
- **BREAKING** 删除或改写把 provider 远程状态、下载完成和置入完成混为一个生命周期的旧测试与契约，新增轻量 batch/trace/result materialization contract tests。

## Capabilities

### New Capabilities

- `traceable-provider-generation`: provider submit/poll/result URL 的可追溯记录和统一远程结果契约。
- `bounded-generation-batches`: 固定并发槽位、批量 admission、共享输入缓存和独立 child Task 执行。
- `on-demand-output-materialization`: 远程 URL、本地 AssetStore 和用户主动下载/置入之间的轻量边界。
- `lightweight-photoshop-placement`: 基于当前文档和既有 placement 策略的主动置入及失败处理。
- `unified-image-generation`: provider 生成从单任务同步物化改为可追踪的独立远程结果和按需物化流程。

### Modified Capabilities

无。本仓库当前没有已发布的主 spec；相关行为作为本变更的新 capability 建立。

## Impact

- 影响 `packages/application` 的 generation/session、TaskStore、AssetStore 和并发 admission。
- 影响 `packages/providers` 的 GRSAI/RunningHub lifecycle adapter、结果解析和下载边界。
- 影响 `apps/app` 的 task history、主动置入动作、共享输入缓存和 Chrome contract harness。
- 需要重写旧的 provider async、terminal projection、下载和 placement 测试；不要求真实 Photoshop/UXP 自动验收。
- 不改变参考项目已经确定的 provider 协议：GRSAI 使用 `/v1/api/generate` 与 `/v1/api/result`，RunningHub 使用 `/openapi/v2/...` 与 `/openapi/v2/query`。

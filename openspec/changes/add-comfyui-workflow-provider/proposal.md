## Why

当前 Provider 体系只支持预定义 API 协议与远端 model catalog，无法把用户自己的 ComfyUI 服务和 API Format workflow 作为图像生成后端。需要在不暴露 `nodeId` / `inputName` 手工 binding、不把 workflow 语义泄漏到 UI 的前提下，让现有 profile、configured model、Composer 与任务结果链支持 ComfyUI 的文本、保序多图、蒙版和多图输出。

## What Changes

- 新增 `comfyui` API format 与 Provider descriptor。一个 `ProviderProfile` 表示一台 ComfyUI 服务，v1 只允许一个启用的 manual endpoint，`connection.endpoints[0].url` 保存服务 base URL，并支持无生成成本的连接与能力探测。
- 把每份已导入且通过校验的 API Format workflow 表示为当前 profile 拥有的一个 configured model，继续复用现有模型 selector、profile ownership 与 dispatch resolution。
- 为每份 workflow 计算稳定 `workflowRevision`；queued/durable request 只冻结 revision，不保存 raw workflow。dispatch 必须重新读取同一 profile-owned config 并校验 revision，禁止配置替换后让旧任务静默执行新 graph。
- v1 不假设 ComfyUI 服务能枚举用户全部 workflow。用户显式导入 API Format JSON；刷新只重新校验当前 profile 已配置的 workflow，不把临时发现结果直接放入模型 selector。
- 定义无需用户填写 binding 的 workflow marker contract：唯一 prompt marker、连续编号的 image input markers、唯一 designated output marker。Provider 从 workflow `_meta.title` 解析内部 `nodeId + inputName` binding。
- 不要求整个 workflow 只有一个 `SaveImage`。v1 要求恰好一个 `IMAGEN_PS_OUTPUT` designated node，其他 output node 可以存在但不作为插件结果；designated node 返回的 `images[]` 可包含一张或多张结果图。
- 把 canonical `images[]` 按顺序绑定到独立 `LoadImage` input slots：第一张是 primary image，后续图片是 reference inputs。v1 workflow 声明的 image slot 数量就是该 configured model 的精确输入图数量。
- 复用独立 `maskImage` contract 表示 primary image 的蒙版。Provider 使用 ComfyUI image/mask upload 语义生成带 alpha 的 primary input；普通 reference image 不与 mask 混用，也不依靠附件位置猜测类型。
- 增加 ComfyUI transport：上传输入、提交 `/prompt`、等待完成、从 designated output 的 history `images[]` 解析结果，并通过 `/view` 获取资产。v1 不启用 endpoint failover，也不自动重放已接受的 prompt。
- 在 Composer 增加最小输入角色反馈：保留 ordered image attachments，并提供独立 mask 入口/标识；App 必须先调用 Application preflight，再写 task record，Application runtime 仍在 queue/provider 边界重复校验。
- 建立 mock/fake harness，覆盖 workflow 校验、上传与 node injection、异步完成、单节点多图结果、错误归一化、abort 与 UI request mapping。真实 ComfyUI 验证保持 opt-in/manual，不进入默认测试。

## Capabilities

### New Capabilities

- `comfyui-provider-runtime`: 定义 ComfyUI profile 连接、无生成探测、输入上传、prompt 提交、异步完成、结果下载、endpoint affinity、abort 与错误归一化。
- `comfyui-workflow-contract`: 定义 API Format workflow import、marker 解析、输入数量、primary/reference/mask 语义、designated output、多图结果与静态/运行时校验。
- `comfyui-workflow-model-integration`: 定义 workflow 作为 profile-owned configured model 的 identity、持久化、导入/刷新、选择、capability reconciliation 与 Composer 反馈。

### Modified Capabilities

- 无。当前 `openspec/specs/` 没有已同步 main specs；本 change 以新增 capability 记录契约，并在实现前复核 `profile-owned-model-configs` 与 `improve-provider-endpoint-url-flow` 的归档状态。

## Impact

- `packages/providers`：新增 `comfyui` descriptor/config schema、workflow validator、request builder/transport、history response parser、diagnostics/error mapping 与 family-local contract cases。
- `packages/application`：新增 ComfyUI workflow configured model 的 profile mapping、持久化 payload、capability reconciliation、dispatch 前输入校验，以及 canonical `images[]` / `maskImage` 到 Provider request 的映射。
- `apps/app`：Profile Models flow 增加 API Format workflow import/revalidation；Composer 增加输入 slot/角色反馈与独立 mask 表达；现有 profile/model selector 继续作为主选择入口。
- 持久化：workflow JSON 与解析出的稳定 metadata 属于 profile-owned model config；secret、绝对路径、临时 upload filename、`prompt_id`、history payload 与 provider output 不进入该配置。
- 网络与生命周期：ComfyUI 服务通常是本机或局域网 HTTP/WebSocket 服务；UXP/Chrome adapter 必须遵守现有 network、abort、asset store、logging 与 durable task 边界。
- 依赖关系：本 change 建立在 `profile-owned-model-configs` 与 `improve-provider-endpoint-url-flow` 的 current-state 产品语义上，不重新引入全局模型 ownership、persisted default model 或 full endpoint model hint 语义。

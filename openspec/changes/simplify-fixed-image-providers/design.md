## Context

当前 `packages/providers` 使用 `ApiFormat`、implementation ID、`ProviderProfile`、`UserModelConfig`、`ProviderDefaultModelTemplate`、`OfficialModelPreset` 和 `ImageOutputMatrix` 共同表达 provider、模型、协议和输出能力。该设计适用于可扩展的通用 API 接入，但当前产品只需要固定的 `GRSAI` 与 `RunningHub`，并且用户不会保存同一 provider 的多组账号。

参考 `ComfyUI-Sinyuk-Nodes/sinyuk_nodes/features/image_api`，新设计将 `runninghub_catalog.json` 与 GRSAI 的模型/参数配置复制或同步到当前仓库的 `packages/providers/catalog/`。目录是发布物的一部分，运行时只读并在加载时校验。模型参数直接决定主页面的最小选择控件和 provider 请求值。

## Goals / Non-Goals

**Goals:**

- 每个固定 provider 只有一份账号凭据，更新 API Key 即覆盖当前值。
- 以本地 catalog 直接驱动 provider/model 列表、基础参数选项、默认值和参数校验。
- 将 GRSAI 和 RunningHub 的请求字段、上传、异步提交、轮询、下载和响应解析封装在 provider adapter 内。
- 统一公共生成意图、异步任务调度、错误、Asset、History、Preview、Download 和 Photoshop placement。
- 以 provider 返回图片的真实 width/height/format 作为唯一输出事实。
- 保持 ComfyUI workflow、Bridge、Queue、Photoshop 输入和 Mask 的既有 owner 边界。

**Non-Goals:**

- 不在本变更中增加高级参数面板；catalog 可以为后续面板保留参数 schema。
- 不保留多 Profile、同 provider 多账号、用户可编辑模型目录、远程模型发现或输出矩阵。
- 不把 `replyType`、provider endpoint、上传 URL、轮询 token 或 provider raw payload 暴露到公共生成契约。
- 不改变 ComfyUI workflow 参数映射和连接切换语义。
- 不主动执行真实 Photoshop 或 UXP Developer Tool 验收。

## Decisions

### 1. 固定 provider 与单账号存储

公共 provider identity 只允许 `grsai` 和 `runninghub`。Host storage 使用 provider keyed account record，例如 `{ providerId, apiKey, updatedAt }`；保存操作是按 provider 的 upsert。产品删除 Profile 列表、Profile lifecycle、profileId 关联和 Profile-specific model storage。

Alternative：保留一套通用 Profile schema。放弃，因为它继续要求 UI、Application、repository 和测试维护无产品需求的多实例生命周期。

### 2. Catalog 作为唯一模型与参数 authority

`packages/providers/catalog/grsai.json` 与 `packages/providers/catalog/runninghub.json` 是静态发布资源。每个模型至少声明稳定 `id`、展示名、支持 operation、输入限制和参数定义；参数定义支持有限的 choice/boolean/number 形式，但第一阶段主页面只渲染 choice 参数。catalog loader 负责 schema 校验、唯一性、默认值和跨字段约束。

GRSAI 可把尺寸组合展开为单个 choice，例如 `1:1 (1024x1024)`，并在请求 builder 中映射成 `aspectRatio` 和 `imageSize`。RunningHub 可保留独立 `aspectRatio`、`resolution` 选择。公共 UI 只消费 catalog projection，不理解 provider wire JSON。

Alternative：继续由 TypeScript capability matrix 手写模型。放弃，因为它重复了外部 catalog，并使增加模型必须修改多个包。

### 3. 最小公共生成请求

Application 接受 host-neutral `GenerationRequest`：`providerId`、`modelId`、`operation`、`prompt`、输入 Asset 列表、canonical Mask 和 catalog 参数值。请求不包含 `wireModelId`、`baseModelId`、`requestStrategyId`、endpoint、`replyType` 或 provider raw options。

Photoshop/App 负责将图层、选区和 Mask 转换为公共 Asset/Mask；provider adapter 在 dispatch 时决定 base64、multipart、远程上传或字段名称。

### 4. Provider adapter 与公共异步调度分离

每个固定 provider adapter 实现同一 host-neutral 生命周期：`validate`、`submit`、`poll`、`normalizeResult`。Application 继续拥有 jobId 去重、取消、轮询 timer、最大等待预算和 Task projection。

GRSAI adapter 固定发送 `replyType: "async"`，解析任务 ID 并轮询结果。RunningHub adapter 固定执行图片上传、按 catalog 模型选择 endpoint、提交和查询。提交调用开始后，未知结果不得自动重复提交。

### 5. 结果以实际图片尺寸为准

Provider result 只把真实返回的图片 Asset、可选文本、usage、diagnostics 和实际 metadata 交给 Application。`width`、`height`、format 从下载/解码后的图片事实取得；catalog 参数不生成预先可信的 Photoshop geometry contract。现有 placement 使用实际 Asset 尺寸和现有 document/frame evidence。

Alternative：保留完整 `ImageOutputMatrix` 并从参数投影 geometry。放弃，因为它会重新引入 matrix/cell、能力投影和 stale preference 复杂度，而实际结果已经是更可靠的事实。

### 6. ComfyUI 与 Photoshop 边界

ComfyUI 继续是独立 `GenerationBackend`，拥有 workflow JSON、Bridge、API Graph、Frontend Queue 和连接状态。Provider lane 与 ComfyUI 只在通用 Task、Asset、History 和资源动作处汇合。

Photoshop 输入采集、canonical Mask、源文档匹配、placement evidence 和写回仍由 `apps/app` host-neutral domain 与 UXP adapter 拥有；provider adapter 不调用 Photoshop/DOM。

### 7. Catalog 发布与同步

源 catalog 从参考项目复制到当前仓库，并记录来源与同步命令/检查。构建和 policy check 验证 JSON 可加载、无重复模型、默认值有效、所有模型至少有一个可用 operation。运行时不得读取兄弟仓库路径。

## Risks / Trade-offs

- [目录与上游配置漂移] → 将目录作为当前仓库发布源，增加 schema/fixture 校验，并在同步时人工审阅变更。
- [删除矩阵后 UI 选项组合错误] → provider catalog loader 与 request builder 做组合校验；主页面只渲染当前模型声明的选项。
- [返回图片缺少可解码尺寸] → provider result materialization 将此归为 bounded provider error，不伪造尺寸或 geometry。
- [RunningHub endpoint 变更] → endpoint 仅存在 RunningHub catalog/adapter，contract tests 固定请求体和上传流程。
- [现有 Profile 数据结构仍被 host adapter 使用] → 先切换 composition 和 harness，再删除 repository/ports；无生产数据迁移要求。

## Migration Plan

1. 增加 catalog 文件、loader、provider keyed account repository fake 和 contract tests。
2. 增加最小公共生成请求与 GRSAI/RunningHub adapter façade，先用现有 transport 实现请求和结果归一化。
3. 切换 Application backend、Chrome harness 和 UI 到固定 provider/account/catalog projection。
4. 切换 Photoshop provider lane 的输入/Mask materialization，验证实际返回尺寸驱动 placement。
5. 删除 Profile、UserModelConfig、matrix/capability projection、endpoint editor 和旧 exports。
6. 清理文档、fixtures、storage schema 与 policy allowlist，运行 affected tests、build、`pnpm check:policy`、`pnpm validate` 和 `pnpm release:verify`。

## Open Questions

- `auto grow`、`update` 等参数的确切 provider 字段和取值需要以当前 API 文档/参考项目实现为准；本变更只建立 catalog 扩展点，不在主面板承诺这些字段。
- RunningHub catalog 的完整模型清单和 GRSAI 配置文件最终文件名需要在实现前锁定，并由 catalog fixture 固化。

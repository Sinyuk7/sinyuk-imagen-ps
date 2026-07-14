## Context

当前系统用 `ApiFormat` 选择 Provider implementation，用 `ProviderProfile` 保存连接，用 profile-owned `UserModelConfig` 形成模型 selector，再由 Application 把 resolved model 注入 canonical image request。该链适合 catalog model，但 `UserModelConfig` 目前强制依赖 official preset、`wireModelId`、`requestStrategyId` 与 output matrix，不能直接保存一份 ComfyUI workflow。

ComfyUI 的执行对象不是传统 model ID，而是 API Format workflow。workflow 内部包含 node graph；插件只应控制少量公开输入并读取一个指定输出。Provider 必须负责 ComfyUI 协议、workflow 校验和 response normalization；Application 负责 profile-owned workflow model、选择与 canonical request mapping；App 负责 JSON 文件读取、附件角色与用户反馈。

参考实现 `comfyui-lumi-batcher` 证明 `nodeId + inputName` 是最终注入机制，也证明多个 output node 和单 output 多图都属正常行为；它不提供 workflow registry、语义化输入或 mask contract，因此只作为 transport/结果收集参考，不作为产品契约。

## Goals / Non-Goals

**Goals:**

- 一个 ComfyUI profile 对应一台服务；已导入 workflow 作为该 profile 的 configured model。
- 用户只提供 base URL、workflow JSON、prompt、ordered images 与可选 mask，不填写 node binding。
- v1 支持零图 text-to-image、精确 N 图 image-edit、primary image + references、primary mask，以及 designated output 的一张或多张图片。
- 默认验证完全使用 local parser、fake fetch 与 deterministic history fixtures；真实 ComfyUI、Chrome CORS 和 Photoshop UXP multipart 只作 release/manual evidence。

**Non-Goals:**

- 不发现或同步 ComfyUI 前端保存的全部 workflow。
- 不支持任意用户自定义 binding、任意 widget 参数、negative prompt、seed、sampler、checkpoint 或 workflow 参数面板。
- 不支持 optional image slots、动态 image slot 数量、多 mask、mask 指向 reference image、多个 designated output，或 custom output class。
- 不通过 WebSocket 跟踪进度，不调用全局 `/interrupt`，不承诺取消后终止已经在服务端运行的 prompt。
- 不验证或安装 workflow 依赖的 custom nodes/checkpoints，不把 ComfyUI workflow 当成远端 model discovery。

## Decisions

### 1. 新增独立 `comfyui` API format 和 Provider family

新增 `apiFormat: 'comfyui'`、独立 descriptor/config schema 和 builtin registry entry。Profile config 复用 canonical `connection`，但 v1 要求 `selectionMode: 'manual'`、恰好一个启用 endpoint；不要求 API Key，不复用 OpenAI/Gemini path classifier。

原因：一个 workflow 依赖特定服务的 custom nodes、models 和本地文件状态，多 endpoint failover 无法证明等价。把它伪装成 `openai-images` 会泄漏错误的 model、retry、billing 与 path 语义。

连接测试使用无生成副作用的 `GET /object_info/LoadImage` 与 `GET /object_info/SaveImage`（或等价 bounded object-info probe），只证明目标符合所需 ComfyUI protocol，不证明任意 imported workflow 可执行。

### 2. workflow model 使用 application-owned discriminated config

把 profile-owned model config 扩展为两类：现有 catalog config 与 `ComfyUiWorkflowModelConfig`。后者至少保存：

- `profileId`、`apiFormat: 'comfyui'`、稳定 `modelId`、用户可见 `displayName`
- 原始 API Format workflow JSON
- Provider parser 产出的 normalized contract：prompt binding、ordered image bindings、designated output node ID、mask support、contract revision
- 对 canonicalized workflow JSON + normalized contract 计算的稳定 `workflowRevision`

workflow JSON 和 normalized contract 随 model config 持久化；server validation status、upload filenames、`client_id`、`prompt_id`、history 和 output 不持久化。导入大小与 node count 使用 Provider-owned bounded limits；raw workflow 不进入日志或 diagnostics。

新增 ComfyUI-specific save/revalidate command，不让现有 `saveUserModelConfig()` 的 official preset 校验出现 format 分支。`listProfileModels()` 统一投影两类 configured model，但 selector 仍只展示已保存对象。

Provider contract 将 `ProviderModelExecution` 改为 discriminated union。ComfyUI 分支固定为：

```ts
{
  kind: 'comfyui-workflow',
  apiFormat: 'comfyui',
  modelId: string,
  requestStrategyId: 'comfyui-workflow-v1',
  workflowRevision: string,
  workflow: ComfyUiApiWorkflow,
  contract: ComfyUiNormalizedWorkflowContract
}
```

queued/durable request 只保存 `profileId + modelId + workflowRevision`，不保存 raw workflow。dispatch 时 Application 重新读取同一 profile-owned config：revision 相同才组装上面的 ephemeral execution payload；config 缺失或 revision 不同则以 stale-workflow validation error 失败，禁止旧任务执行新 graph。retry 继承原 `workflowRevision`，配置替换后必须新建任务。

UI 的 `providerOptions` 不能提供或覆盖 workflow payload，Provider 也不能读取 repository、UI state、UXP storage 或本地路径。

### 3. workflow marker 是 v1 唯一公开接口

输入只接受 ComfyUI API Format JSON。Provider 扫描 node `_meta.title`：

- 恰好一个 `IMAGEN_PS_PROMPT`；对应 node 必须有可直接写入的 literal `inputs.text`
- 零个或连续编号的 `IMAGEN_PS_IMAGE_1..N`；每个必须是 `LoadImage`，并有 literal `inputs.image`
- 恰好一个 `IMAGEN_PS_OUTPUT`；v1 必须是 `SaveImage`

marker 必须精确匹配且唯一；image 编号必须从 1 开始且无空洞。Parser 自动生成内部 binding，用户不编辑 `nodeId` / `inputName`。未标记 node、固定 negative prompt、checkpoint、sampler 与其他 workflow 参数保持 JSON 原值。

刷新/导入/dispatch pre-side-effect validation 使用目标服务的 `/object_info/{class}` 验证 workflow 全部 unique `class_type` 存在，并进一步验证 marker class、input 与 output-node facts。Local structural validation 与 server compatibility validation 分开返回稳定错误码，避免把网络失败误报为 workflow shape 错误。

选择 marker 而不是图遍历猜测，是因为 API Format 不表达“主图、参考图、最终输出”等产品角色；选择 marker 而不是用户 binding，是为了让 workflow 作者拥有契约、插件用户只导入和使用。

### 4. workflow image slot 数量是精确 arity

`IMAGEN_PS_IMAGE_N` 数量形成 `requiredImages = maxImages = N`：

- `N = 0`：只允许 `text_to_image`
- `N > 0`：只允许 `image_edit`
- `images[0]` 绑定 `IMAGE_1`，作为 primary image
- `images[1..]` 按序绑定 reference slots

v1 不支持 optional slot。需要“单图”和“原图 + 参考图”时，用户导入两份 workflow model。该限制让现有 ordered `images[]` 足够表达 wire mapping，也避免在 Composer 引入通用动态表单系统。

Application 提供 preflight command，用 normalized contract 校验 operation、图片数量、mask 条件、profile ownership 并返回 `workflowRevision`。App 必须先完成该 preflight，再调用 `putTaskRecord()`；Application runtime 在 queue/provider 边界重复 guard。该顺序修复当前 Composer 先写 task record 再发现输入错误的问题。

### 5. mask 保持 canonical 独立语义，目标固定 primary image

`maskImage` 不进入 `images[]`，只允许在 `N > 0` 时出现，并固定作用于 `images[0]`。Provider 以 primary upload response 作为 `original_ref` 调用 `/upload/mask`，使用返回的新 RGBA 文件替换 `IMAGEN_PS_IMAGE_1.inputs.image`；workflow 从该 `LoadImage` 的 IMAGE/MASK outputs 消费结果。

Provider parser 在 primary `LoadImage` 的 MASK output 被 graph 消费时投影 `acceptsMask: true`；否则拒绝带 mask 的请求。v1 把 mask 视为 optional capability：未提供时上传原图，提供时上传组合后的 RGBA primary。普通 reference images 始终走 `/upload/image`。

canonical edit mask 强度定义为 `0 = keep`、`255 = edit`。App-owned resource materialization MUST 先把 Photoshop selection/layer mask 归一化到 primary provider-input 的精确宽高，再编码 PNG，其中 `alpha = 255 - maskIntensity`；因此 ComfyUI `LoadImage` 的 `MASK = 1 - alpha` 恢复相同 edit 强度。普通全不透明 grayscale PNG 不满足该契约。Application 在 preflight 校验 mask 与 primary 同尺寸，UXP adapter 用小型像素 fixture 锁定 polarity、alpha 与 AssetStore round-trip。

### 6. designated output 与结果归一化

workflow 可以包含其他 `SaveImage` / `PreviewImage`，但只有唯一 `IMAGEN_PS_OUTPUT` 是插件结果。Provider 轮询 `GET /history/{prompt_id}`，只读取 `outputs[designatedNodeId].images[]`；数组必须非空，每项必须包含安全的 `filename`、`subfolder`、`type`，随后逐项调用 `/view` 并归一化为 `ProviderInvokeResult.assets[]`。

一个 designated `SaveImage` 返回 1..N 张都合法。插件不按 `SaveImage` node 数量推断结果，也不把其他 output 合并进结果。v1 限制 built-in `SaveImage`，暂不支持 `PreviewImage` 或 custom output，换取固定 PNG/history contract。

workflow 自己拥有尺寸、batch count 和格式；Composer 不向它注入 canonical output controls。为兼容当前 generation readiness，Application 给 ComfyUI model 生成 singleton provider-default matrix（`auto` geometry + `png`），同时投影 `outputMode: 'workflow-owned'`；UI 根据该 mode 隐藏 size/ratio/format/count controls，Provider MUST NOT 把 singleton selection 写入 graph。实际尺寸由下载资产解析，无法证明 exact-frame 时沿现有 placement contract 降级。

### 7. transport 使用 polling 和 invocation-scoped endpoint affinity

每次 invoke 生成唯一 `client_id` 与 request-scoped upload subfolder。顺序：

1. 选择 profile 唯一 endpoint。
2. 上传每张 image；必须使用服务响应的 `name/subfolder/type`，不能假设原 filename 未改名。
3. 若存在 mask，以上传后的 primary reference 调用 `/upload/mask`。
4. clone persisted workflow，注入 prompt 与返回的 input references；绝不修改 persisted object。
5. `POST /prompt` 并保存本次 `prompt_id`。
6. 用 config-owned `executionTimeoutMs`、`pollIntervalMs`、`maxPollIntervalMs` 和 bounded backoff 轮询 `/history/{prompt_id}`，直到 designated output 出现、history 明确 completed/error、timeout 或 caller abort。
7. 下载 designated images 并返回 assets。

不用 WebSocket，减少 Photoshop UXP runtime 差异和连接生命周期。`AbortSignal` 会停止 upload/poll/download；prompt 已被服务接受后不自动 retry、不切 endpoint、不调用会影响其他客户端的全局 `/interrupt`。已运行 prompt 可能继续在 ComfyUI 后台执行，UI 必须把这条限制作为取消行为的一部分。

### 8. Profile Models 与 Composer 只消费 application projection

Profile 创建沿用 settings flow，但 ComfyUI editor 显式选择 `comfyui` format，只允许 single endpoint，并隐藏 API Key、path/model hint、billing 与 discovery 控件。Profile Models 页为 ComfyUI 提供：导入 API Format JSON、命名、保存、替换、删除、重新校验。Refresh 调用独立 `revalidateComfyUiWorkflowModels()` command，禁止复用 `refreshProfileModels()`；它更新当前页面 runtime status，不新增/删除 selector item。

runtime status 是 `unknown | compatible | incompatible`。当前 session 已知 incompatible 的 selected workflow 禁用 send；unknown/stale status 允许 admission，但 Provider 在任何 upload 或 `/prompt` 前重新验证全部 workflow classes。该 status 不改变 ownership、selector membership 或 persisted config。

Composer 继续保留 ordered image attachments；根据 active workflow projection 显示精确 slot 数量和 primary/reference role。独立 mask 入口最多产生一个 `maskImage`，且只在 `acceptsMask` 为真时可用。该 UI 不解析 workflow，也不直接 import `@imagen-ps/providers`。

### 9. harness 先于 live validation

Provider family-local fake transport/case bank 覆盖：marker parser、object-info validation、unique upload path、response filename adoption、ordered injection、mask original_ref、history pending/success/error、designated multi-image output、abort/timeout 和 malformed payload。

Application contract/scenario tests覆盖 workflow config persistence、profile isolation、selector projection、dispatch payload、pre-admission validation。App 只增加少量 import/revalidate 和 Composer payload 场景；Photoshop mask read/encode 留在既有 UXP adapter contract。

默认 gate 不访问真实网络。真实 ComfyUI 只在 opt-in release/manual slice 验证 multipart、CORS、UXP fetch、长任务 polling 和 Photoshop mask polarity。

## Risks / Trade-offs

- [workflow JSON 可能很大或含敏感 widget 值] → 限制 bytes/node count；raw JSON 不写日志、diagnostics 或 task history；UI 明确这是本地 profile-owned 配置。
- [custom node/model 缺失导致导入后失效] → 保存时 server validation、手动 Refresh revalidation、invoke 时保留 ComfyUI validation error 的安全摘要。
- [固定 marker 限制复杂 workflow] → v1 保持可理解；未来用 versioned manifest 扩展，不让用户手填 binding。
- [精确 image arity 需要多个 workflow variant] → 换取零动态表单和确定映射；optional slots 留给 v2 manifest。
- [取消不终止运行中的 server prompt] → 不调用全局 interrupt；停止客户端工作并告知限制，未来研究 client-scoped queue deletion。
- [queued task 的 workflow 被同名配置替换] → durable input 冻结 `workflowRevision`；dispatch/retry revision mismatch fail closed，不保存 raw workflow snapshot。
- [runtime compatibility status 会过期] → known incompatible 禁止当前 session send；unknown/stale 允许 admission，但 Provider 在 side effects 前重新验证全部 class。
- [ComfyUI workflow output 不服从现有 output controls] → 使用 `workflow-owned` UI projection，避免展示无效控件。
- [profile-owned model union 扩大 application 影响面] → 新增专用 commands 与 discriminated types，保留 catalog save/resolve path，不在 provider 内访问 application storage。

## Migration Plan

项目为 current-state、零生产数据。实现按 harness-first slices 推进：先扩展 contracts/fakes，再实现 Provider parser/transport，再接 Application model mapping，最后接 Profile Models 与 Composer。无需 legacy 数据迁移；如果 discriminant 变为持久化必填字段，开发数据允许清空或由 adapter 在读取时 fail closed。

回滚时删除 `comfyui` registry entry 和 UI 创建入口；现有 catalog Provider/Profile/Model 路径不依赖 ComfyUI workflow config。遗留的 `apiFormat: 'comfyui'` records 在无 implementation 时按现有 unsupported profile 行为 fail closed。

## Open Questions

- workflow JSON 的 byte/node 上限需要在实现 slice 前用 representative fixtures 定值。
- Chrome CORS 与 Photoshop UXP 对本机 HTTP multipart 的真实行为只能由 release/manual harness 最终确认；mock tests 不宣称覆盖。

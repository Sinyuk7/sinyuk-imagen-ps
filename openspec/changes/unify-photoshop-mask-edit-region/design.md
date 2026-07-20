## Context

当前 app 已有四段未闭合的 Mask 能力：`captureActiveImage()` 能把 Photoshop selection coverage 归一化为 8-bit grayscale PNG；`ConversationAttachment` 可临时携带 `mask`；Provider canonical request 已有 `maskImage`；ComfyUI upload barrier 预留了 `maskValue`。但 UXP `readLayerMaskAsAsset()` 读取 user layer mask 后直接丢弃，Composer submit 没有把 Mask 送入 Provider，Task/History 不保存 Mask，ComfyUI 也没有显式 Mask binding。

Mask 的产品语义必须独立于底层 transport：它是 Primary Image 的隐藏 Edit Region，不是普通 attachment。Photoshop selection 和 user layer mask 来源不同，但进入上层后必须共享同一 canonical polarity、geometry 和生命周期。Provider image endpoint、Gemini-compatible transport 与 ComfyUI Workflow 再按各自能力决定 native Mask、显式 Workflow input 或无 Mask fallback。

本仓库采用 current-state、harness-first 约束。默认门禁必须是 mock-only、零费用、可复现；真实 Photoshop UXP 与真实 Provider/ComfyUI 仅提供独立 manual/live proof。

## Goals / Non-Goals

**Goals:**

- 建立 Primary Image 驱动的单一数据流，使 Primary 创建、删除、重排、替换或 geometry 更新成为唯一 Mask reconcile 触发源。
- 将 Photoshop selection 与 user layer mask 归一化为同一 provider-input 坐标空间中的 canonical Edit Region。
- 明确 `disabled`、`loading`、`ready`、`none`、`error` 状态，封住 stale async completion 与静默无 Mask 提交。
- 将提交使用的 Edit Region 保存为 immutable、host-neutral、secret-free Task snapshot，供 History 与 retry 复用。
- 通过显式 capability/plan 将 canonical Mask 转换为 OpenAI native Mask 或 ComfyUI Workflow Mask input；对 `semantic-only`/`unsupported` transport 禁用 UI Mask 开关并安全省略 Mask。
- 保持 attachment preview、AssetStore、HostPort、Provider Adapter 和 ComfyUI execution 的现有所有权边界。

**Non-Goals:**

- 不支持用户独立上传 Mask，也不把 Mask 显示成 attachment card 或计入 reference image 数量。
- 不支持 vector mask、channel mask、Quick Mask、smart filter mask 或 arbitrary document mask；V1 只读取 Photoshop selection 与 `kind: "user"` 的 pixel layer mask。
- 不实现 Gemini/Nano Banana 的 Mask-as-reference prompt hack。
- 不实现 ComfyUI `embedded-alpha` 或任意 custom node inference；V1 只支持 Workflow 显式声明的 `separate-image-input` binding。
- 不实现生成结果回到 Photoshop 后的 result-layer post-composite；该能力需要独立 placement contract。
- 不自动检测 attachment 创建后 Photoshop 源图层像素内容的任意变化；显式 attachment 更新或重新 capture 才产生新 image snapshot。

## Decisions

### 1. Primary 是派生身份，Edit Region 是 round input snapshot

Composer draft 保持 `attachments` 为唯一顺序来源，`attachments[0]` 派生为 Primary。Mask 不进入 attachment array，而由 `MaskCoordinator` 管理独立的 Primary binding：

```ts
type PrimaryKey = {
  attachmentId: string;
  resourceId: string;
  providerInputRef: string;
  sourceSnapshotId?: string;
  sourceBounds?: PhotoshopRect;
  targetSize: ImageSize;
};
```

`PrimaryKey` 变化代表原 Edit Region 无权继续使用。Coordinator 必须先同步清除旧 `ready` binding，再按当前 `maskPreference.enabled` 和新 Primary eligibility 决定是否异步 prepare。第二张以后 attachment 的新增、删除或更新不改变 `PrimaryKey`，不得触发 Mask 读取。

选择该方案而不是在每个 attachment event handler 中手工调用 Mask API，因为派生 identity 能覆盖删除、重排、替换与 geometry 更新，避免多个 UI 入口产生分叉逻辑。Mask snapshot 属于一次 generation input/Task，而不是 Photoshop 图层或返回图片的永久属性。

### 2. Coordinator 管生命周期，HostPort 只管 acquisition

`MaskCoordinator` 位于 `apps/app` shared UI/domain boundary，输入 Primary snapshot、Mask preference、HostPort 与 cancellation signal，输出：

```ts
type MaskBindingState =
  | { kind: 'disabled' }
  | { kind: 'no-primary' }
  | { kind: 'loading'; targetAttachmentId: string; generation: number }
  | { kind: 'ready'; targetAttachmentId: string; generation: number; editRegion: EditRegion }
  | { kind: 'none'; targetAttachmentId: string }
  | { kind: 'error'; targetAttachmentId: string; message: string };
```

每次 reconcile 增加 generation 并取消上一读取。late completion 必须同时匹配 generation 与当前 `PrimaryKey` 才能发布；否则释放新产生的 preview/asset ownership，并丢弃结果。关闭 Mask、移除 Primary 或销毁/reload panel 时同样取消读取并清理 draft-only Mask asset；Task snapshot 引用的 asset 不受该清理影响。

HostPort 不维护全局 Mask。它只接收 attachment 已确定的 document/layer/frame 参数，返回 `ready` 或 confirmed `none`；普通上传图不调用 Host。Host 读取、decode、dispose 或 storage 失败必须抛出并进入 `error`，不得伪装为 `none`。

选择 Coordinator + stateless HostPort，而不是让 request builder 或 ViewModel 直接查询 Photoshop，因为请求构建必须消费 immutable snapshot，不能在 submit 过程中读取可变 host/UI 状态。

### 3. Image 与 Mask 共享一个 provider-input frame

Edit Region geometry 使用 Primary provider-input derivative 的唯一 geometry truth：

```ts
interface EditRegionGeometry {
  readonly sourceBounds: PhotoshopRect;
  readonly targetSize: ImageSize;
  readonly coordinateSpace: 'primary-provider-input';
}
```

Selection capture 继续在 capture transaction 中同时读取 `getPixels()` 与 `getSelection()`。User layer mask 读取必须调用：

```ts
imaging.getLayerMask({
  documentID,
  layerID,
  kind: 'user',
  sourceBounds,
  targetSize,
  componentSize: 8,
});
```

返回的 `sourceBounds`、imageData dimensions、`colorSpace`、component count 和 data type 都必须验证。若 Photoshop 裁掉空白区域，shared grayscale frame helper 必须按实际 `sourceBounds` 映射回完整 `targetSize`；不得通过独立 resize 或只比较最终宽高猜测对齐。`imageData.dispose()` 必须在 `finally` 执行。

若 Primary 是 100x100 的 selection capture，canonical Mask 也必须是同一 selection bounds 的 100x100；100x100 image 与 1000x1000 document Mask 是 invalid contract。Host 可按 declared returned bounds 回填完整 frame，但不得对独立 Mask crop 或 resize 以猜测对齐。

### 4. Canonical Edit Region 使用 `white = edit`

公共层 canonical contract 固定为 8-bit grayscale PNG：0 表示 preserve，255 表示 edit，中间值保留 feather/partial coverage。Selection coverage 直接遵循该语义；user layer mask 的 white/visible 区域在 V1 解释为 edit，black/hidden 区域解释为 preserve。

```ts
interface EditRegion {
  readonly targetAttachmentId: string;
  readonly source:
    | { readonly kind: 'photoshop-selection'; readonly documentId: number; readonly layerId: number }
    | { readonly kind: 'photoshop-user-layer-mask'; readonly documentId: number; readonly layerId: number };
  readonly geometry: EditRegionGeometry;
  readonly mask: {
    readonly asset: HostImageAsset;
    readonly encoding: 'grayscale-png';
    readonly bitDepth: 8;
    readonly polarity: 'white-edit';
  };
}
```

Provider-specific alpha polarity、format 和 byte limit 不进入该类型。选择 grayscale canonical，而不是预先生成 OpenAI RGBA alpha Mask，因为 ComfyUI 需要保留自己的 polarity/binding 解释，公共资产不应被单一 Provider 污染。

### 5. Mask preference 与 effective Mask 分离

`maskPreference.enabled` 表示用户希望当前及后续 Primary 使用 Photoshop Mask；`MaskBindingState.ready` 才表示本次可发送。Primary 变更时 preference 保留，使新 Primary 自动 reconcile。

- `none`: Host 明确报告新 Primary 没有可用 Mask；允许无 Mask 提交，但 UI 必须显示当前 Primary 没有 Mask。
- `loading`: 禁止提交，避免用户启用 Mask 后发生无提示降级。
- `error`: 禁止提交，直到 retry、Primary 变化或用户关闭 Mask。
- `disabled` / `no-primary`: 不产生 Mask request。

选择保留 preference，而不是在遇到 `none` 时自动取消 checkbox，因为删除第一张后用户的操作意图没有变化；effective state 与提示负责保持 UI 诚实。

### 6. TaskRecord 保存 top-level Edit Region snapshot

Mask 是一次 Task 输入的 Primary binding，不是普通 attachment，因此 durable schema 在 `TaskRecord` 增加可选 top-level `editRegion`：

```ts
interface TaskEditRegion {
  readonly targetAttachmentId: string;
  readonly source: TaskEvidence;
  readonly geometry: {
    readonly sourceBounds: Rect;
    readonly targetWidth: number;
    readonly targetHeight: number;
  };
  readonly mask: TaskResourceRef;
  readonly encoding: 'grayscale-png';
  readonly bitDepth: 8;
  readonly polarity: 'white-edit';
}
```

Task schema version随严格 allowlist 更新。Retry 必须从 `TaskEditRegion.mask.ref` 解析相同资产，不重新访问 Photoshop，也不重新绑定当前 Primary。Retention reachability 必须把该 Mask ref 计入存活资源；draft stale Mask 与被删除 Task 的 Mask 可由既有 sweep 删除。

选择 top-level snapshot 而不是增加 `selection-mask` attachment，因为 Mask 不应影响 attachment 数量、顺序、UI 或 Provider reference image limit。

### 7. Submit 先冻结 PreparedGenerationInput，再做 capability planning

ViewModel 在 submit 时从 attachments、output、placement 与 `ready` Edit Region 构造 immutable `PreparedGenerationInput`。Request builder 与 backend 不得反查 `MaskCoordinator`。

```text
Composer draft
  -> Primary + ready EditRegion snapshot
  -> PreparedGenerationInput
  -> MaskExecutionPlanner
  -> Provider request / ComfyUI execution intent
```

Planner 输出显式 union：

```ts
type MaskExecutionPlan =
  | { kind: 'none' }
  | { kind: 'provider-native'; transport: 'image-endpoint'; polarity: 'alpha-zero-edit' }
  | { kind: 'comfyui-separate-image-input'; inputRef: WorkflowInputRef; polarity: 'white-edit' | 'black-edit' }
  | { kind: 'semantic-only'; reason: string }
  | { kind: 'unsupported'; reason: string };
```

Mask UI availability 由 plan 驱动。plan 为 `semantic-only` 或 `unsupported` 时，UI 禁用 Mask 开关并保留已存的 `maskPreference`，以便切回支持目标后重新 reconcile。该目标的 request 不含 Mask；runtime 若仍收到 ready Edit Region，也只能安全省略，不得把黑白图追加为普通 reference image 或 prompt。

### 8. OpenAI Adapter 负责 native Mask 转换与 preflight

OpenAI image endpoint capability 继续声明 Mask 只绑定 first input、要求相同 dimensions、要求 PNG，并携带 Provider-specific byte limit。Adapter 将 grayscale `white-edit` 转为 RGBA PNG，其中 alpha 0 表示 edit、alpha 255 表示 preserve；RGB 使用固定值。转换后再次校验 dimensions、format 和 byte limit，超限时 fail closed，不允许通过 resize Mask 破坏与 Primary 的一一对应。

现有 `CanonicalImageJobRequest.maskImage` 保留为 admitted Provider execution field，但只能由 `MaskExecutionPlanner` 从 supported ready Edit Region 派生；UI 与 attachment model 不直接构造该字段。Chat-image/Gemini builder 遇到残留 `maskImage` 必须安全省略，删除默认 Mask-as-reference 行为。

### 9. ComfyUI V1 使用 revision-scoped explicit Mask binding

Workflow mapping 从 `{ text, image }` 扩展为 `{ text, image, mask }`。Mask candidate 只来自明确 writable `upload-image` input；当一个 Workflow 有多个候选时，用户必须选择专用 Mask ref。Mapping 与现有行为一致，按 `workflowId + revision` 保存；revision 变化使旧 binding 失效。

V1 binding 固定为：

```ts
interface ComfyUiMaskBinding {
  readonly transport: 'separate-image-input';
  readonly inputRef: WorkflowInputRef;
  readonly polarity: 'white-edit' | 'black-edit';
}
```

ComfyUI payload/execution intent 仅在有有效 binding 时增加独立 `mask` asset 与 binding。Upload barrier 必须在任何 prompt/queue submission 前解析、验证并上传全部 image 与 Mask；Mask upload 失败不得提交 Workflow。API Graph 和 Frontend Queue driver 只修改声明的 Mask input，不能覆盖 Primary image ref 或其他 saved widgets。`black-edit` 由 execution adapter 在上传前显式反转 canonical grayscale；不声明 binding 的 Workflow 禁用 Mask，并走无 Mask submission。

选择 explicit binding 而不是通过节点名称、`MASK` 类型或 title 猜测，因为 ComfyUI Workflow 是执行真相，自定义节点与多 `LoadImage` 图结构无法可靠推断。`embedded-alpha` 留给后续独立 capability。

### 10. 验证分成 deterministic 与 real-host/live 两层

默认验收先建立 fake/harness：

- Host fake 覆盖 user mask `ready`、`none`、dimension mismatch、decode failure、dispose 和 modal serialization。
- Coordinator harness 覆盖 Primary delete/reorder/update、non-primary no-op、toggle、late completion fencing 与 asset release。
- Task contracts 覆盖 strict schema、redaction、asset reachability 与 retry ref reuse。
- Provider contracts 覆盖 OpenAI polarity/format/size、Gemini/chat-image no-Mask fallback。
- ComfyUI contracts 覆盖 revision-scoped binding、upload barrier、API/Frontend exact input mutation 与无 binding no-Mask fallback。

真实 Photoshop smoke 只验证 `getLayerMask()`、selection、feather、100x100 crop geometry、无 Mask 与错误路径；真实 Provider/ComfyUI proof 独立执行。任何 Chrome/mock 证据不得宣称已证明真实 UXP IO。

## Risks / Trade-offs

- [Primary 快速切换导致 late Mask 覆盖新状态] → generation fence + AbortSignal + commit-time `PrimaryKey` 校验；stale asset 立即释放。
- [Photoshop 返回 trimmed `sourceBounds` 或异常尺寸] → 复用统一 grayscale frame mapping，并在 encode/store 前 fail closed。
- [user layer mask 与 attachment 创建后的源图层内容发生变化] → V1 绑定保存的 image geometry/source evidence，不声称自动追踪 Photoshop 文档 revision；用户必须显式更新 attachment。
- [Canonical stored-deflate PNG 或 OpenAI RGBA PNG 超过 Provider byte limit] → Provider conversion 后执行严格 preflight；不得 resize，返回可操作错误。
- [新增 Task field 影响 strict decoder 与旧本地 history] → current-state 下提升 schema version，同步 decoder/store/fakes；不实现 legacy migration。
- [Mask asset 成为隐藏存储泄漏] → draft lifecycle release + Task reachability + retention sweep contract。
- [ComfyUI 自动识别错误 Mask node] → 禁止 title/class-name heuristic；只接受 revision-scoped explicit mapping。
- [用户看到 checkbox 开启但当前 Primary 无 Mask] → preference/effective state 分离，UI 明确显示 `none`，请求不声称已使用 Mask。
- [Provider 支持变化] → capability preset/Workflow binding 为唯一事实；UI 依据 capability 禁用 Mask，HostPort 不硬编码 Provider id。

## Migration Plan

1. 先添加 Edit Region、Task schema 与 Coordinator/Host fake contracts，不接真实请求。
2. 完成 UXP user layer mask acquisition，并复用 selection canonical helper；保持 Mask UI 默认关闭。
3. 接入 Composer Primary reconcile、状态 UI、Task snapshot、retention 与 retry。
4. 接入 Provider native Mask planning/conversion，并将 Gemini/chat-image Mask-as-reference 改为安全省略。
5. 接入 ComfyUI explicit Mask mapping、upload barrier 与两个 driver。
6. 运行 package/app deterministic gates，再执行独立 Photoshop UXP manual smoke 和 opt-in live backend proof。
7. 将稳定边界写回 `docs/ENGINEERING_CONTEXT.md` 与 `docs/TESTING.md`，删除其中“Mask 属于 future Change”的过期描述。

回滚时可关闭 Mask UI/admission 并保留无 Mask image-edit 路径；由于 Task schema 是 current-state 严格版本，回滚代码前需清理本 change 产生的新版本本地 test data，不提供跨版本 migration。

## Open Questions

- 真实 Photoshop UXP smoke 是否能稳定区分“图层没有 user mask”与 `getLayerMask()` host exception，需要通过一次目标 host probe 固化 exact error behavior；该未知不改变 `none` 与 `error` 必须分离的上层契约。
- OpenAI-compatible third-party endpoint 是否完整遵守 native Mask format/byte limit，只能由 profile/model capability 明确声明；默认不得继承 OpenAI preset。

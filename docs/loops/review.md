# Photoshop Capture And Placement Loop — Review Decisions

Status: review decision
Scope: 仅记录已确认的问题、建议决策与修改方向
Relation to original Loop: 独立评审结论，不直接替换原文档内容

## Overall Decision

原 Loop 的核心方向成立：

* 使用显式 `Capture`，不在 `Send` 时静默读取 Photoshop。
* Capture 结果先作为附件展示，用户确认后再发送。
* Photoshop geometry 保持在 app/host domain，不进入 provider `Asset` 或 provider wire contract。
* MockProvider 回显实际上传的图片。
* exact Photoshop placement 必须由真实 Photoshop smoke 验证，fake host 和 Chrome simulator 只能验证合同与调用序列。

需要调整的核心问题不是整体架构，而是：

1. Capture contract 当前存在类型冲突。
2. Placement 没有充分绑定捕获时的 document。
3. 原设计错误假设 provider outputs 与 inputs 可以按 index 对应。
4. Pixel bounds、alpha、resource lifecycle 和 writeback transaction 仍缺少确定合同。
5. Slice 顺序和文件边界存在执行层面的冲突。

---

## P0 — 必须修正

### 1. `applyAlpha: false` 不应被视为当前缺陷

#### 问题

原文把以下内容并列为当前问题：

* JPEG encoding
* `applyAlpha: false`
* 缺少 frame metadata

这会使执行 Agent 误以为需要把 `applyAlpha` 改成 `true`。

#### 明确事实

对于需要保留透明通道的 Capture：

* `applyAlpha: false` 是正确方向。
* `applyAlpha: true` 会将 alpha 应用到背景并移除透明通道。
* 当前真正的问题是后续 JPEG 编码无法保留 transparency。

#### 决策

保留：

```ts
applyAlpha: false
```

修改重点应是：

* 从 RGBA pixel data 生成真正的透明 PNG。
* 不再使用 JPEG/base64 路径作为 provider 上传资产。
* Preview 和 provider upload 应引用同一份 materialized PNG 内容，避免“预览内容”和“真实上传内容”不同。

---

### 2. Capture Port 返回类型与 frame metadata 设计冲突

#### 问题

原设计提出：

```ts
captureActiveImage(): Promise<HostImageAsset>
```

但 Capture 实际需要同时产生：

* 图片资产
* Capture frame
* Capture kind
* document/layer context

如果 Port 只返回 `HostImageAsset`，后续只能：

* 把 Photoshop metadata 塞入 `HostImageAsset`；或
* 依靠另一个隐式 side channel 保存 frame。

前者污染通用 image asset，后者容易出现 asset 与 frame 脱节。

#### 决策

Capture 返回独立 domain result：

```ts
export interface PhotoshopCaptureResult {
  readonly image: HostImageAsset;
  readonly frame: PhotoshopCaptureFrame;
}
```

Port：

```ts
captureActiveImage(): Promise<PhotoshopCaptureResult>;
```

UI 收到结果后，再转换为：

```ts
ConversationAttachment
```

这样可以保持：

* `HostImageAsset` 只描述图片内容。
* `PhotoshopCaptureFrame` 只描述 host placement context。
* `ConversationAttachment` 负责组合两者。

---

### 3. Placement 必须绑定捕获时的 document

#### 问题

Capture 发出后，provider 请求可能持续一段时间。期间用户可能：

* 切换 active document。
* 切换 active layer。
* 关闭原文档。
* crop、resize canvas 或改变原文档坐标空间。

如果 placement 依赖 placement 时的 `activeDocument`，结果可能被放进完全错误的文件。

#### 决策

Capture 时至少保存：

```ts
documentId
documentSizeAtCapture
placementRect
```

Placement 时：

1. 按保存的 `documentId` 查找原文档。
2. 找到后明确将 placement 操作定向到该文档。
3. 原文档不存在时显示 visible error。
4. 绝不能静默 fallback 到当前 active document。
5. exact-frame placement 前检查文档坐标空间是否仍然有效。

首版可使用：

```ts
documentSizeAtCapture
```

作为基础 stale-context 检查。

如果 document width/height 已改变：

* exact-frame placement 不应继续假装可靠。
* 可以阻止 placement。
* 或明确降级为 document-only placement。
* 不允许静默降级。

`documentId` 只是当前打开文档生命周期内的引用，不是跨 Photoshop 重启或文档关闭后重开的 durable identity。

---

### 4. 删除 `output index -> attachment index` 映射

#### 问题

普通 image-edit provider 不保证：

```text
output[0] 对应 input[0]
output[1] 对应 input[1]
```

实际常见场景包括：

* 5 张输入图片共同作为风格或内容参考。
* 输出 2 张全新的结果。
* 多个 outputs 只是同一请求的 variations。
* 某张输入是主体图，其他输入是 style/reference/control images。
* Provider 完全不返回 input-output correspondence metadata。

因此以下设计没有可靠依据：

```text
output index -> attachment index -> Photoshop frame
```

即使数组长度偶然相同，也不能证明存在语义对应关系。

#### 决策

Placement metadata 从“每个 output 与某个 input 配对”收敛为：

```text
每个 request / round 只有一个 PlacementIntent
```

不再给 output preview 绑定某个 attachment index。

建议模型：

```ts
export type PlacementIntent =
  | {
      readonly kind: 'exact-frame';
      readonly documentId: number;
      readonly documentSizeAtCapture: PhotoshopSize;
      readonly placementRect: PhotoshopRect;
    }
  | {
      readonly kind: 'document-only';
      readonly documentId: number;
    }
  | {
      readonly kind: 'unbound';
    };
```

#### 4.1 Exact-frame placement

只有满足全部条件时，request 才获得 `exact-frame`：

```text
整个 provider request 恰好只有一张 image attachment
并且该图片来自 Photoshop Capture
并且该 Capture 包含有效 frame metadata
```

例如：

```text
1 张 Photoshop Capture
0 张其他图片
```

此时可以合理解释为：

* 请求是对该唯一输入图的编辑。
* 所有返回 outputs 是该输入的不同结果或 variations。
* 所有 outputs 共用同一个 `placementRect`。
* 用户选择其中一个 output 放置时，将其放回原 document 的原 frame。

即使 provider 返回多张 output，也不需要建立 output-input mapping：

```text
所有 outputs -> 同一个 request-level exact frame
```

放置行为建议：

* 用户一次放置一个选中的 output。
* 不自动把所有 variations 批量叠加到文档中。
* 每个 output 都可独立复用同一个 exact frame。

#### 4.2 多图片输入不允许 exact-frame placement

以下情况不是单图编辑：

```text
1 张 Photoshop Capture
+ 4 张本地风格参考图
```

虽然只有一张 Capture，但整个 provider request 有 5 张图片。

此时输出无法被严格认定为 Capture 图片的像素级替代物，因此：

* 不进行 exact-frame scale/translate。
* 不使用任何 attachment frame。
* 不通过第一张图片的位置推断输出位置。

#### 4.3 Document-only placement

多图输入时，如果所有 Photoshop Capture 都来自同一个 document，可以保留 document context：

```text
1 张 Document A Capture + 多张本地参考图
-> document-only(Document A)

多张 Document A Capture
-> document-only(Document A)
```

此时：

* 输出导入原 document。
* 使用普通 smart-object placement。
* 不放回任何 layer/selection frame。
* 不根据任意一张输入计算 scale 或 translation。
* 本地 file attachments 不构成 document 冲突。

这保留了最有价值且可靠的信息：

```text
结果属于哪个 Photoshop 工作文档
```

但不虚构：

```text
结果对应哪一个输入区域
```

#### 4.4 Unbound placement

以下情况使用 `unbound`：

```text
请求里没有 Photoshop Capture
或
Captures 来自多个不同 documents
```

此时不得自动选择：

* 第一张 Capture 的 document。
* 最后一张 Capture 的 document。
* 当前 active document。
* 第一张 attachment 的来源。

首版可以：

* 禁止自动 placement，并提示目标不明确；或
* 提供显式普通导入动作，由用户主动确认目标文档。

#### 4.5 Round-level intent

`PlacementIntent` 应在发送请求时根据 attachments 一次性计算，并保存到 round：

```ts
ConversationRound.placementIntent
```

Provider outputs 只继承该 round-level intent：

```text
不与 input index 配对
不修改 provider result contract
不把 geometry 写入 ProviderInvokeResult.assets
```

---

### 5. 必须定义统一的 pixel-grid 和 bounds 规则

#### 问题

Photoshop bounds 与实际返回 pixel buffer 之间不能简单假设：

```text
requested rect == returned image dimensions
```

需要处理：

* Bounds 可能不是整数。
* `right/bottom` 与 width/height 的计算需要统一语义。
* `getPixels` 可能 trim 空区域。
* layer 可能部分位于 canvas 外。
* selection bounds 可能超出 canvas。
* downscale 后实际 source/target mapping 可能包含 rounding。
* mask 和 layer pixels 必须落到同一个 raster grid。

仅写“pad/trim”不足以约束实现。

#### 决策

建立单一 canonical rect normalization helper：

```ts
left = Math.floor(bounds.left);
top = Math.floor(bounds.top);
right = Math.ceil(bounds.right);
bottom = Math.ceil(bounds.bottom);

width = right - left;
height = bottom - top;
```

整个 Capture pipeline 必须区分：

```text
requested capture rect
actual returned source bounds
actual returned image dimensions
final upload dimensions
```

建议命名：

* `captureRect`：用户语义上的完整 capture frame。
* `readRect`：与 layer/canvas 有效像素区域求交后的读取区域。
* `returnedSourceBounds`：Photoshop API 实际返回区域。
* `uploadSize`：最终编码 PNG 的 pixel size。

Selection capture：

1. 用 selection bounds 生成 canonical `captureRect`。
2. 读取 layer 与 captureRect 的有效交集。
3. 读取同一 captureRect 下的 selection mask。
4. 分别映射回完整 capture grid。
5. 对齐尺寸后应用 mask。
6. 最终 PNG dimensions 必须对应完整 captureRect，而不是 trimmed pixels。

Layer capture：

* 默认 frame 应依据不包含 effects 的 pixel bounds。
* 如果产品明确需要包含 visual effects，则必须单独定义 composite/effects capture 语义，不能混用 layer pixel bounds。

---

### 6. Capture 开始时必须冻结 source context

#### 问题

如果 Capture 流程在多个异步步骤中反复读取：

```text
当前 document
当前 layer
当前 selection
```

用户在中间切换 Photoshop 状态时，可能得到混合结果：

* Document A 的 bounds。
* Document B 的 pixels。
* 另一个 layer 的 mask。
* Capture metadata 与真实图片内容不一致。

#### 决策

Capture 开始时创建 immutable snapshot：

```ts
interface PhotoshopCaptureSnapshot {
  readonly documentId: number;
  readonly documentSize: PhotoshopSize;
  readonly layerId: number;
  readonly layerBoundsNoEffects: PhotoshopRect;
  readonly selectionBounds: PhotoshopRect | null;
}
```

后续 Imaging calls 必须显式传：

```text
documentID
layerID
sourceBounds
```

不得在 pipeline 中再次依据 `activeDocument` 或 `activeLayers` 决定来源。

如果 snapshot 中的 source 在读取前已经失效，应终止 Capture，而不是自动切换到新的 active state。

---

### 7. “Active layer”需要处理多选图层

#### 问题

Photoshop 暴露的是 selected/active layers 集合。用户可能同时选择多个图层。

直接使用：

```ts
activeLayers[0]
```

会把未定义清楚的顺序行为包装成“当前图层”。

#### 决策

首版采用严格规则：

```text
activeLayers.length === 1
-> Capture 该图层

activeLayers.length === 0
-> Capture error

activeLayers.length > 1
-> Capture error，提示只选择一个图层
```

不要在本 Loop 中自动：

* 合并多个选中图层。
* 捕获第一个图层。
* 捕获 Photoshop composite。
* 创建临时 merged layer。

多图层 Capture 应作为未来独立产品能力设计。

---

### 8. 空附件 image-edit 约束不能只存在于页面 UI

#### 问题

如果只在 `main-page.tsx` 中禁用 Send，底层仍保留：

```text
attachments.length === 0 -> provider-generate
attachments.length > 0 -> provider-edit
```

那么以下路径可能绕过 UI 约束：

* Retry。
* Hook 的其他调用者。
* 后续 UI 重构。
* 测试或 command path。
* 程序化 submit。

#### 决策

提交请求必须包含显式 operation：

```ts
submit({
  operation: 'image-edit',
  prompt,
  attachments,
});
```

Domain/hook invariant：

```text
operation === image-edit
且 attachments.length === 0
-> reject before provider invocation
```

未来 text-to-image 应使用：

```ts
operation: 'text-to-image'
```

而不是继续通过“空附件”隐式推断 workflow。

UI 禁用只是第一层体验约束，hook/domain validation 才是行为合同。

---

### 9. Slice 顺序与文件边界当前不一致

#### 问题

原 Slice 设计中存在明确执行冲突：

* UI Slice 先调用尚未定义的 capture port。
* Domain/Port contract 放在后续 Slice。
* PNG encoder 可能需要依赖修改，但 Allowed Files 不包含 package manifest 或 lockfile。
* 临时 fake port 会在下一 Slice 被重写，制造无意义返工。

#### 决策

建议执行顺序：

1. Capture/Placement domain contract。
2. Pure frame and placement-intent helpers。
3. HostPort contract 与 fakes。
4. Capture UI integration。
5. UXP Capture materialization。
6. MockProvider echo。
7. Round-level placement intent。
8. UXP placement。
9. Chrome simulator parity。
10. Real Photoshop smoke。

将硬编码的：

```text
Allowed files
```

改为：

```text
Expected files
```

规则应为：

* 同一 ownership boundary 内的必要附带文件可以修改。
* 修改列表外文件时在报告中说明原因。
* 只有真正跨 package ownership boundary 时才停止并提交 Decision Packet。
* `package.json`、lockfile、build config 和 shared test fixture 不应被不完整 allowlist 意外禁止。

---

### 10. PhotoshopImageData 必须明确 dispose

#### 问题

Capture 可能同时持有：

* layer pixel imageData
* selection mask imageData
* intermediate RGBA buffers
* padded full-frame buffer
* encoded PNG bytes

如果没有明确生命周期，大图或连续 Capture 会积累显著内存压力。

#### 决策

所有 Photoshop image data：

```ts
const imageData = await imaging.getPixels(...);

try {
  // read/process
} finally {
  imageData.dispose();
}
```

`getSelection()` 返回对象同样处理。

同时增加 Capture 内存预算：

```text
normalized width
normalized height
pixel count
estimated RGBA bytes
intermediate buffer multiplier
```

在分配完整 frame buffer 前检查限制。

超出预算时：

* 使用确定的 max-edge downscale；或
* 返回 visible error。

不能在已经分配超大 RGBA buffer 后才检查尺寸。

---

## P1 — 应在实现前明确

### 11. 定义统一的 provider-upload pixel contract

#### 问题

`image/png` 只描述容器，不足以描述真实像素语义。

至少还需要定义：

* Color space。
* Color profile。
* Bit depth。
* Channel layout。
* Alpha representation。
* Resize alpha policy。

#### 决策

首版建议固定为：

```text
PNG
8-bit per component
RGB or RGBA
chunky/interleaved channels
straight alpha at asset boundary
explicit upload color-space conversion
```

透明图 resize：

1. straight alpha -> premultiplied alpha
2. resize
3. unpremultiply
4. alpha 为 0 时清空 RGB

这可以避免透明边缘出现颜色污染。

Selection mask：

* 归一化为单通道 8-bit alpha。
* layer alpha 与 selection alpha 相乘。
* 最终 alpha 为 0 时 RGB 设为 0。

---

### 12. Placement 应使用显式、不可混淆的 Port contract

#### 问题

以下接口过于宽松：

```ts
placeAssetOnCanvas(asset, options?)
```

调用者可能传出：

* options 缺字段。
* frame 与 documentId 不一致。
* ordinary placement 和 exact placement 行为混合。
* 新增 options 后产生大量非法组合。

#### 决策

使用 discriminated union：

```ts
export type HostPlacementIntent =
  | {
      readonly kind: 'default';
    }
  | {
      readonly kind: 'document-only';
      readonly documentId: number;
    }
  | {
      readonly kind: 'exact-frame';
      readonly documentId: number;
      readonly documentSizeAtCapture: PhotoshopSize;
      readonly placementRect: PhotoshopRect;
    };

placeAsset(
  asset: HostImageAsset,
  intent: HostPlacementIntent,
): Promise<void>;
```

App-side `PlacementIntent` 与 HostPort placement intent 可以同形，或通过纯 mapper 转换。

---

### 13. Placement transaction 必须完整检查失败状态

#### 问题

Place、scale、translate 涉及多个 Photoshop 操作。任何一步失败都可能留下：

* 已导入但未移动的图层。
* 只完成 scale 的对象。
* 多条 history states。
* 未清理的 temp file。
* BatchPlay 返回 error descriptor 但 Promise 未 reject。

#### 决策

一次 placement 应作为单个 transaction：

```text
resolve target document
write temp file
create session token
executeAsModal
suspend history
place smart object
inspect placed bounds
scale
re-read bounds if required
translate
validate final bounds
resume history
cleanup temp file
```

要求：

* 所有 Photoshop mutations 位于同一个 modal scope。
* 显式检查每个 BatchPlay result。
* 捕获取消状态，不把 user cancellation 包装成普通 failure。
* `finally` 清理 temp file。
* history suspension 必须在成功和失败路径上正确恢复。
* 不记录 image bytes、token 或用户本地路径。

如果中途失败，优先回滚该 history transaction；无法可靠回滚时必须返回部分完成状态，不能报告 placement 成功。

---

### 14. `PhotoshopCaptureFrame` 应减少重复字段

#### 问题

原 frame 包含：

```text
sourceRect
placementRect
originalSize
uploadSize
uploadScale
mimeType
```

其中存在重复和漂移风险：

* `originalSize` 可由 rect 推导。
* `uploadScale` 可由 rect/uploadSize 推导。
* rounding 后 X/Y scale 未必严格相同。
* `mimeType` 属于 image asset，不属于 geometry。
* `sourceRect` 容易与 Imaging API 返回的 `sourceBounds` 混淆。

#### 决策

建议最小模型：

```ts
export interface PhotoshopCaptureFrame {
  readonly captureId: string;
  readonly kind: 'selection' | 'layer';
  readonly documentId: number;
  readonly layerId: number;
  readonly documentSizeAtCapture: PhotoshopSize;
  readonly captureRect: PhotoshopRect;
  readonly placementRect: PhotoshopRect;
  readonly uploadSize: PhotoshopSize;
}
```

如果当前阶段：

```text
captureRect === placementRect
```

则可以进一步只保留：

```ts
documentRect
```

等真实需求出现后再拆分。

不要存储可计算的 `uploadScale` 作为权威值。需要时计算：

```ts
scaleX = uploadSize.width / captureRect.width;
scaleY = uploadSize.height / captureRect.height;
```

---

### 15. MockProvider echo 只验证内容路径，不证明真实 provider mapping

#### 问题

MockProvider 按顺序 echo inputs 是有价值的，但它只能证明：

* 上传的图片内容正确。
* Attachment -> provider request mapping 正确。
* Provider result -> preview mapping 正确。
* Preview -> placement bytes path 正确。

它不能证明真实 provider outputs 与 inputs 有任何对应关系。

#### 决策

MockProvider 保留：

```text
image_edit with images
-> echo all input images in input order
```

但测试名称和文档表述必须明确这是：

```text
transport/content-path harness
```

而不是：

```text
provider semantic correspondence contract
```

Mock echo 结果仍然使用 request-level `PlacementIntent`：

* 单图 Capture request -> exact-frame。
* 多图 request -> document-only 或 unbound。
* 不因 Mock 恰好按顺序 echo，就恢复 output-index mapping。

---

### 16. Chrome simulator 不应复制 Photoshop imaging algorithm

#### 问题

如果为了测试 Capture 在 simulator 中重新实现：

* Photoshop bounds trimming。
* selection alpha。
* layer/canvas intersection。
* cache level mapping。
* exact smart-object transformation。

Simulator 会变成另一套容易偏离真实 host 的实现。

#### 决策

Chrome simulator 只提供 deterministic contract fixtures：

```ts
captureActiveImage()
-> 返回固定 HostImageAsset + PhotoshopCaptureFrame
```

它可以验证：

* Capture UI。
* Attachment append。
* PlacementIntent derivation。
* HostPort call parameters。
* Error state。
* Request mapping。

它不能作为以下行为的证据：

* Photoshop selection alpha 正确。
* `getPixels` bounds mapping 正确。
* Smart object scale/translate 正确。
* Real document targeting 正确。

---

## Validation Decisions

### Automated tests 必须覆盖

#### Capture contract

* 单个 active layer Capture 成功。
* No document error。
* No selected layer error。
* Multiple selected layers error。
* Selection/non-selection path 分支。
* Capture 不触发 Send。
* Send 不触发 Capture。
* Capture in flight 防止重复调用。

#### Request rules

* image-edit 无 attachments 在 domain/hook 层被拒绝。
* attachments 只映射为 plain provider assets。
* Photoshop frame 不进入 provider request。
* Retry 保留原 round 的 operation 和 placement intent，不重新读取 Photoshop state。

#### PlacementIntent derivation

```text
1 张 Photoshop Capture
-> exact-frame

1 张 Photoshop Capture + 1 张 local file
-> document-only

多张 Capture，均来自 Document A
-> document-only(Document A)

Captures 来自 Document A 和 B
-> unbound

只有 local files
-> unbound
```

#### MockProvider

* Echo 所有 input images。
* 保持 input order。
* 不修改 provider stable asset contract。
* 无 input image 时保留 synthetic output。
* Echo behavior 不携带 Photoshop geometry。

#### Pixel helpers

* Canonical bounds rounding。
* Intersect。
* Pad/trim。
* Layer alpha × selection alpha。
* Alpha 0 时 RGB 清零。
* Premultiplied alpha resize。
* Out-of-canvas rect。
* Empty intersection。
* Oversized allocation guard。

#### Placement host mapping

* 按 stored documentId 定向。
* 原文档不存在时失败。
* 不 fallback current document。
* exact-frame 的 scale/translate math。
* document-only 不执行 captured-frame transform。
* BatchPlay error result 被识别。
* temp file cleanup。
* history suspension success/failure path。

---

## Manual Photoshop Smoke Decisions

真实 Photoshop smoke 必须记录数值，不只写“看起来正确”。

每次至少记录：

```text
documentId
document size at capture
captureRect
upload pixel size
output pixel size
placed bounds before transform
scaleX / scaleY
translationX / translationY
actual bounds after transform
expected bounds
tolerance
```

必须覆盖：

1. 普通 active layer Capture。
2. Rectangular selection。
3. Feathered 或 anti-aliased selection。
4. Non-rectangular selection。
5. Selection 超出 canvas。
6. Layer 部分位于 canvas 外。
7. Background layer / no-alpha source。
8. 大图 downscale 后再放回。
9. Provider output 与 input pixel size 不同。
10. 单输入、多 outputs，分别放置选中结果。
11. 单 Capture + 多 local references，只做 document-only placement。
12. 多 Capture 同 document，只做 document-only placement。
13. Captures 来自不同 documents，验证 unbound。
14. Capture 后切换 active document。
15. 原 document 已关闭。
16. Capture 后 document resize/crop。
17. BatchPlay/transform 人为失败路径。
18. 连续多次 Capture 的内存稳定性。

---

## Final Architecture Decision

最终推荐模型是：

```text
ConversationAttachment
├── HostImageAsset
└── optional PhotoshopCaptureFrame

ConversationRound
├── input attachments snapshot
├── provider outputs
└── one request-level PlacementIntent
```

核心规则：

```text
Provider 不知道 Photoshop geometry。

Outputs 不与 inputs 按 index 配对。

只有整个请求恰好包含一张 Photoshop Capture 图片时，
才允许 exact-frame placement。

多图输入只保留可证明的 document context，
不保留或推断 frame correspondence。

Placement 永远定向到捕获时的 document，
绝不静默使用 placement 时的 active document。
```

## Final Priority

### 必须在实施前解决

1. 修正 `applyAlpha` 描述。
2. 定义 `PhotoshopCaptureResult`。
3. 定义 request-level `PlacementIntent`。
4. 删除 output-index/input-index association。
5. 明确 stored document targeting。
6. 定义 canonical pixel grid。
7. 冻结 Capture source snapshot。
8. 处理 multi-selected layers。
9. 下沉 empty-attachment invariant。
10. 调整 Slice 顺序和文件边界。
11. 增加 image data dispose 和内存预算。

### 可以在实现过程中完成

1. 收敛 frame fields。
2. 固定 upload pixel contract。
3. 完整 placement transaction。
4. Chrome deterministic fixtures。
5. 可量化 Photoshop smoke 记录。

完成这些决策后，Loop 的职责会明显收敛：

* Capture 负责产生用户可见、可发送的图片。
* Provider 只处理图片内容。
* Round 只保存一个可证明的 placement intent。
* Host placement 只执行明确、安全的 document/frame 行为。
* 不再尝试推断服务器没有承诺的输入输出关系。

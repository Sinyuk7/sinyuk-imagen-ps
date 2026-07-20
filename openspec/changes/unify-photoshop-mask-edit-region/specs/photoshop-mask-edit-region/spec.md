## ADDED Requirements

### Requirement: Mask SHALL be a Primary-bound hidden Edit Region
系统 SHALL 将 Mask 建模为当前 Primary Image 的隐藏 Edit Region，而不是普通 attachment。Edit Region SHALL 通过稳定的 `targetAttachmentId` 绑定 `attachments[0]`，不得进入 attachment list、reference image count 或独立上传入口。

#### Scenario: Enable Mask for a Photoshop Primary
- **WHEN** Composer 有一个来自 Photoshop layer 或 selection 的 Primary Image，且用户启用 Mask
- **THEN** 系统开始为该 Primary prepare Edit Region，并保持 attachment list 与 attachment count 不变

#### Scenario: Enable Mask for a regular upload
- **WHEN** Composer Primary 是普通上传图，且用户此前保留了 Mask preference
- **THEN** 系统进入 `none`、不得调用 Photoshop Host、不得创建 Mask asset，并允许无 Mask 提交

#### Scenario: Reject independent Mask attachment
- **WHEN** UI 或调用方尝试把 Mask 作为普通 image attachment 添加
- **THEN** 系统拒绝该输入，且不得改变 Primary 或 reference image 顺序

### Requirement: Primary changes SHALL invalidate and reconcile Mask
系统 SHALL 从 `attachments[0]` 派生 Primary identity。Primary 的 attachment id、resource identity、source snapshot 或 provider-input geometry 任一变化时，系统 SHALL 先同步失效旧 Edit Region，再根据保留的 Mask preference reconcile 新 Primary；非 Primary attachment 变化不得触发 Mask reconcile。

#### Scenario: Delete the first of three attachments
- **WHEN** attachments 为 `[A, B, C]`、A 绑定 ready Edit Region、Mask preference 已启用，且用户删除 A
- **THEN** 系统立即清除 A 的有效 Mask，派生 B 为新 Primary，并在 B 可读取 Photoshop Mask 时开始 prepare B 的 Edit Region

#### Scenario: Reorder a different attachment into first position
- **WHEN** attachments 从 `[A, B, C]` 重排为 `[B, A, C]`
- **THEN** 系统不得把 A 的 Mask 复用给 B，并 SHALL 对 B 执行一次新的 reconcile

#### Scenario: Change a non-primary attachment
- **WHEN** Primary identity 未变化，且用户新增、删除或更新第二张以后 attachment
- **THEN** 系统保持当前 ready Edit Region，且不得重新调用 Host Mask acquisition

#### Scenario: Remove all attachments
- **WHEN** 用户删除最后一个 attachment
- **THEN** 系统进入 `no-primary`，取消 in-flight acquisition，并释放未被 Task snapshot 引用的 draft Mask asset

### Requirement: Mask lifecycle SHALL distinguish user intent and effective state
系统 SHALL 分离 `maskPreference.enabled` 与 effective Mask state，并 SHALL 支持 `disabled`、`no-primary`、`loading`、`ready`、`none`、`error`。只有 `ready` Edit Region 可进入 generation input。

#### Scenario: New Primary has no Photoshop Mask
- **WHEN** Mask preference 已启用，且 Host 明确报告新 Primary 没有 selection/user layer mask
- **THEN** 系统进入 `none`、保持用户 preference，并允许无 Mask 提交，同时 UI 明确显示当前 Primary 没有 Mask

#### Scenario: Mask is still loading
- **WHEN** Mask preference 已启用且当前 Primary state 为 `loading`
- **THEN** 系统阻止 generation submit，且不得静默构建无 Mask request

#### Scenario: Mask acquisition fails
- **WHEN** Host decode、geometry、storage 或 IO 失败
- **THEN** 系统进入 `error` 并阻止 generation submit，直到 retry、Primary 变化或用户关闭 Mask

#### Scenario: User disables Mask
- **WHEN** 用户关闭 Mask preference
- **THEN** 系统立即取消 in-flight acquisition、清除 effective Edit Region，并允许 generation 不带 Mask 提交

### Requirement: Async Mask results SHALL be generation-fenced
Mask reconcile SHALL 为每个 Primary identity 分配 generation，并 SHALL 在发布结果前重新验证当前 Primary identity 与 generation。Stale completion 不得覆盖较新的 state。

#### Scenario: Old Primary completes after a reorder
- **WHEN** A 的 Mask acquisition 尚未完成时 Primary 改为 B，随后 A 的 acquisition 返回成功
- **THEN** 系统丢弃 A 的结果、释放其 draft-only asset，并保持 B 的当前 state

#### Scenario: Latest Primary completes successfully
- **WHEN** acquisition result 的 generation 与当前 Primary identity 同时匹配
- **THEN** 系统发布 `ready` Edit Region，并将 `targetAttachmentId` 设置为当前 Primary id

### Requirement: Mask acquisition SHALL have explicit Photoshop source precedence
系统 SHALL 只为带有 Photoshop layer 或 selection provenance 的 Primary acquisition Mask。capture transaction 已经返回 selection coverage 时，selection SHALL 是该 Primary 的唯一 Edit Region source，系统不得再为其读取 user layer mask。layer picker Primary SHALL 只按其保存的 frame 读取 pixel user layer mask。

#### Scenario: Captured selection also has a user layer mask
- **WHEN** capture transaction 返回 selection coverage，且来源 layer 同时有 pixel user layer mask
- **THEN** 系统使用 capture transaction 的 selection canonical Mask，且不得额外调用 `getLayerMask()`

#### Scenario: Layer picker Primary has a user layer mask
- **WHEN** layer picker Primary 带有保存的 document、layer 和 provider-input frame provenance
- **THEN** 系统只按该保存 frame 读取其 pixel user layer mask

### Requirement: Photoshop Mask acquisition SHALL use the Primary provider-input frame
Photoshop selection 与 user layer mask acquisition SHALL 使用 Primary Image 的同一 `documentID`、`layerID`、`sourceBounds`、`targetSize` 和 provider-input geometry。系统 SHALL 验证返回的 grayscale data 并仅按 declared returned bounds 回填完整 `targetSize`；不得对独立 Mask 做 crop 或 resize 以猜测对齐。任何无法证明的 geometry mismatch SHALL fail closed。

#### Scenario: Selection capture produces aligned image and Mask
- **WHEN** Primary 来自 100x100 selection bounds，而 Photoshop document 为 1000x1000
- **THEN** image 与 canonical Mask 均使用该 selection bounds 映射到 100x100，系统不得附加 1000x1000 document Mask

#### Scenario: Read a user layer mask
- **WHEN** Primary 来自具有 pixel user mask 的 Photoshop layer
- **THEN** Host 调用 `imaging.getLayerMask()`，使用 `kind: "user"`、Primary `sourceBounds`、Primary `targetSize` 和 `componentSize: 8`

#### Scenario: Photoshop trims returned Mask bounds
- **WHEN** `getSelection()` 或 `getLayerMask()` 返回小于请求 frame 的实际 `sourceBounds`
- **THEN** 系统按实际 bounds 把 coverage 映射回完整 target frame，未覆盖区域使用 preserve 值

#### Scenario: Returned Mask dimensions do not match the requested geometry
- **WHEN** Photoshop 返回无法按 declared bounds 映射到 Primary `targetSize` 的 imageData
- **THEN** 系统拒绝该 Mask，不得 encode、store 或 submit

### Requirement: Coordinator teardown SHALL cancel draft-only Mask work
Coordinator destroy、panel reload 或 Primary removal SHALL 取消 in-flight acquisition，并释放未被 Task snapshot 引用的 draft-only Mask asset。已被 Task snapshot 引用的 Mask asset SHALL 保持可用于 retry。

#### Scenario: Panel reload during Mask acquisition
- **WHEN** Panel destroy 或 reload 时 Photoshop Mask acquisition 仍在进行
- **THEN** 系统取消该 acquisition，释放其 draft-only asset，并且下次 bootstrap 只从当前 Primary state reconcile

### Requirement: Canonical Mask SHALL preserve grayscale edit coverage
Canonical Mask SHALL 是完整 target frame 的 8-bit grayscale PNG，并使用 `white-edit` polarity：0 为 preserve、255 为 edit、中间值表示 partial coverage。Provider-specific polarity 与 format 不得写入 canonical asset。

#### Scenario: Preserve feathered selection values
- **WHEN** Photoshop selection 或 user layer mask 含有 0、128、255 coverage
- **THEN** canonical decoded grayscale 值保持 0、128、255，且不得二值化

#### Scenario: Dispose Photoshop imageData
- **WHEN** Host Mask acquisition 成功、失败或 validation 抛错
- **THEN** 系统在 `finally` 中恰好释放对应 `PhotoshopImageData`

### Requirement: Host absence and Host failure SHALL remain distinct
Host Mask acquisition SHALL 只在目标 layer 确实没有支持的 Mask 时返回 `none`；unsupported API、host exception、decode failure、geometry mismatch 与 storage failure SHALL 返回错误。

#### Scenario: Layer has no user mask
- **WHEN** Host 能确认目标 layer 没有 pixel user mask
- **THEN** Coordinator 接收 `none`，且不创建 Mask asset

#### Scenario: getLayerMask throws
- **WHEN** `imaging.getLayerMask()` 对声称具有 Mask 的 layer 抛出异常
- **THEN** Coordinator 接收 `error`，且系统不得把该结果解释为无 Mask

### Requirement: Task SHALL persist an immutable Edit Region snapshot
Generation 被接受时，系统 SHALL 将 ready Edit Region 作为 Task-level snapshot 持久化，包含 `targetAttachmentId`、bounded source evidence、geometry、canonical semantics 与 opaque `TaskResourceRef`。Retry SHALL 复用该 Mask ref，不得重新读取当前 Photoshop。

#### Scenario: Persist ready Edit Region
- **WHEN** generation submit 使用 ready Edit Region
- **THEN** Task record 保存 top-level Edit Region，且 Mask 不额外出现在 `attachments`

#### Scenario: Retry after Photoshop document changes
- **WHEN** 原 Task 带有 Edit Region，随后 Photoshop document、active layer 或 selection 已变化，用户执行 retry
- **THEN** retry 从原 Task Mask ref 重建相同 generation input，不访问当前 Photoshop Mask 状态

#### Scenario: Retain and sweep hidden Mask asset
- **WHEN** Task 仍引用 Mask asset
- **THEN** retention sweep 将其视为 reachable；当 draft binding 失效且没有 Task 引用时，系统允许既有 retention policy 清理该 asset

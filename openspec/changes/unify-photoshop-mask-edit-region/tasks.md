## 1. Canonical contracts and durable schema

- [x] 1.1 在 `apps/app` shared domain 增加 `PrimaryKey`、`EditRegion`、`EditRegionGeometry`、`MaskBindingState` 与 `maskPreference` contract，明确 `targetAttachmentId`、`white-edit` 和同 frame geometry。
- [x] 1.2 将 `HostPort.readLayerMaskAsAsset()` 收敛为只接收 Photoshop `documentId`、`layerId`、`sourceBounds`、`targetSize` 的 frame-aware acquisition contract，并让 confirmed `none` 与 Host error 分离；普通上传图不得调用它。
- [x] 1.3 将 `TaskEditRegion` 加入 `packages/application/src/task.ts` 的 `TaskRecord`，更新 strict key allowlist、decoder、schema version 与相关 fixtures；只保存 opaque `TaskResourceRef` 和 bounded evidence。
- [x] 1.4 更新 `apps/app/src/shared/domain/task-snapshot.ts`，从 ready Edit Region 创建 top-level Task snapshot，保证 Mask 不进入 `TaskAttachment[]`。
- [x] 1.5 更新 AssetStore retention/reachability 与 attachment draft disposal，使 stale Mask 只在无 Task 引用时可回收。

## 2. Canonical Photoshop acquisition

- [x] 2.1 抽取 selection 与 user layer mask 共用的 grayscale frame mapping helper，验证 `sourceBounds`、dimensions、Grayscale color space、8-bit data 与 `targetSize`。
- [x] 2.2 完成 `apps/app/src/adapters/uxp/photoshop-host-bridge.ts` 的 user layer mask 读取：调用 `imaging.getLayerMask({ kind: 'user', sourceBounds, targetSize, componentSize: 8 })`，编码 canonical grayscale PNG，写入 `AssetStore`，并在 `finally` 中 `dispose()`。
- [x] 2.3 让 `readLayerMaskAsAsset()` 只在确实没有 user mask 时返回 `undefined/none`；unsupported API、Host exception、decode、geometry 和 storage failure 必须向 Coordinator 抛错并保留 bounded diagnostics。
- [x] 2.4 让 selection capture 与 layer mask capture 产出的 `EditRegion` 使用相同 provider-input frame，覆盖 100x100 selection 对 1000x1000 document 的 same-frame contract；只允许按 declared returned bounds 回填，不得用独立 crop/resize 猜测对齐。
- [x] 2.5 扩展 `apps/app/tests/helpers/host-bridge-harness.ts`，生成可控 Grayscale mask bytes、trimmed `sourceBounds`、异常尺寸、错误和 dispose spy。
- [x] 2.6 为 UXP HostBridge 增加 layer mask contract tests：canonical bytes/polarity、same-frame geometry、none/error separation、dispose、modal serialization、storage failure。

## 3. Primary MaskCoordinator and app surface

- [x] 3.1 新增 `MaskCoordinator`，以 `attachments[0]` 派生 `PrimaryKey`，维护 generation、AbortSignal、当前 `MaskBindingState` 与 draft asset ownership。
- [x] 3.2 实现 Primary delete/reorder/replace/geometry update 的同步旧 Mask invalidation 和新 Primary reconcile；非 Primary 变化不得触发 Host Mask acquisition。
- [x] 3.3 实现 late completion fence：只有当前 generation 与 `PrimaryKey` 同时匹配才发布 ready 结果；stale result 必须释放 asset 并保持新 Primary state。
- [x] 3.4 将 `captureActiveImage()` 已有 selection Mask 接入 Coordinator 的 ready Edit Region，保留 `source: 'photoshop-selection'` provenance；同一 Primary 不得再读取 user layer mask。
- [x] 3.5 让 layer picker attachment 在 Mask enabled 且成为 Primary 时按保存 frame prepare user layer mask；Primary 变更时不得把旧 Mask 按数组 index 重新绑定。
- [x] 3.6 在 Composer ViewModel/UI 接入 `maskPreference.enabled` 与 `disabled/loading/ready/none/error` 展示、retry/disable 行为；selected execution plan 为 `semantic-only`/`unsupported` 时禁用 Mask 开关但保留 preference；Mask 不显示为 attachment card。
- [x] 3.7 在 submit readiness 中阻止 Photoshop Primary 的 `loading/error`，允许普通上传图或 `none` 无 Mask 提交；unsupported transport 必须省略 Mask；提交前冻结 immutable `PreparedGenerationInput`，不让 request builder 查询 Coordinator。
- [x] 3.8 为 Coordinator、Primary 生命周期、source precedence、toggle、unsupported UI gate、stale completion、destroy/reload asset release 和 submit gating 增加 deterministic harness tests，并为 Chrome simulator 提供等价 none/ready/error 行为。

## 4. Task, History, and retry integration

- [x] 4.1 更新 Task creation/serialization tests，验证 ready Edit Region 写入 top-level `TaskRecord.editRegion`，严格拒绝 raw bytes、native path、secret 与未知字段。
- [x] 4.2 更新 retry reconstruction，使 Provider 与 ComfyUI retry 从原 Task Mask `StoredAssetRef` 重建请求，不读取当前 Photoshop document 或当前 Primary。
- [x] 4.3 覆盖 Task history load/store、schema mismatch、Mask asset eviction 和 retained reference 的 contract tests。

## 5. Provider capability and native routing

- [x] 5.1 在 `packages/providers` 增加显式 `MaskCapability` 与 `MaskExecutionPlan` union，区分 `provider-native`、`semantic-only`、`unsupported` 和 exact first-input/same-dimension/polarity/byte-limit facts。
- [x] 5.2 让 app/application 只从 supported ready Edit Region 构建 admitted provider input，并只在 `targetAttachmentId === images[0]` 且 plan 为 `provider-native` 时派生 `CanonicalImageJobRequest.maskImage`。
- [x] 5.3 实现 OpenAI image endpoint transport-side canonical `white-edit` 到 `alpha-zero-edit` RGBA PNG 转换、dimensions/format/byte-limit preflight；超限或 mismatch 必须 structured reject。
- [x] 5.4 将 Gemini Generate Content 与 chat-image builder 的 separate Mask 行为改为安全省略，删除 Mask-as-reference 或 prompt 默认路径。
- [x] 5.5 覆盖 Provider contracts：valid first-input dispatch、target mismatch、100x100/1000x1000 mismatch、alpha polarity、byte limit、unknown OpenAI-compatible profile、Gemini/chat-image no-Mask fallback。

## 6. ComfyUI explicit Workflow binding

- [x] 6.1 扩展 ComfyUI mapping/runtime types，增加 revision-scoped `mask` mapping 与 `ComfyUiMaskBinding { transport: 'separate-image-input'; inputRef; polarity }`，保持现有 text/image mapping 兼容。
- [x] 6.2 更新 Workflow management/UI，使多个 writable `upload-image` candidates 必须显式选择 Mask ref；Workflow revision 变化时清除旧 Mask binding，不使用 title/class-name heuristic。
- [x] 6.3 扩展 `ComfyUiGenerationPayload`、admission validation 与 `ComfyUiExecutionIntent`，传递独立 Mask asset/ref 和 binding，并保持 Primary image ref 不变。
- [x] 6.4 扩展 `prepareComfyUiUploads()`，解析、验证、按 binding polarity 转换并上传 Mask；任一 Mask 阶段失败时不得调用 API Graph `/prompt`、Frontend Queue 或 Bridge submit。
- [x] 6.5 更新 API Graph 与 Frontend Queue driver，只写入显式 Mask input ref，保留其他 Workflow values；继续使用现有 upload barrier 和 bounded error normalization。
- [x] 6.6 增加 ComfyUI deterministic tests：revision-scoped mapping、white/black polarity、mask upload receipt、upload failure no-submit、unrelated mutation preservation、no-binding no-Mask fallback。

## 7. Validation, manual proof, and durable docs

- [x] 7.1 运行 Mask-focused app/provider/application/ComfyUI deterministic suites，并修复 `pnpm check:policy`、TypeScript、strict schema 和 test harness 回归。
- [x] 7.2 运行 touched package build gates：`pnpm --filter @imagen-ps/providers test`、`pnpm --filter @imagen-ps/application test`、`pnpm --filter @imagen-ps/app build`、`pnpm --filter @imagen-ps/app test`、`pnpm --filter @imagen-ps/execution-backend-comfyui build`、`pnpm --filter @imagen-ps/execution-backend-comfyui test`。
- [x] 7.3 编写并执行独立 Photoshop UXP manual smoke：selection、user layer mask、feathered grayscale、100x100 crop、无 Mask、Host error、Primary 删除/重排、reload/destroy 与 cleanup；记录真实 `getLayerMask()` 证据，Chrome 不替代该门禁。
- [x] 7.4 将真实 Provider/ComfyUI proof 保持为 credentials/endpoint 已配置时才执行的 opt-in live task；不得把它加入 `pnpm validate`，并记录其不替代 deterministic contract 的证据边界。
- [x] 7.5 在 `docs/ENGINEERING_CONTEXT.md` 与 `docs/TESTING.md` 写回稳定的 Edit Region、same-frame geometry、Mask runtime gate、Task snapshot 和 ComfyUI binding 规则，删除“Mask-specific materialization remains future work”的过期描述。
- [x] 7.6 完成 `pnpm validate` 或仓库规定的最终 release gate，并在 change status 中确认所有 task 与 artifact 已完成后再进入 archive。

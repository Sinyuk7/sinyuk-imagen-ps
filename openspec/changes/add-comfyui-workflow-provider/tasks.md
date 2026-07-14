## 1. Contract 与 Harness 基线

- [ ] 1.1 在 `packages/providers/tests/families/comfyui/cases/` 建立 API Format workflow Case Bank，覆盖 zero-image、single-image、image+references、mask-consuming graph、multiple unmarked outputs、single designated multi-image output，以及重复/缺失/空洞 marker。
- [ ] 1.2 建立 ComfyUI fake HTTP harness，提供可脚本化的 `/object_info/{class}`、`/upload/image`、`/upload/mask`、`/prompt`、`/history/{prompt_id}`、`/view`，并记录 request 顺序、body、abort 与 endpoint 调用。
- [ ] 1.3 先添加 failing provider contract/compat scenarios，证明 config single-endpoint 约束、marker parsing、upload response filename adoption、ordered binding、mask `original_ref`、polling、designated output filtering、multi-image result、timeout、abort 与 no-replay。
- [ ] 1.4 扩展 `ApiFormat`、Provider config/request/model-execution contracts 与公开 exports；所有跨 package exports 添加简洁中文 JSDoc，并用 compile-time/contract tests 锁定 discriminated shapes。

## 2. ComfyUI Workflow Contract

- [ ] 2.1 实现 bounded API Format workflow parser，拒绝 frontend save format、超限 JSON、非法 node shape 和 linked public inputs，且不在错误/日志中回显 raw workflow。
- [ ] 2.2 实现 `IMAGEN_PS_PROMPT`、连续 `IMAGEN_PS_IMAGE_1..N`、唯一 `IMAGEN_PS_OUTPUT` marker 校验与 normalized binding/contract 生成。
- [ ] 2.3 实现 exact image arity、operation、primary/reference ordering 和 primary `LoadImage` MASK-output consumption 检测，生成 `acceptsMask` projection。
- [ ] 2.4 实现 `/object_info/{class}` server compatibility validator，验证全部 unique `class_type` 及 marker input/output facts，区分 local contract error、endpoint failure、protocol mismatch 与 missing/incompatible node class。
- [ ] 2.5 扩展 family-local Case Bank，覆盖 custom prompt text widget、unknown custom node、invalid `SaveImage` output facts 与 Refresh revalidation 状态。

## 3. ComfyUI Provider Runtime

- [ ] 3.1 新增 `comfyui` config schema、descriptor、safe probe、builtin registry entry 与 API-format/profile mapping；v1 强制 manual single endpoint、无 API Key、无 catalog discovery、idempotency unsupported。
- [ ] 3.2 实现 invocation-scoped `client_id`/upload subfolder、ordered `/upload/image` 与 cloned workflow input injection；始终采用 server response 的 `name/subfolder/type`。
- [ ] 3.3 实现 primary mask `/upload/mask` flow，把 primary response 转成 `original_ref`，采用 combined RGBA response 替换 `IMAGEN_PS_IMAGE_1` binding，并保持 reference bindings 不变。
- [ ] 3.4 实现 `/prompt` submission 与 config-owned timeout/poll/backoff policy；用 fake clock 锁定 designated success、explicit error、completed-without-output、timeout 和 `AbortSignal`，禁止 WebSocket、全局 `/interrupt`、auto failover 和 ambiguous replay。
- [ ] 3.5 实现 designated `SaveImage` `images[]` validator、path-safe descriptor/encoded `/view`、PNG MIME/byte limit 与 ordered `ProviderInvokeResult.assets[]` normalization；加入 traversal、oversize、non-image cases，忽略其他 outputs。
- [ ] 3.6 把 ComfyUI diagnostics/error mapping 接入现有 dispatch bridge；日志只包含 profile/provider/model/node-count/prompt-id hash 等安全摘要，不包含 prompt、workflow、upload body、history 或绝对路径。
- [ ] 3.7 运行 `pnpm --filter @imagen-ps/providers test`，确认 fake harness 覆盖所有 runtime contracts 且默认 suite 无真实网络。

## 4. Application Workflow Model Integration

- [ ] 4.1 将 profile-owned model persistence 扩展为 catalog config 与带 `workflowRevision` 的 `ComfyUiWorkflowModelConfig` discriminated union；更新 UXP/Chrome repositories 的 schema/clone/serialization/cascade-delete tests，禁止 runtime fields 和 native paths 持久化。
- [ ] 4.2 新增 ComfyUI workflow import/save/replace/delete commands，组合 local parse、server compatibility validation、profile ownership 与 repository write；保持 catalog `saveUserModelConfig()` 路径无 ComfyUI 分支。
- [ ] 4.3 新增独立 persisted workflow revalidation command，按当前 profile 返回 runtime-only `unknown|compatible|incompatible` status；禁止复用 `refreshProfileModels()`，不新增/删除 selector items，并定义 known-incompatible send guard。
- [ ] 4.4 更新 `listProfileModels()`、configured model resolution 与 discriminated `ProviderModelExecution` injection；durable request 冻结 revision，dispatch 重新读取 config 并在 mismatch 时 fail closed，阻止 `providerOptions` 覆盖 workflow/bindings/output。
- [ ] 4.5 生成 singleton provider-default PNG matrix 与 `outputMode: 'workflow-owned'` projection，保持现有 readiness 可发送，同时隐藏 controls 且不把 selection 注入 graph。
- [ ] 4.6 增加 exact image arity、operation、mask eligibility、active-profile ownership 的 Application preflight；App 在 `putTaskRecord()` 前调用，runtime 重复 guard，失败时证明 task record、durable task、queue、asset upload 与 provider dispatch 均为零调用。
- [ ] 4.7 扩展 Application contract/scenario tests，覆盖 profile isolation、save/revalidate/list/resolve/dispatch、ordered multi-image、mask、invalid input、retry 读取原 workflow snapshot 与 unsupported profile fail-closed。
- [ ] 4.8 运行 `pnpm --filter @imagen-ps/application test`。

## 5. Profile 与 Workflow UI

- [ ] 5.1 更新 Provider profile editor：提供 ComfyUI format，使用 base URL + connection test，隐藏 API Key、API paths、endpoint model hint、billing 与 catalog discovery 控件；保留现有 Settings row/navigation primitives。
- [ ] 5.2 在 `ProfileModelsPage` 增加 ComfyUI workflow import、命名、保存、替换、删除、Refresh revalidation 与 compatible/incompatible runtime status；selector 只显示已保存 configured models。
- [ ] 5.3 在 Chrome 与 UXP adapter 建立 bounded JSON file-read seam，把 parsed JSON value 交给 Application，禁止 Application/Provider 接收 DOM `File`、UXP entry 或 native path。
- [ ] 5.4 增加少量稳定 UI scenarios，覆盖 import success/failure、Refresh 不改变 ownership、active workflow selection、跨 profile 隔离与 stable `data-testid` navigation。
- [ ] 5.5 补齐 ComfyUI profile/workflow/mask 相关 `en` 与 `zh-CN` copy；Provider/API/model identifiers、raw server error 保持不翻译。

## 6. Composer 多图与蒙版

- [ ] 6.1 把 active workflow exact image contract 投影到 Composer，显示稳定 primary/reference slots，限制附件数量并按 slot 顺序生成 canonical `images[]`；UI 不解析 workflow JSON。
- [ ] 6.2 增加独立 mask action/state/preview badge，最多保存一个 mask，且只在 `acceptsMask` 时启用；mask MUST 写入 `maskImage`，不能占用或重排普通 image attachment。
- [ ] 6.3 实现 `HostPort.readLayerMaskAsAsset()` 与 app-owned mask materialization：归一化到 primary provider-input 精确尺寸，把 `0=keep/255=edit` 编码为 `alpha=255-maskIntensity` PNG并写入 AssetStore；用像素 fixture 锁定 polarity/round-trip，拒绝空、未知尺寸或错尺寸 mask。
- [ ] 6.4 增加一个 Composer payload scenario，证明 image+reference+mask 生成 ordered `images[]` 与独立 `maskImage`；业务校验留在 Application，避免 UI test Case Bank 扩张。
- [ ] 6.5 运行 `pnpm --filter @imagen-ps/app test`、`pnpm --filter @imagen-ps/app build:chrome` 与 `pnpm --filter @imagen-ps/app build:uxp`。

## 7. Acceptance 与 Writeback

- [ ] 7.1 运行 `node packages/providers/scripts/check-image-model-catalog.mjs`，证明新增 non-catalog API format 未破坏 catalog registry/strategy invariants。
- [ ] 7.2 运行 `pnpm check:policy`，确认 package ownership、cross-package exports、UI selector/i18n/CSS 与文档策略通过。
- [ ] 7.3 用 opt-in local ComfyUI smoke 验证 connection probe、workflow import、single/multi-image upload、mask、prompt polling 与 designated multi-image download；不得把该证据描述为默认 CI。
- [ ] 7.4 在真实 Photoshop UXP 中手动验证本机 HTTP multipart、JSON import、selection/layer mask polarity、取消提示和多结果导入；记录为 manual-only evidence。
- [ ] 7.5 把稳定 Provider/Application/testing 事实分别写回 `docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md` 或对应 module `AGENTS.md`；不写执行日志、临时计划或 raw payload。
- [ ] 7.6 运行 `pnpm validate` 作为最终 gate，并重新运行 `openspec validate add-comfyui-workflow-provider --strict`。

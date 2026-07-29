## Prerequisites

`add-provider-async-execution-foundation` 的 Application runtime composition 与 `replace-remote-model-discovery-with-local-catalog` 的一次性默认模板 materialization 必须已验收。它们不是本 change 的实施任务。

## 1. GRSAI format 与 Profile 路由

- [ ] 1.1 在 `packages/providers/src/contract/api-format.ts` 增加 `grsai`、`grsai-generate`、submit/result path 类型、默认 path、normalization、双向 canonical routing 与精确 `/v1/api/generate` endpoint classification。
- [ ] 1.2 为 API format path normalization、endpoint classification 和 routing table 写 contract tests，覆盖两个 GRSAI base URL、path-only 输入、base path prefix、根域名不猜测、query/fragment 拒绝及 format/implementation mismatch。
- [ ] 1.3 更新 `packages/application` 的 `ApiFormat` profile resolver、catalog provider mapping、draft validation 和 Profile config normalization，使 `grsai` 走 `grsai-generate`。
- [ ] 1.4 更新 Chrome/UXP storage schema guards、mock request schema 与相关 persistence tests，使 `grsai` Profile/UserModelConfig 能被读取与写回。
- [ ] 1.5 更新 `apps/app` Provider settings 的 `ApiFormat` label、path draft/merge 和 endpoint-import tests；不增加新的 UXP manual test。

## 2. GRSAI catalog 与首次默认模板

- [ ] 2.1 为 `grsai-generate` 新建 model catalog rules 和 `grsai-generate-image-config` request strategy；扩展 `ImageCatalogProviderId`、request strategy registry、Official Model Preset lookup 与 validation。
- [ ] 2.2 为每个 GRSAI `wireModelId` 声明独立 canonical capability preset；相同能力仅复用 matrix/constants，不共用 preset identity，也不从模型名称或上游品牌继承规则。
- [ ] 2.3 实现 GRSAI Nano Banana 2/Nano Banana Pro capability/output matrices，覆盖 documented ratio、`1K`/`2K`/`4K`、image input，以及 Nano Banana 2 family 的 `1:4`、`4:1`、`1:8`、`8:1` 限定。
- [ ] 2.4 实现 GRSAI GPT Image 2 capability/output matrices，区分 `gpt-image-2` 的 ratio/preset geometry 与 `gpt-image-2-vip` 的 custom pixel bounds、16-pixel alignment、3:1 ratio 上限和禁止 ratio input。
- [ ] 2.5 在 `grsai-generate` Provider 声明完整的 12 项默认模板，令 `baseModelId` 精确指向同一 GRSAI capability preset；不加入已废弃的 `nano-banana`。
- [ ] 2.6 为 catalog/template materialization 写 deterministic tests，验证全部 12 项可执行配置、跨-format strategy isolation、同名不同能力的自定义 wire-model fixture、合法/非法 geometry、首次原子初始化、初始化失败回滚与既有 Profile 不自动同步。

## 3. GRSAI async adapter

- [ ] 3.1 新建 `packages/providers/src/providers/grsai-generate/` 的 descriptor、config schema、request schema、provider factory 与 builtin registry/export 接线；声明 `invokeMode: "async"` 和 `ProviderAsyncLifecycle`。
- [ ] 3.2 实现 GRSAI submit request builder：Bearer header、`POST /v1/api/generate`、non-empty prompt、`model`、HTTP(S)/base64 `images`、适用的 `aspectRatio`/`imageSize` 与固定 `replyType: "async"`；无图片时省略 `images`，拒绝不可传递 image reference 和不适用字段。
- [ ] 3.3 实现 submit/poll response parser：提取 opaque task ID、使用 `GET /v1/api/result?id=...`、映射 `running`/`succeeded`/`violation`/`failed`，按 source order materialize safe result URL，并将 malformed、未知或无安全输出 wire response 变成 terminal Provider protocol failure。
- [ ] 3.4 将 GRSAI lifecycle 连接到现有 async execution bridge；确认 adapter 不发布 Provider-specific delay/retry directive、只 local abort、无 remote cancel、且 query/transport failure 不会重新 submit。
- [ ] 3.5 使用 fake HTTP transport 和 fake lifecycle harness 测试 submit JSON、认证、prompt-only、asset 转换、pending-to-completed、terminal `violation`/`failed`、mixed/unsafe result URL、无效 task/result/status、local abort 与每 Job 零重复 submit；不调用真实 GRSAI API。

## 4. Application 集成与验证

- [ ] 4.1 为 GRSAI Profile 保存、draft config、secret resolution、registry lookup、默认模板创建和 generation routing 添加 Application contract tests。
- [ ] 4.2 运行 affected `packages/providers`、`packages/application` 与 `apps/app` deterministic tests，并修复由新增 `ApiFormat` 穷举导致的编译或行为回归。
- [ ] 4.3 运行 `pnpm check:policy`、`pnpm validate` 与 `openspec validate add-grsai-generate-api-format --strict`；不执行真实 GRSAI 请求、Photoshop、UXP Developer Tool 或 UI/computer automation。

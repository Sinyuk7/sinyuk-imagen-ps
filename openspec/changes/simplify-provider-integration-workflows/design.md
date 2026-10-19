## Context

当前 app 已有四个 builtin Provider implementation：`grsai-generate`、`gemini-generate-content`、`image-endpoint` 与 `chat-image`。前三个分别覆盖 GRSAI async API、Gemini GenerateContent 官方协议与 OpenAI Images 官方协议；`ProviderGenerationBackend`、Provider Registry、Provider Execution Adapter、Core workflow 和 Task/Job projection 已形成共享执行链。

复杂度主要来自产品 surface：`SettingsAddPage` 和 `SettingsDetailPage` 同时处理 endpoint 导入、`ApiFormat` 推断、多 endpoint、measurement、auth mode、paths、billing、system instruction 与模型跳转；`ProfileModelsPage`、`ModelConfigurationPage` 又把静态 Provider 模型复制为可编辑产品对象。现有三个目标 Provider 都声明非空 `defaultModelTemplates`，`continueProviderProfileSetup()` 已能在创建时原子初始化完整 `UserModelConfig` 并直接 promotion 为 ready。

本变更采用 current-state：零用户、零生产数据，不设计旧 Profile 或模型配置迁移。Photoshop UXP 是唯一交付 runtime，Chrome 仅作为共享 UI 的 deterministic harness。

## Goals / Non-Goals

**Goals:**

- 将 Provider 产品入口限制为 GRSAI、Gemini 和 GPT Image 2。
- 让每个业务 Provider 拥有独立、最小、可理解的 Profile 创建/编辑页面。
- 保留现有请求、解析、Profile persistence、模型初始化和 Application/Core 执行链。
- 删除用户不需要的通用协议配置和模型 CRUD surface。
- 新 Profile 保存后直接 ready，主生成 surface 自动建立显式默认模型 selection。
- 保持多 Profile、输出偏好、History、Photoshop placement 与 ComfyUI 完整可用。

**Non-Goals:**

- 不重写 `Provider` contract、Provider Execution Adapter、`ProviderGenerationBackend` 或 Core dispatcher。
- 不删除内部 `UserModelConfigRepository`、`resolveConfiguredModel()` 或 `ModelGenerationPreference`。
- 不把 GRSAI polling 移入 UI、Core 或三套独立 backend。
- 不新增 OpenRouter、自定义 endpoint、API-compatible Provider 或通用 Business Provider framework。
- 不实现余额查询、endpoint failover 配置、远端模型状态或远端模型 discovery。
- 不提供旧数据 migration、reset command 或真实 Provider/Photoshop 自动验收。

## Decisions

### 1. 三个业务入口映射现有三个 `ApiFormat`

Provider 选择页使用固定产品定义：

| 产品入口 | 内部 `apiFormat` | implementation | 默认 endpoint | auth |
| --- | --- | --- | --- | --- |
| GRSAI | `grsai` | `grsai-generate` | `https://grsai.dakka.com.cn` | Bearer API Key |
| Gemini | `gemini-generate-content` | `gemini-generate-content` | `https://generativelanguage.googleapis.com/v1beta` | `x-goog-api-key` |
| GPT Image 2 | `openai-images` | `image-endpoint` | `https://api.openai.com/v1` | Bearer API Key |

本次不新增 `integrationId`，也不把 `apiFormat` 改名为产品概念。Profile 继续保存现有 `apiFormat`；UI 固定映射并隐藏它。这样避免跨 Application/persistence 的 identity 重构，同时保留未来新增 Provider implementation 的边界。

替代方案是以 `providerId` 重写 Profile identity 并删除 `apiFormat -> implementationId` 映射。该方案能减少一个内部映射，但会触及模型 catalog、Profile persistence、Application admission 和大量 contract tests；当前 UI 收敛不需要它，因此拒绝。

### 2. 三个独立页面，共享窄 UI primitive

路由形态：

```text
Provider Settings
  ├─ + -> Provider Picker
  │       ├─ GRSAI -> GRSAI Create
  │       ├─ Gemini -> Gemini Create
  │       └─ GPT Image 2 -> OpenAI Images Create
  └─ Profile Row -> matching Provider Edit
```

GRSAI、Gemini、OpenAI Images 各自拥有 route/page/controller，以便独立配置字段、验证和未来扩展。Gemini 与 OpenAI Images 可共享 `ProfileNameField`、`ApiKeyField`、page header、Save/Delete footer 等 primitive；共享组件不得重新接收 `apiFormat`、paths、auth mode 或 billing mode 形成新的通用 editor。

Test Connection 只在 Provider 已实现无生成、无费用 safe probe 时显示。Gemini 当前可使用 `countTokens` probe；OpenAI Images 当前返回 `safe_probe_unsupported`，GRSAI 没有 safe probe，因此两者不显示误导性测试按钮。本变更不以付费生成冒充连接测试。

### 3. 专用页面生成固定 config，复用现有 command

页面把名称与 API Key 组合为现有 `ProviderProfileInput`，并写入：单个 enabled endpoint、manual selection、Provider 默认 paths、固定 auth mode、disabled billing。secret 仍通过 `secretValues.apiKey` 进入 `SecretStorageAdapter`，不进入 Profile config 或 UI diagnostics。

创建继续调用 `continueProviderProfileSetup()`。三个 Provider descriptor 均有非空模板，因此成功路径固定为：

```text
save setup Profile + secret
  -> validate all default templates
  -> initialize UserModelConfig atomically
  -> promote ready
  -> Provider list + success toast
```

不新建三套 application create command。编辑继续复用 Profile save/delete command；删除 Profile 时现有 command 同时删除 `UserModelConfig` 和 secrets。

### 4. 模型对用户只读，内部模型层暂时保留

本次删除模型配置页面和 CRUD 入口，但保留内部 `UserModelConfig`，原因是 `ProviderGenerationBackend`、connection test、output preference resolution 和 host repositories 已依赖它。Provider descriptor template 只在首次创建时写入一次，行为已由现有 deterministic tests 覆盖。

固定 inventory：

- GRSAI：保留 `grsai-generate` 已定义的 12 个模板。
- Gemini：保留 `gemini-3.1-flash-image`、`gemini-3-pro-image`、`gemini-3.1-flash-lite-image`，删除不属于官方 Gemini wire ID 的 GRSAI alias `nano-banana-fast`。
- OpenAI Images：只保留 `gpt-image-2`。

UI 产品定义声明显式默认模型：GRSAI 为 `nano-banana-fast`，Gemini 为 `gemini-3.1-flash-image`，OpenAI Images 为 `gpt-image-2`。选择 ready Profile 时，UI 仅在当前 selection 缺失或无效时写入该值。backend 仍要求 command 携带显式 `modelId`，不恢复 `list()[0]` fallback。

替代方案是本次同时删除 `UserModelConfigRepository` 并让 backend 直接读取 catalog。该方案最终可能更薄，但会把 UI reset 扩大为 Application/persistence 重构，不符合本次小改目标，因此延期。

### 5. Provider 代码按业务入口组织为 vertical slice

`packages/providers` 的目标不是建立新的通用 Business Provider framework，而是让现有三个实现的 ownership 一眼可见。目标目录：

```text
packages/providers/src/
├─ contract/                         # 稳定 Provider/bridge contracts；不包含具体产品常量
├─ registry/                         # builtin composition 与 apiFormat -> implementation 路由
├─ shared/
│  └─ transport/                     # 至少两个 Provider 复用的 HTTP/retry/failover primitive
├─ catalog/
│  └─ shared/                        # 跨 Provider 的 capability 类型、matrix builder 与解析工具
└─ providers/
   ├─ grsai/
   │  ├─ index.ts
   │  ├─ profile-template.ts
   │  ├─ config-schema.ts
   │  ├─ models.ts
   │  ├─ descriptor.ts
   │  ├─ provider.ts
   │  └─ transport/
   ├─ gemini/
   │  ├─ index.ts
   │  ├─ profile-template.ts
   │  ├─ config-schema.ts
   │  ├─ models.ts
   │  ├─ descriptor.ts
   │  ├─ provider.ts
   │  └─ transport/
   └─ openai-images/
      ├─ index.ts
      ├─ profile-template.ts
      ├─ config-schema.ts
      ├─ models.ts
      ├─ descriptor.ts
      ├─ provider.ts
      └─ transport/
```

目录使用用户认识的产品名；现有 implementation ID `grsai-generate`、`gemini-generate-content`、`image-endpoint` 与持久化 `apiFormat` 值本次保持不变。目录重命名不等于 protocol identity migration。

每个文件只有一个明确 owner：

- `models.ts`：该 Provider 的静态模型 inventory、modelId/wireModelId/baseModelId mapping、capability 引用和默认 modelId 的唯一真相源。
- `profile-template.ts`：该 Provider 固定 endpoint、paths、auth、billing 等 Profile 默认值；只生成 secret-free config，API Key 继续由 Application 传给 Secret Storage。
- `config-schema.ts`：校验并规范化该 Provider 的持久化 config；不得拥有 UI 文案或路由。
- `descriptor.ts`：从 `models.ts` 与 `profile-template.ts` 组装现有 `ProviderDescriptor`，不得维护第二份模型数组或固定 endpoint。
- `provider.ts`：实现现有 `Provider` contract，协调该 Provider 的 request/response 或 async lifecycle，不拥有 Application job scheduling。
- `transport/`：只放该 Provider 的 wire request builder、response parser、codec 和 polling 实现；不导出 UI 或 persistence 概念。
- `index.ts`：该 vertical slice 的唯一 package-local 入口；只导出 registry/composition/tests 需要的稳定符号，不把 transport 细节扩大为跨包 API。

静态模型与固定 Profile config 均只允许一个 source of truth。Provider-specific Official Model Catalog entries 与 `ProviderDescriptor.defaultModelTemplates` 必须从同目录 `models.ts` 派生；Composer 模型列表、Profile 初始化和默认 selection 必须通过 Application 对 descriptor/catalog 的投影读取，禁止在 app 再复制模型数组。固定 endpoint/path/auth/billing 必须由 `profile-template.ts` 生成；三个 Profile 页面只提交 Provider surface identity、名称、secret 输入和页面动作，不自行拼装 wire config。

依赖方向固定为：

```text
contract + provider catalog + shared/transport
                        ↑
        providers/{grsai|gemini|openai-images}
                        ↑
                  registry/composition
                        ↑
                    application
                        ↑
                      app UI

core-engine <- application/provider execution adapter
```

- Provider slice 可以依赖 `contract`、`provider catalog`、`shared/transport` 与 foundation；三个 slice 之间禁止互相 import。
- Registry 通过各 slice 的 `index.ts` 组合 builtin；具体 Provider 不反向依赖 registry。
- `packages/application` 只依赖 `@imagen-ps/providers` 的公开 contract/registry，不深引 `providers/*/transport`。
- `apps/app` 不直接 import `@imagen-ps/providers`。现有 Application `listProviders()` / `describeProvider()` command surface 扩展为向 UI 返回 sanitized Provider surface definition 与 Profile template projection；API Key、隐藏 wire config、transport 实现不进入该 projection，不另建第二套 Provider registry。
- `packages/application` 继续只做通用 Profile setup、模型初始化、generation orchestration；不得出现 `if (provider === 'grsai')` 一类 Provider-specific 请求或页面分支。
- `packages/core-engine` 保持 Provider-neutral，只处理 execution adapter、Task/Job 与状态流。

共享 admission 仍只由 Application 执行：Profile `apiFormat` 必须能解析到 registry 中的 canonical implementation；生成 command 必须携带显式 `modelId`；解析后的 model、request strategy 与 Profile `apiFormat` 必须一致；Profile 创建/编辑必须经过同一归一化 command，页面不能绕过 Application 直接调用 Provider。Provider Execution Adapter 只消费已通过 admission 的执行参数，Core 不重复解释这些业务约束。

`ProviderDescriptor.connectivity.connectionTest` 是 Test Connection 可见性的唯一 capability 来源。Application 将该 capability 投影为 UI-safe boolean；三个页面不得按 `apiFormat` 自行硬编码判断。Provider 名称、说明、图标和本地化文案仍由 `apps/app` 拥有，不进入 `packages/providers`。

代码只有在至少两个保留 Provider 已有真实消费者且语义一致时才能进入 `shared/`。为了“看起来复用”而预建 helper、统一三个 schema 或让共享 transport 接收 Provider 类型分支，均不允许。若复用条件不成立，少量重复留在对应 Provider slice；出现第二个稳定消费者后再提取。

当前 `transport/image-endpoint` 中被 Gemini 或 GRSAI 同时使用的 HTTP、retry、failover 基础能力迁入 `shared/transport`；OpenAI Images 独有的 edit codec、paid retry policy 和 response parser 迁入 `providers/openai-images/transport`。Gemini GenerateContent request/parse 迁入 `providers/gemini/transport`；GRSAI submit/result request、poll parse 与 remoteRef 处理迁入 `providers/grsai/transport`。删除 `chat-image` 后，无保留消费者的 legacy codec 不进入 shared。

UI 对应目标 feature：

```text
apps/app/src/shared/ui/features/provider-profiles/
├─ provider-picker-page.tsx
├─ routes.ts
├─ shared/
│  ├─ profile-form.tsx
│  └─ profile-page-frame.tsx
├─ grsai/
│  └─ grsai-profile-page.tsx
├─ gemini/
│  └─ gemini-profile-page.tsx
└─ openai-images/
   └─ openai-images-profile-page.tsx
```

`routes.ts` 只负责 Profile surface route 与 Provider identity 的静态导航映射；不能演变成 protocol config registry。`shared/profile-form.tsx` 只拥有名称、API Key visibility/input、Save/Cancel/Delete 等无业务判断的交互；各 Provider 页面负责自己的字段 allowlist、文案、safe-probe visibility 和 Application command 调用。AppShell 只挂载 feature route，不内联三个 Provider 的表单分支。

测试结构镜像 production ownership：Provider inventory/template/schema/provider/transport tests 按 `tests/providers/{grsai,gemini,openai-images}` 分组，共享 primitive tests 放 `tests/shared`，registry contract 放 `tests/registry`；UI 测试跟随 `features/provider-profiles` 的 Picker、shared 与三个 Provider 子目录。Application contract tests 保留在 commands/generation owner，验证 sanitized projection、通用 setup 和 generation，不复制 Provider wire fixtures。

### 6. 删除通用 surface 与 `chat-image`，保留共享执行边界

新增、修改、删除边界：

| 类型 | 内容 |
| --- | --- |
| 新增 | Provider Picker；GRSAI/Gemini/OpenAI Images 专用 create/edit routes 与 pages；窄共享 form primitive；固定产品映射与默认模型定义 |
| 修改 | Settings Provider list 的 `+`/row navigation；AppShell route state；Profile setup 完成处理；Composer 的 invalid-selection defaulting；provider catalog 中 Gemini inventory；相关 i18n、styles、fakes 与 tests |
| 删除 | 通用 `SettingsAddPage`、通用 `SettingsDetailPage`、`ProviderProfileEditor` 及无人使用的 advanced sections；`ProfileModelsPage`、`ModelConfigurationPage`、对应 helpers/routes/tests；endpoint import/detection 与只服务旧 surface 的 commands/hooks；app-facing model CRUD；`chat-image` builtin/transport/catalog/tests |
| 保留 | Provider Profile repository、Secret Storage、多 Profile、Provider Registry、Provider Execution Adapter、`ProviderGenerationBackend`、GRSAI async manager、Gemini/OpenAI request/parse、`UserModelConfig` internal resolution、`ModelGenerationPreference`、Core、History、placement、ComfyUI |

删除顺序先断开 UI/ports，再用 `rg` 和 package graph 删除无 owner 代码。若 endpoint measurement、billing protocol 或 model commands 仍被非删除 surface/contract 使用，则保留最小内部 owner，不为达到文件删除数量破坏共享能力。

### 7. 全局异步语义保持现状

Core Job/Task lifecycle 已为全局异步产品状态。Gemini 与 OpenAI Images 的 `invoke()` 返回 Promise；GRSAI 通过 `ProviderAsyncLifecycle` 与 Application manager 执行 submit-once/poll。Provider Execution Adapter 负责两种模式的统一 dispatch。

本次不制造“fake polling”，也不删除 async manager。把 GRSAI polling 内联到 Provider `invoke()` 虽可减少类型数量，但会撤销已完成的 submit-once、poll budget、abort、reentry 与 lifecycle harness，且不是 UI 复杂度来源，因此拒绝。

### 8. 验证采用 harness-first 分层

- Provider tests：三个 builtin registry、固定模板 inventory、Gemini alias 删除、`chat-image` 不再注册，既有 GRSAI/Gemini/OpenAI request/parse contract 继续通过。
- Application tests：三个专用输入均可直接初始化为 ready；template 初始化失败不公开 Profile；删除 Profile 清理模型与 secrets；admission 仍要求显式 modelId。
- Shared UI tests：Picker 三入口、专用 create/edit、字段 allowlist、路由删除、默认模型 selection、多 Profile、Save/Delete 和错误反馈。
- Chrome harness/visual：Provider Settings 与三种页面的宽窄 viewport、空态、键盘导航、长 Profile 名称和 API Key visibility toggle。
- UXP：运行 fake adapter/shell suites 与 `build:uxp`；不主动打开 Photoshop 或 UXP Developer Tool。
- 最终运行 `pnpm validate`；Provider 实际凭据验证只属于显式 opt-in release gate。

## Risks / Trade-offs

- [三个页面可能再次产生重复] -> 只复用无业务判断的窄 UI primitive；不重建通用 protocol editor。
- [固定 endpoint 不能支持代理或地区节点] -> 当前产品明确只支持三个已知入口；未来中转作为新 Provider/页面加入，不通过高级配置泄漏 wire contract。
- [Gemini 模型 ID 变化] -> inventory 只由 Provider descriptor/catalog 维护；更新属于代码发布，不做远端 discovery 或用户编辑。
- [删除 UI 后遗留 commands/components] -> 先断开 route/port，再用 `rg`、TypeScript build 和 policy gate 确认 owner；仅删除无剩余消费者代码。
- [目录重组变成机械搬家但 ownership 仍重复] -> 先冻结 `models.ts` 与 `profile-template.ts` 的单一真相源，再移动 descriptor/provider/transport；以 import graph 与 duplicate constant 搜索作为 gate。
- [过早提取 shared 重新制造条件分支] -> shared 准入要求至少两个现有消费者和相同语义；Provider-specific codec、schema、错误映射留在 vertical slice。
- [OpenAI/GRSAI 没有 Test Connection] -> 不显示虚假测试；保存只证明本地 config 合法，首次生成错误由统一 Provider 错误路径呈现。
- [旧 OpenSpec change 定义模型可编辑路径] -> 本 change 是 current-state breaking 产品 reset；内部 ready/Profile 模型不变量保留，用户编辑 surface 被新 spec 明确取代。

## Migration Plan

1. 先用 contract tests 冻结三个 Provider 现有 implementation ID、wire 请求/解析、异步语义、固定 Profile config 和目标模型 inventory。
2. 建立 `providers/{grsai,gemini,openai-images}` vertical slice；逐个移动 models/profile-template/schema/descriptor/provider/transport，每完成一个 slice 即更新 barrel/registry/import 并运行对应 focused tests。
3. 将两个以上 Provider 真实复用的 HTTP/retry/failover primitive 移入 `shared/transport`，把 capability builder 留在 `provider catalog`；删除无消费者的 `chat-image` legacy codec。
4. 增加 Application sanitized Provider surface projection，建立 `features/provider-profiles` Picker 与三种专用页面，并用 deterministic UI harness 固定新路由。
5. 让专用页面通过 Application 使用 Provider-owned Profile template 创建现有 config，证明三个 Profile 均能直接 ready；收敛 Composer 默认 selection。
6. 删除旧通用页面、模型页面、AppShell route state 与 app-facing ports，再删除无剩余 owner 的组件/hooks/commands。
7. 移除 `chat-image` 与 `openai-chat-completions` 图片生成实现，更新 registry/catalog/contracts；用 CodeGraph、`rg`、TypeScript 与 policy gate 检查无深层 import、重复模型目录或无 owner 文件。
8. 清理本地 Profile/Model storage，从空状态运行 focused package gates、UI visual harness 与 `pnpm validate`。

回滚以代码回滚为单位；不迁移或恢复旧本地 Profile。实现过程中任何切片若需要修改 ComfyUI、Core Job contract 或 Provider wire protocol，应停止并重新划分范围。

## Open Questions

无。三个 Provider 本次同时进入产品入口；不使用 disabled/Coming Soon 卡片，也不拆成只实现 Gemini 的临时 surface。

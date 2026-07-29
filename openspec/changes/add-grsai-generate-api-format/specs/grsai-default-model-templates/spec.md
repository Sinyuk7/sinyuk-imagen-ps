## ADDED Requirements

### Requirement: GRSAI declares complete first-create model templates
`grsai-generate` SHALL 声明恰好以下 12 个完整默认模型模板，且每项 SHALL 使用同名 `wireModelId`、同名 `baseModelId`、`apiFormat: "grsai"`、GRSAI-owned request strategy 和可执行 capability。`baseModelId` 是同一 `grsai` catalog 的精确 canonical capability preset ID，不是上游品牌或名称相似模型的别名；每个 wire model SHALL 有独立 capability identity，即使其 matrix 可复用。

- `nano-banana-fast`，display name `Nano Banana 2 Lite`，`baseModelId: "nano-banana-fast"`
- `nano-banana-2`，display name `Nano Banana 2`，`baseModelId: "nano-banana-2"`
- `nano-banana-2-cl`，display name `Nano Banana 2 CL`，`baseModelId: "nano-banana-2-cl"`
- `nano-banana-2-2k-cl`，display name `Nano Banana 2 2K CL`，`baseModelId: "nano-banana-2-2k-cl"`
- `nano-banana-2-4k-cl`，display name `Nano Banana 2 4K CL`，`baseModelId: "nano-banana-2-4k-cl"`
- `nano-banana-pro`，display name `Nano Banana Pro`，`baseModelId: "nano-banana-pro"`
- `nano-banana-pro-vt`，display name `Nano Banana Pro VT`，`baseModelId: "nano-banana-pro-vt"`
- `nano-banana-pro-cl`，display name `Nano Banana Pro CL`，`baseModelId: "nano-banana-pro-cl"`
- `nano-banana-pro-vip`，display name `Nano Banana Pro VIP`，`baseModelId: "nano-banana-pro-vip"`
- `nano-banana-pro-4k-vip`，display name `Nano Banana Pro 4K VIP`，`baseModelId: "nano-banana-pro-4k-vip"`
- `gpt-image-2`，display name `GPT Image 2`，`baseModelId: "gpt-image-2"`
- `gpt-image-2-vip`，display name `GPT Image 2 VIP`，`baseModelId: "gpt-image-2-vip"`

模板 SHALL 只作为 `replace-remote-model-discovery-with-local-catalog` 定义的新 Profile 首次初始化数据。初始化完成后，系统 SHALL 只保留生成的 `UserModelConfig`，且 SHALL NOT 保存 template source、template version 或 catalog/user origin，或向既有 Profile 自动同步此 inventory。

#### Scenario: 创建 GRSAI Profile
- **WHEN** 用户首次创建有效的 `grsai` Profile
- **THEN** 系统 SHALL 原子初始化上述全部 12 个可执行 `UserModelConfig`，并在成功后将 Profile promotion 为 ready

#### Scenario: 既有 GRSAI Profile 遇到模板更新
- **WHEN** GRSAI template inventory 在一个 ready GRSAI Profile 创建后发生变化
- **THEN** 系统 SHALL NOT 自动增加、删除或覆盖该 Profile 的 `UserModelConfig`

#### Scenario: 首次模板初始化失败
- **WHEN** 任一 GRSAI template 不能解析到其精确 capability preset 或 request strategy
- **THEN** 系统 SHALL 拒绝整次初始化，SHALL NOT 写入部分 `UserModelConfig`，且 SHALL NOT 将 Profile promotion 为 ready

#### Scenario: 中转新增同名基础模型的自定义变体
- **WHEN** 未来 GRSAI 支持 `gpt-image-2-svip`，且其输出或输入约束与 `gpt-image-2` 或 `gpt-image-2-vip` 不同
- **THEN** 系统 SHALL 为 `gpt-image-2-svip` 声明独立 canonical capability preset；系统 SHALL NOT 仅因名称相似而复用另一模型的 capability identity

#### Scenario: 已废弃的 Nano Banana 不可执行
- **WHEN** Profile 或 catalog 请求 `nano-banana`
- **THEN** 系统 SHALL 不提供默认模板或 executable capability，且 SHALL 在发起 GRSAI request 前拒绝该模型

### Requirement: GRSAI request strategies enforce documented model geometry
GRSAI catalog SHALL 使用 `grsai-generate` 专属 request strategy，且 SHALL NOT 复用 Gemini 或 OpenAI adapter 的 strategy。每个 GRSAI wire model SHALL 有独立 capability identity；相同约束可复用 matrix/constants，但 SHALL NOT 共用 capability identity。Nano Banana 2 与 Nano Banana Pro models SHALL 支持 `auto`、`1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`5:4`、`4:5`、`21:9`，`1K`/`2K`/`4K` `imageSize` 与 URL/base64 reference images；Nano Banana 2 family 还 SHALL 支持 `1:4`、`4:1`、`1:8`、`8:1`。`gpt-image-2` SHALL 接受 documented ratio 或 preset pixel geometry。`gpt-image-2-vip` SHALL 只接受宽高均为 16 的倍数、单边不超过 3840、比例不超过 3:1、总像素在 655,360 至 8,294,400 范围内的 1K-4K custom pixel geometry，且 SHALL NOT 接受 ratio input。已废弃的 `nano-banana` SHALL NOT 有默认模板或可执行 capability。

#### Scenario: Nano Banana 2 接受 ultra-wide ratio
- **WHEN** 用户为 `nano-banana-2` 选择 `1:8` output
- **THEN** catalog SHALL 接受该 selection，并将其交给 GRSAI request strategy 编码

#### Scenario: Nano Banana Pro 拒绝 ultra-wide ratio
- **WHEN** 用户为 `nano-banana-pro` 选择 `1:8` output
- **THEN** catalog SHALL 拒绝该 selection，且 SHALL NOT 发起 GRSAI request

#### Scenario: GPT Image 2 VIP 拒绝普通 ratio
- **WHEN** 用户为 `gpt-image-2-vip` 选择 `16:9` ratio input
- **THEN** catalog SHALL 拒绝该 selection，且 SHALL NOT 发起 GRSAI request

#### Scenario: GPT Image 2 VIP 接受合法 custom geometry
- **WHEN** 用户为 `gpt-image-2-vip` 选择 `2048x1024`
- **THEN** catalog SHALL 接受该 selection，并将 `2048x1024` 作为 GRSAI pixel geometry 编码

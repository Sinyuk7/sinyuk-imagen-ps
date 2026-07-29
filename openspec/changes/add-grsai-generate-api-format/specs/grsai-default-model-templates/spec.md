## ADDED Requirements

### Requirement: GRSAI declares complete first-create model templates
`grsai-generate` SHALL 声明恰好以下 12 个完整默认模型模板，且每项 SHALL 使用同名 `wireModelId`、`apiFormat: "grsai"`、GRSAI-owned request strategy 和可执行 capability：

- `nano-banana-fast`，display name `Nano Banana 2 Lite`，`baseModelId: "gemini-3.1-flash-lite-image"`
- `nano-banana-2`，display name `Nano Banana 2`，`baseModelId: "gemini-3.1-flash-image"`
- `nano-banana-2-cl`，display name `Nano Banana 2 CL`，`baseModelId: "gemini-3.1-flash-image"`
- `nano-banana-2-2k-cl`，display name `Nano Banana 2 2K CL`，`baseModelId: "gemini-3.1-flash-image"`
- `nano-banana-2-4k-cl`，display name `Nano Banana 2 4K CL`，`baseModelId: "gemini-3.1-flash-image"`
- `nano-banana-pro`，display name `Nano Banana Pro`，`baseModelId: "gemini-3-pro-image"`
- `nano-banana-pro-vt`，display name `Nano Banana Pro VT`，`baseModelId: "gemini-3-pro-image"`
- `nano-banana-pro-cl`，display name `Nano Banana Pro CL`，`baseModelId: "gemini-3-pro-image"`
- `nano-banana-pro-vip`，display name `Nano Banana Pro VIP`，`baseModelId: "gemini-3-pro-image"`
- `nano-banana-pro-4k-vip`，display name `Nano Banana Pro 4K VIP`，`baseModelId: "gemini-3-pro-image"`
- `gpt-image-2`，display name `GPT Image 2`，`baseModelId: "gpt-image-2"`
- `gpt-image-2-vip`，display name `GPT Image 2 VIP`，`baseModelId: "gpt-image-2"`

模板 SHALL 只作为 `replace-remote-model-discovery-with-local-catalog` 定义的新 Profile 首次初始化数据。初始化完成后，系统 SHALL 只保留生成的 `UserModelConfig`，且 SHALL NOT 保存 template source、template version 或 catalog/user origin，或向既有 Profile 自动同步此 inventory。

#### Scenario: 创建 GRSAI Profile
- **WHEN** 用户首次创建有效的 `grsai` Profile
- **THEN** 系统 SHALL 原子初始化上述全部 12 个可执行 `UserModelConfig`，并在成功后将 Profile promotion 为 ready

#### Scenario: 既有 GRSAI Profile 遇到模板更新
- **WHEN** GRSAI template inventory 在一个 ready GRSAI Profile 创建后发生变化
- **THEN** 系统 SHALL NOT 自动增加、删除或覆盖该 Profile 的 `UserModelConfig`

### Requirement: GRSAI request strategies enforce documented model geometry
GRSAI catalog SHALL 使用 `grsai-generate` 专属 request strategy，且 SHALL NOT 复用 Gemini 或 OpenAI adapter 的 strategy。Nano Banana 2 与 Nano Banana Pro models SHALL 支持 documented `aspectRatio` values、`1K`/`2K`/`4K` `imageSize` 与 URL/base64 reference images；Nano Banana 2 family 还 SHALL 支持 `1:4`、`4:1`、`1:8`、`8:1`。`gpt-image-2` SHALL 接受 supported ratio 或 preset pixel geometry。`gpt-image-2-vip` SHALL 只接受宽高均为 16 的倍数、单边不超过 3840、比例不超过 3:1、总像素在 655,360 至 8,294,400 范围内的 1K-4K custom pixel geometry，且 SHALL NOT 接受 ratio input。

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

# @imagen-ps/cli

`@imagen-ps/cli` 是 `imagen-ps` 仓库内的 Node.js 自动化入口，用于：

- 管理 provider profile。
- 验证 provider contract。
- 运行 mock / live smoke。
- 提交生成或编辑 job，并把图片产物写入本地目录。

它不是通用图片 CLI，也不承担 Photoshop / UXP host 行为。Photoshop / UXP
能力由 `apps/app` 负责。

## 安装

从仓库根目录执行：

```bash
pnpm install
pnpm --filter @imagen-ps/cli build
cd apps/cli
pnpm link --global
```

如果 `pnpm link --global` 报 `ERR_PNPM_NO_GLOBAL_BIN_DIR`，先执行：

```bash
pnpm setup
```

打开新终端后再运行：

```bash
cd apps/cli
pnpm link --global
```

验证入口：

```bash
imagen --help
```

移除本地命令：

```bash
cd apps/cli
pnpm unlink
```

## Mock-First Quick Start

mock provider 不访问网络、不消耗真实 key，适合先验证 CLI contract 和 `--out`
产物形状。最快方式是创建内置 mock profile：

```bash
imagen init --mock
imagen profile test mock-dev
```

`init --mock` 只会在 CLI config dir 中创建或更新 `mock-dev` profile；它不是项目
初始化器，也不会配置真实 provider credentials。

也可以手写 mock profile JSON：

```bash
cat > profile.json <<'JSON'
{
  "profileId": "mock-dev",
  "providerId": "mock",
  "family": "image-endpoint",
  "displayName": "Mock Dev",
  "config": {
    "providerId": "mock",
    "family": "image-endpoint",
    "displayName": "Mock Dev",
    "baseURL": "https://mock.local"
  },
  "secretValues": {
    "apiKey": "sk-mock"
  }
}
JSON
```

保存并验证 profile：

```bash
imagen profile save @profile.json
imagen profile test mock-dev
```

创建 job input：

```bash
cat > input.json <<'JSON'
{
  "profileId": "mock-dev",
  "prompt": "simple blue square icon on a plain white background"
}
JSON
```

推荐的 task-first 入口：

```bash
imagen generate --profile mock-dev --prompt "simple blue square icon on a plain white background"
```

写出图片和 sidecar metadata：

```bash
imagen generate --profile mock-dev --prompt "simple blue square icon on a plain white background" --out ./imagen-output
```

等价的底层 job submit 入口：

```bash
imagen job submit provider-generate @input.json
```

底层 job submit 也支持同一个 `--out` 产物 contract：

```bash
imagen job submit provider-generate @input.json --out ./imagen-output
```

`--out` 会写入每个 job 独立目录：

```text
<out>/<jobId>/image.*
<out>/<jobId>/image.json
```

sidecar metadata 至少包含 `jobId`、`providerId`、`operation`、`prompt`、
`sha256`、`size`、`mimeType`、`savedAt`；如果 profile 或 provider 返回了
model / usage，也会一并写入。

## JSON 输入

接受结构化输入的命令支持两种形式：

- inline JSON：直接传入 JSON 字符串。
- `@file`：传入以 `@` 开头的 JSON 文件路径。

```bash
imagen profile save '{"profileId":"mock-dev","providerId":"mock","family":"image-endpoint","displayName":"Mock Dev","config":{"providerId":"mock","family":"image-endpoint","displayName":"Mock Dev","baseURL":"https://mock.local"},"secretValues":{"apiKey":"sk-mock"}}'
imagen profile save @profile.json
imagen job submit provider-generate '{"profileId":"mock-dev","prompt":"simple blue square icon"}'
imagen job submit provider-generate @input.json
```

`generate` / `edit` 是 CLI-only 的 task-first parser surface。它们只把 flags 转成
`job submit` 使用的同一个 `workflow + input`，再进入 application/session
`submitJob` 路径；公共层不包含 CLI flag、本地路径、`--out` 或 stdout/stderr 语义。

## Provider 与 Profile

Provider 查询：

```bash
imagen provider list
imagen provider describe <providerId>
```

当前内置 provider ID：

- `mock`
- `image-endpoint`
- `chat-image`

Profile 管理：

```bash
imagen init --mock
imagen profile list
imagen profile get <profileId>
imagen profile save @profile.json
imagen profile delete <profileId>
imagen profile delete <profileId> --retain-secrets
imagen profile test <profileId>
imagen profile test <profileId> --connect
imagen profile models <profileId>
imagen profile refresh-models <profileId>
```

`profile save` 是创建和更新 profile 的唯一写入口。需要修改 `enabled`、
`config.defaultModel` 或其他 profile 字段时，提交新的 profile JSON。

## Secret Storage

CLI 默认把 profile 和 secret 写到：

```text
~/.imagen-ps
```

也可以用 `IMAGEN_CONFIG_DIR` 指向隔离目录：

```bash
IMAGEN_CONFIG_DIR=./local-config imagen profile list
```

CLI 文件存储包含：

- `provider-profiles.json`
- `provider-secrets.json`

`provider-secrets.json` 是 CLI 的 file-backed secret storage。真实 key 建议使用
`env:` 引用，避免把明文 key 写入 profile JSON：

```json
{
  "secretValues": {
    "apiKey": "env:IMAGEN_API_KEY"
  }
}
```

UXP app 不复用 CLI 的 file storage。`apps/app` 通过注入的 secure storage /
host adapter 保存 secret 和 host 状态。

## Job 命令

Task-first aliases：

```bash
imagen generate --profile <profileId> --prompt <prompt>
imagen generate --profile <profileId> --prompt <prompt> --model <model> --out ./imagen-output
imagen edit --profile <profileId> --image ./input.png --prompt <prompt>
imagen edit --profile <profileId> --image ./input.png --prompt <prompt> --model <model> --out ./imagen-output
```

`generate` 等价于 `job submit provider-generate`，`edit` 等价于
`job submit provider-edit`。它们共享同一个 CLI-local executor，因此 stdout JSON、
stderr JSON、`--out` 目录和 sidecar metadata 与 `job submit` 保持一致。

底层 job 命令：

```bash
imagen job submit provider-generate @input.json
imagen job submit provider-edit @input.json
imagen job submit provider-generate @input.json --out ./imagen-output
imagen job list
imagen job list --status failed --limit 20
imagen job get <jobId>
imagen job retry <jobId>
```

terminal job 会写入 CLI durable history。`job get` 先查当前 process 的 active
session；未命中时读取 durable record，并返回 `source: "durable"`。durable record
只保存 metadata、sanitized input 和 `StoredAssetRef[]`，不保存图片 bytes 或 secret
values；图片 bytes 由 CLI `AssetStore` 管理，record 中的 `hostObject` ref 仍是
adapter-private opaque id，不是本机路径。

`job retry` 可重试 active session 或 durable history 中的 failed job。retry 会用
persisted sanitized input 重新提交，并在 dispatch 时通过现有 profile / secret
adapter 重新解析 secret ref；不会把 raw secret value 写入 job record。

## stdout / stderr

CLI 的自动化输出规则：

- 成功：JSON 写到 stdout，exit code 为 `0`。
- 失败：`{"error":"<message>"}` 写到 stderr，exit code 为 `1`。

`imagen --help` 和 `imagen <command> --help` 仍输出人类可读帮助文本。

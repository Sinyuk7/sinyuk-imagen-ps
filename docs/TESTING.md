# Testing

本文档是当前测试入口。历史设计稿和 handoff 文档不再作为权威状态来源。

## 首次初始化

新 checkout 或新 agent 接手仓库时，先执行：

```bash
pnpm bootstrap
```

`pnpm bootstrap` 使用 lockfile 安装依赖，然后执行 `pnpm validate`。这是默认测试环境的初始化入口，必须保证 mock-only、零费用、无真实 Photoshop / UXP 依赖。

## 常规验证

```bash
pnpm validate
pnpm build
pnpm test
pnpm check:boundaries
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test
pnpm --filter @imagen-ps/cli test
```

`pnpm test` 通过 Turbo pipeline 先构建需要的 workspace，再跑所有默认 CI 测试，包括：

- `apps/app/tests/*.test.tsx`
- `apps/cli/tests/contract/*.contract.test.ts`
- `apps/cli/tests/smoke/cli-e2e.test.ts`
- `packages/core-engine` / `packages/providers` / `packages/application`

`pnpm check:boundaries` 是最小架构边界 validator。它只做本地源码扫描，不访问网络、不读取 credentials、不产生费用。

`pnpm validate` 串行执行 `pnpm build`、`pnpm test`、`pnpm check:boundaries`，作为后续 Agent loop 的默认收口命令。

`pnpm --filter <pkg> test` 会绕过根级 Turbo pipeline，只适合在 `pnpm bootstrap`、`pnpm build` 或相关 package build 已完成后做局部复查。尤其是 CLI contract / smoke 测试会通过子进程运行 `apps/cli/dist/index.js`，不能把 filtered CLI test 当成干净 checkout 的初始化入口。

## CLI E2E Smoke

CLI smoke 测试位于 `apps/cli/tests/smoke/cli-e2e.test.ts`，通过子进程运行 `apps/cli/dist/index.js`，覆盖：

- `profile save`
- `profile refresh-models` 或 `profile models`
- `job submit --out`
- 图片落盘、sidecar、sha256、provider/model/operation/prompt 元数据

默认 `pnpm --filter @imagen-ps/cli test` 只跑 mock entry；live entry 会在未设置 `IMAGEN_RUN_SMOKE=1` 或缺少对应 key 时自动 skip。

## CLI Contract Tests

CLI contract 测试位于 `apps/cli/tests/contract/*.contract.test.ts`。
它们通过真实 `imagen` 子进程验证用户可观察 contract：

- `imagen --help`
- parser-level failures：unknown command / missing required arg / invalid input
- `provider list` / `provider describe`
- `IMAGEN_CONFIG_DIR`、HOME/XDG 隔离
- `profile save` 作为唯一 profile 写入口：
  - new：不存在时创建
  - update：同 `profileId` + 同 `providerId` 时更新
  - conflict：同 `profileId` 改 `providerId` 时失败且旧 profile 不变
  - alias：`displayName` 作为用户可见别名，保存时必须全局唯一；重复时失败，不自动改写为 `nameA(1)` 之类的值
- `profile get` / `list` / `delete`
- `profile test`
- `profile models`
- `profile refresh-models` 对不支持 discovery 的 provider
- `job submit provider-generate`
- `job submit provider-edit`
- `job submit --out`
- `job list` / `job get` 的 durable history 读取
- `job retry` 对 durable failed job 的跨进程重试
- durable job record 不持久化 secret value 或本机 native path

这些测试只使用 mock provider 和本地临时目录，不依赖网络、真实 key
或费用。它们是默认 CI 的一部分，不要放到 live smoke 里。

## App Tests

`apps/app` 测试使用 happy-dom 和 fake `AppServices`，验证 UI 到 application / host seam 的接线，不依赖真实 Photoshop 或 UXP runtime。

默认 app 测试必须保持 mock-only、零费用、可重复：

- 不访问真实 Photoshop / UXP runtime。
- 不访问真实 provider、真实 credentials、外网或产生费用的 API。
- 不要求 UXP Developer Tool、Photoshop 或本机用户环境。
- fake UXP module / host adapter tests 只验证 adapter 调用路径和数据映射，不能写成真实 host smoke 已通过。

当前覆盖：

- `app-shell.test.tsx`：mount `AppShell`，验证 service injection 后能渲染 profile/model
- `use-conversation.test.tsx`：验证生成 flow 通过 app-local session binding 调用 `CommandsPort.submitJob`
- `settings-add-page.test.tsx`：验证新增 provider profile 通过 `saveProviderProfile`，API key 只走 write-only `secretValues`

已补齐的 app contract 与 fake harness 覆盖：

- MainPage：无 attachment 走 `provider-generate`，有 attachment 走 `provider-edit`。
- MainPage：layer / file attachment 只通过 `HostBridge`，生成结果写回只通过 `placeAssetOnCanvas`。
- History：durable records 与当前 running rounds 的展示、过滤和 retry 入口。
- SettingsDetail：保存、删除、测试连接、刷新模型，以及 API key 留空不覆盖已保存 secret。
- Host adapters：fake UXP modules 覆盖 profile repository、secret storage、job history、asset store、Photoshop host bridge 的关键路径。

这些测试不能证明真实 Photoshop host IO 成功；UXP Developer Tool + Photoshop 验证仍是单独 gate。

## Live Provider Matrix

| name | providerId | family | base URL | tasks |
|---|---|---|---|---|
| mock | `mock` | `image-endpoint` | `https://mock.local` | text-to-image, edit-image, edit-image with mask |
| n1n | `image-endpoint` | `image-endpoint` | `https://llm-api.net` | text-to-image, edit-image, edit-image with mask |
| OpenRouter | `chat-image` | `chat-image` | `https://openrouter.ai/api/v1` | text-to-image, edit-image |

配置文件是 `apps/cli/tests/smoke/e2e.config.json`。prompt、source、mask、model、base URL、任务选择都应优先改这个配置文件，不要改测试 harness。

## Secrets

真实凭证只放在仓库根目录 `.test.env`，该文件已 gitignored。示例文件是 `.test.env.example`。

```bash
IMAGEN_SMOKE_N1N_API_KEY=
IMAGEN_SMOKE_N1N_BASE_URL=https://llm-api.net
IMAGEN_SMOKE_N1N_MODEL=gpt-image-1.5

IMAGEN_SMOKE_OPENROUTER_API_KEY=
IMAGEN_SMOKE_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
IMAGEN_SMOKE_OPENROUTER_MODEL=sourceful/riverflow-v2.5-fast
```

Profile secret 会写成 `env:<VAR>` 引用；测试运行时才从环境变量解析，真实 key 不落盘到 profile/secret storage。
`profile.displayName` 承担用户可见 alias 语义，`profileId` 只作为内部主键。创建页可建议唯一别名，但最终保存值由用户确认，不做静默自动去重。

## Run Live Smoke

```bash
pnpm build
IMAGEN_RUN_SMOKE=1 pnpm --filter @imagen-ps/cli test
```

如果本机直连 n1n 或 OpenRouter 不稳定，显式走本地代理：

```bash
HTTP_PROXY=http://127.0.0.1:7897 \
HTTPS_PROXY=http://127.0.0.1:7897 \
ALL_PROXY=http://127.0.0.1:7897 \
IMAGEN_RUN_SMOKE=1 \
pnpm --filter @imagen-ps/cli test
```

Clash Verge / Mihomo 当前需要确保这些域名走代理：

- `openrouter.ai`
- `clerk.openrouter.ai`
- `llm-api.net`
- `api.n1n.ai`

## Output Artifacts

每次 CLI smoke run 都会保留产物：

```text
.test-output/smoke/<run-id>/<entry>/
  *.png | *.jpg | *.webp
  *.json
```

`.test-output/` 已 gitignored。测试只清理临时 config 目录，不清理输出产物，方便复查真实图片和 sidecar。

Sidecar 至少包含：

- `providerId`
- `model`
- `operation`
- `prompt`
- `sha256`
- `size`
- `mimeType`
- `savedAt`

当前 `job submit --out` contract 还额外包含：

- `jobId`
- 每个 submit 独立的 `<out>/<jobId>/` 目录

## Default CI Boundary

默认 `pnpm test` 只包含稳定、无网络、可重复的 contract / unit / smoke
测试。

P2 / Nightly / Manual 独立清单，不进入默认 `pnpm test`：

- live provider smoke
- URL-only asset download branch
- 大输入 / ARG_MAX
- timeout / delay stress
- 重复或并发同一 `--out` 目录的压力测试
- 并发写同一 config dir
- 任何需要人工 key、代理或外网访问的场景

## Current Verified State

2026-06-17 初始化入口已验证：

- `pnpm validate` passed。
- 临时移走 `apps/*/dist` 与 `packages/*/dist` 后，`pnpm bootstrap` passed。
- `pnpm bootstrap` 会先执行 `pnpm install --frozen-lockfile`，再执行 `pnpm validate`。

2026-06-15 已验证：

- `pnpm build` passed。
- `pnpm --filter @imagen-ps/providers test` passed：3 files / 16 tests。
- `pnpm --filter @imagen-ps/application test` passed：1 file / 1 test。
- `pnpm --filter @imagen-ps/cli exec vitest run tests/contract` passed：3 files / 12 tests。
- `pnpm --filter @imagen-ps/cli test` passed：4 files / 17 passed / 9 skipped。
- 代理环境下 `IMAGEN_RUN_SMOKE=1 pnpm --filter @imagen-ps/cli test` passed：14/14，覆盖 mock、n1n、OpenRouter 的 text-to-image 和 edit-image 实际链路。
- `pnpm test` passed：12 turbo tasks successful。

2026-06-16 文档对齐时已确认：

- `pnpm --filter @imagen-ps/app build` passed。
- `pnpm --filter @imagen-ps/app test` passed。
- `pnpm validate` passed。

## Known Limits

- Live health check 目前只要求 `refresh-models` 成功并返回非空结果，暂不强制目标 image model 必须出现在 `/models` 列表；n1n 的 model discovery 不一定列出所有 image model。
- `file-storage-adapter` 支持 provider 返回 URL 时下载图片，但当前默认 contract / smoke 主要覆盖 inline/base64 或 provider 直接返回图像数据。
- Smoke fixture 必须保持中性几何图。角色、品牌或 IP-looking 图片可能把链路测试变成上游内容策略测试。

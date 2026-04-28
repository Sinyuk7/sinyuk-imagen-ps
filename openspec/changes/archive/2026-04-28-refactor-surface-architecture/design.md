## Context

当前项目将跨 surface 的 shared commands 放在 `app/src/shared/commands`，并由 `app/src/shared/runtime.ts` 组装 runtime、workflows、providers 与 config adapter。该结构在只有 Photoshop app 一个 surface 时可工作，但 CLI surface 引入后会形成 `apps/cli -> @imagen-ps/app -> packages/*` 的依赖方向，使 Node CLI 隐式依赖 Photoshop app 包边界。

现有代码中 shared commands 暂未直接依赖 Photoshop/UXP，但这只是实现上的暂时安全；物理归属仍然错误。新的架构需要把 Photoshop app 与 CLI 都定义为 surface app，把 shared commands 提升为公共 application/use-case package。

目标依赖图：

```text
apps/app ─────┐
              ├──▶ packages/shared-commands ───▶ packages/core-engine
apps/cli ─────┘                                  ├──▶ packages/providers
                                                 └──▶ packages/workflows
```

## Goals / Non-Goals

**Goals:**

- 建立标准 monorepo 目录：`apps/app`、`apps/cli`、`packages/shared-commands`、`packages/core-engine`、`packages/providers`、`packages/workflows`
- 将 shared commands 从 Photoshop app 内部模块迁移为公共 package
- 保持现有 command API 契约，避免重写业务语义
- 让 CLI 可以在纯 Node.js 环境依赖 `@imagen-ps/shared-commands` 执行
- 让 Photoshop app 只承担 surface 职责，不再拥有 runtime assembly 和 commands
- 更新 OpenSpec 与项目文档，避免旧的 `CLI -> app -> packages` 设计继续传播
- 增加架构守护验证，防止依赖方向回退

**Non-Goals:**

- 不新增 Web/server surface
- 不实现跨进程 job history store
- 不重构 core runtime、provider contract 或 workflow DSL
- 不改变 provider 配置验证业务规则
- 不引入发布到 npm 的流程

## Decisions

### D1: 使用 `apps/*` 承载所有 surface app

**决策**：将现有顶层 `app/` 迁移到 `apps/app/`，并在 `apps/cli/` 创建 CLI surface。`apps/` 与 `packages/` 平级。

**理由**：
- `app/` 与 `cli/` 都是用户入口 surface，不应一个依赖另一个
- `apps/*` 是 monorepo 中承载可执行应用的常见结构
- 未来构建、过滤、文档和模块注册可以统一描述 surface app

**替代方案**：
- 保留顶层 `app/`，只新增 `apps/cli/`：改动较小，但目录语义不一致，仍强化 `app` 的特殊地位
- 使用顶层 `cli/`：会继续让 surface 分散在根目录，后续扩展成本更高

### D2: 新增 `packages/shared-commands` 作为公共 application layer

**决策**：将 `app/src/shared/commands/**` 与 `app/src/shared/runtime.ts` 迁移到 `packages/shared-commands/src/**`，包名为 `@imagen-ps/shared-commands`。

**理由**：
- shared commands 是跨 surface 的 use-case facade，不属于 Photoshop app surface
- `apps/app` 与 `apps/cli` 需要复用相同 command 语义
- 独立 package 可以用 package dependency 明确禁止 React/UXP/Photoshop/DOM 依赖

**替代方案**：
- 通过 `@imagen-ps/app/shared/commands` 暴露 subpath：短期可行，但 CLI 仍依赖 Photoshop app 包，边界靠纪律维护
- CLI 直接依赖 `core-engine/providers/workflows`：避免 app 依赖，但会复制 runtime assembly 和 result mapping，surface 行为容易分叉

### D3: 依赖方向固定为 `surface -> shared-commands -> runtime packages`

**决策**：`apps/app` 与 `apps/cli` 只能通过 `@imagen-ps/shared-commands` 调用 commands；`packages/shared-commands` 依赖 `@imagen-ps/core-engine`、`@imagen-ps/providers`、`@imagen-ps/workflows`。

**理由**：
- surface 只负责输入、输出、adapter 注入和 host 生命周期
- shared commands 负责 runtime assembly、command facade、CommandResult 契约
- runtime/domain packages 保持 host-agnostic，不知道 surface 存在

**替代方案**：
- surface 直接访问 runtime：会泄漏 runtime lifecycle 与 provider registry 细节
- app 作为中间层：会让 CLI 依赖 Photoshop app 边界

### D4: `@imagen-ps/app` 保留包名但移动物理路径

**决策**：顶层 `app/` 移动到 `apps/app/` 后，package name 仍保留 `@imagen-ps/app`。

**理由**：
- 外部 filter 和包语义可保持稳定
- 迁移重点是物理目录与依赖边界，不必引入包名破坏

**替代方案**：
- 改名为 `@imagen-ps/photoshop-app`：语义更准确，但会扩大 import 与文档迁移面

### D5: Adapter injection 保持在 shared commands 边界

**决策**：`setConfigAdapter(adapter)`、`getConfigAdapter()` 与默认 in-memory adapter 迁移到 `@imagen-ps/shared-commands`。不同 surface 在启动时注入自己的 adapter。

**理由**：
- CLI 可以注入 Node 文件系统 adapter
- Photoshop app 未来可以注入 UXP storage adapter
- shared commands 不直接依赖 Node fs 或 UXP API

**替代方案**：
- 在 providers 层处理配置持久化：会把 host storage 逻辑推入 provider 语义层
- 在 core-engine 层处理配置持久化：会污染 host-agnostic runtime

### D6: CLI 不承诺跨进程 job history

**决策**：本架构变更不引入持久化 job store；CLI 的 `job get` / `job retry` 只对当前 shared commands runtime store 中可见的 job 生效。跨进程 job history 作为后续独立能力设计。

**理由**：
- 当前 runtime store 是内存状态
- 引入持久化 job store 会扩大数据模型和迁移复杂度
- 本变更重点是架构边界，而非 job persistence

**替代方案**：
- 本次同时引入 job history store：会显著扩大范围，增加失败恢复、schema migration、并发写入等问题

### D7: 文档与 OpenSpec 必须同步迁移

**决策**：本变更必须更新 `AGENTS.md`、`ARCHITECTURE.md`、`docs/COMPONENT_REGISTRY.md`、`docs/CROSS_MODULE.md`、`docs/BUILD_SYSTEM.md`、`docs/SETUP.md`、`docs/USAGE.md`，并修正 `openspec/changes/cli-surface` 的旧架构假设。

**理由**：
- 本项目已有文档驱动规则，架构重构若只改代码会造成后续误用
- `cli-surface` 已包含 `CLI -> app -> packages` 的错误设计，需要同步更正

**替代方案**：
- 只改代码：短期可 build，但架构知识会继续分裂

## Risks / Trade-offs

- **路径迁移导致 import 断裂** → 分两步迁移：先抽出 `packages/shared-commands`，再移动 `app/` 到 `apps/app/`；每步执行 build/test
- **shared commands 意外引入 host 依赖** → 增加架构守护检查，禁止 `react`、`react-dom`、`photoshop`、`uxp`、DOM、Node fs/path/os 出现在 shared commands 中
- **OpenSpec active changes 冲突** → 将 `refactor-surface-architecture` 作为 `cli-surface` 的前置变更，先修正 CLI 依赖决策
- **包路径迁移影响文档和命令** → 更新 setup/build/usage 文档，并保留 package name `@imagen-ps/app` 降低 filter 迁移成本
- **CLI job get/retry 期望误解** → 在 CLI spec 中明确不支持跨进程 history，后续需要时单独设计持久化 job store

## Migration Plan

1. 创建 `packages/shared-commands` package，并迁移 commands 与 runtime assembly
2. 更新 `app` 代码，使其从 `@imagen-ps/shared-commands` 导入 commands，确认旧顶层 `app/` 仍可 build/test
3. 将顶层 `app/` 移动到 `apps/app/`，更新 workspace、tsconfig、turbo 与文档路径
4. 创建/调整 `apps/cli`，依赖 `@imagen-ps/shared-commands` 而非 `@imagen-ps/app`
5. 删除旧 `app/src/shared/commands/**` 与 `app/src/shared/runtime.ts` 路径
6. 更新 OpenSpec active changes 与项目文档
7. 增加架构守护验证并执行完整 build/test/OpenSpec validate

## Open Questions

- `@imagen-ps/shared-commands` 是否只暴露根入口 `.`，还是同时暴露 `./commands` 子路径？默认建议同时暴露两者以兼容清晰导入。
- `plugin-app-model.ts` 是否应继续留在 `apps/app/src/shared`？本次默认保留，因为它当前属于 Photoshop app 本地 model，不纳入跨 surface 公共层。

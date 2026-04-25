# Architecture — @imagen-ps/workflows

## 架构概述

`@imagen-ps/workflows` 是 `sinyuk-imagen-ps` monorepo 中的 declarative workflow specs 层。它在分层架构中位于 `app` 与 `providers` 之间：

```
┌─────────────────────────────────────────────────────────┐
│                        app                               │
│           (UI / Host / 应用侧薄桥接)                      │
└─────────────────────────┬───────────────────────────────┘
                          │ depends on
┌─────────────────────────▼───────────────────────────────┐
│                   packages/workflows                     │  ← 本模块
│              (declarative workflow specs)                │
└─────────────────────────┬───────────────────────────────┘
                          │ depends on
┌─────────────────────────▼───────────────────────────────┐
│                   packages/providers                     │
│         (provider 语义、校验、映射、registry)             │
└─────────────────────────┬───────────────────────────────┘
                          │ depends on
┌─────────────────────────▼───────────────────────────────┐
│                  packages/core-engine                    │
│              (共享 runtime、无外部依赖)                   │
└─────────────────────────────────────────────────────────┘
```

**依赖方向**：workflows 可依赖 `core-engine` 的共享类型，禁止依赖 `app`、`providers`。

## 模块结构

```
packages/workflows/
├── src/
│   ├── builtins/
│   │   ├── index.ts              # builtin workflows 导出聚合
│   │   ├── provider-generate.ts  # image generation workflow spec
│   │   └── provider-edit.ts      # image edit workflow spec
│   └── index.ts                  # 包主入口
├── tests/
│   └── builtins.test.ts          # builtin workflows 测试
├── docs/                         # 知识库文档
├── AGENTS.md                     # 导航地图
├── ARCHITECTURE.md               # 本文件
├── SPEC.md                       # 模块规范
├── STATUS.md                     # 模块状态
├── README.md                     # 模块摘要
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

### 目录职责说明

| 目录/文件 | 职责 |
|----------|------|
| `src/builtins/` | 存放所有 builtin workflow spec 定义 |
| `src/index.ts` | 包主入口，统一导出 |
| `tests/` | builtin workflow 导出正确性、immutability、registry 注册、runtime 兼容性测试 |
| `docs/` | 模块知识库文档（SETUP、USAGE、CODE_CONVENTIONS、STABILITY） |

## 核心流程

### Workflow Spec 消费流程

```
┌─────────────────┐
│ builtinWorkflows│  ← workflows 模块导出
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ createWorkflowRegistry()│  ← core-engine 注册
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ createRuntime({         │
│   initialWorkflows,     │  ← runtime 初始化时注入
│   adapters              │
│ })                      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ runtime.runWorkflow(    │
│   'provider-generate',  │  ← 按 workflow name 执行
│   { provider, prompt }  │
│ )                       │
└─────────────────────────┘
```

### Workflow Spec 结构

```typescript
// Workflow 接口（来自 core-engine）
interface Workflow {
  readonly name: string;           // workflow 唯一标识
  readonly steps: readonly Step[]; // 按顺序执行的 step 列表
  readonly version?: string;       // 可选版本标记
}

interface Step {
  readonly name: string;                   // step 可读名称
  readonly kind: 'provider' | 'transform' | 'io'; // 执行类型
  readonly input?: Record<string, unknown>; // 模板化的运行时 input
  readonly outputKey?: string;             // output key（省略时取 name）
}
```

### Input Binding 语法

Workflow step 的 `input` 字段支持 `${varName}` 模板语法，由 runner 在执行阶段解析：

```typescript
// provider-generate.ts
input: {
  provider: '${provider}',    // 绑定到 job input 的 provider
  request: {
    operation: 'generate',
    prompt: '${prompt}',      // 绑定到 job input 的 prompt
  },
}
```

## 关键依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@imagen-ps/core-engine` | `workspace:*` | 提供 `Workflow`、`Step` 类型定义 |
| `typescript` | `^5.7.0` | 开发依赖，类型检查 |
| `vitest` | `^3.0.0` | 开发依赖，单元测试 |

## 设计约束

### 不可变设计

- 所有导出的 workflow spec 必须通过 `Object.freeze()` 深度冻结
- 禁止在运行时修改 workflow shape
- 测试必须验证 immutability

### 禁止内容

| 禁止项 | 原因 |
|--------|------|
| 可执行逻辑 | workflow 是 pure data，执行由 runtime 负责 |
| Provider transport | 属于 `providers` 层职责 |
| Host IO / 网络 / 文件系统 | 属于 `app` 或 adapter 层职责 |
| Runtime state mutation | 属于 `core-engine` 层职责 |
| UI-facing shape | 属于 `app` 层职责 |
| DAG / visual editor / branch / loop | 超出当前阶段范围 |

### 当前阶段限制

- 只维护最小 builtin workflow 集合（`provider-generate`、`provider-edit`）
- `maskAsset`、`output`、`providerOptions` 等字段为 tentative，不承诺 binding 语义
- 不扩展 step 类型（`transform`、`io` 仅为保留值）

# 构建系统

## 依赖管理机制

### 包管理器

- **工具**：pnpm 9.15.4（项目锁定版本）
- **配置**：`package.json` 中 `"packageManager": "pnpm@9.15.4"`

### Workspace 配置

`pnpm-workspace.yaml` 定义 workspace 范围：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 包间依赖声明

包间依赖使用 `workspace:*` 协议：

```json
{
  "dependencies": {
    "@imagen-ps/shared-commands": "workspace:*"
  }
}
```

这确保：
- 开发时直接链接本地包
- 发布时（如需要）自动替换为实际版本号

## 版本策略

- 所有包版本统一为 `0.0.0`
- 所有包标记为 `"private": true`，不发布到 npm

## 构建配置

### Turborepo

`turbo.json` 配置任务编排：

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

**关键配置说明**：

| 配置 | 说明 |
|------|------|
| `dependsOn: ["^build"]` | 先构建上游依赖包 |
| `outputs: ["dist/**"]` | 缓存 dist 目录 |
| `cache: false` | 禁用缓存（用于 dev、clean） |
| `persistent: true` | 长运行任务（用于 dev） |

### TypeScript 配置

#### 根级配置

`tsconfig.base.json` 定义共享配置：

- 编译目标
- 模块系统
- 严格模式设置
- skipLibCheck / esModuleInterop 等通用选项

根 `tsconfig.json` 仅用于 IDE/tsserver 跨包解析，包含 `apps/*` 与 `packages/*` 的源码和测试路径。

#### 包级配置

每个包有两个 tsconfig：

| 文件 | 用途 |
|------|------|
| `tsconfig.json` | IDE 和类型检查 |
| `tsconfig.build.json` | 实际构建产物 |

### 构建产物

| 包 | 产物位置 | 格式 |
|---|---|---|
| app | `apps/app/dist/` | ESM |
| cli | `apps/cli/dist/` | ESM |
| shared-commands | `packages/shared-commands/dist/` | ESM |
| core-engine | `packages/core-engine/dist/` | ESM |
| providers | `packages/providers/dist/` | ESM |
| workflows | `packages/workflows/dist/` | ESM |

所有包使用 `"type": "module"` 声明 ESM 格式。

## Build Graph

```text
@imagen-ps/core-engine
├── @imagen-ps/providers
├── @imagen-ps/workflows
└── @imagen-ps/shared-commands
    ├── @imagen-ps/app
    └── @imagen-ps/cli
```

实际依赖：

- `@imagen-ps/shared-commands` depends on `core-engine`、`providers`、`workflows`
- `@imagen-ps/app` depends on `@imagen-ps/shared-commands`
- `@imagen-ps/cli` depends on `@imagen-ps/shared-commands`

## 外部依赖

### 生产依赖

| 包 | 依赖 | 用途 |
|---|---|---|
| core-engine | `mitt` | 事件总线 |
| core-engine | `zod` | Schema 校验 |
| providers | `zod` | Schema 校验 |
| app | `react`, `react-dom` | UI 框架 |
| cli | `commander` | CLI 命令解析 |

### 开发依赖

| 依赖 | 用途 |
|------|------|
| `typescript` | 类型检查与编译 |
| `vitest` | 测试框架 |
| `turbo` | 任务编排 |
| `rimraf` | 跨平台删除 |

## 本地验证命令

```bash
# 完整构建
pnpm build

# 构建单包
pnpm --filter @imagen-ps/shared-commands build
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/cli build

# 运行测试
pnpm test
pnpm --filter @imagen-ps/shared-commands test

# 清理产物
pnpm clean
```

## CI/CD

TODO: CI 基线待后续补充。

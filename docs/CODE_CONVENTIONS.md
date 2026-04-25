# 代码规范

## 模块命名规范

### 包命名

| 包 | npm 名称 |
|---|---|
| app | `@imagen-ps/app` |
| core-engine | `@imagen-ps/core-engine` |
| providers | `@imagen-ps/providers` |
| workflows | `@imagen-ps/workflows` |

### 文件命名

- 使用 kebab-case：`create-runtime.ts`、`provider-registry.ts`
- 类型定义文件放在 `types/` 子目录或与实现文件同级
- 测试文件使用 `.test.ts` 后缀：`runtime.test.ts`

## 目录结构约定

### app

```
app/src/
├── ui/           # React UI 组件
├── host/         # Photoshop / UXP 相关代码
└── shared/       # 对共享模块的薄桥接
```

### packages

```
packages/{package-name}/
├── src/          # 源码
│   ├── index.ts  # 公开导出入口
│   └── types/    # 类型定义（可选）
├── tests/        # 测试文件（可选，也可放在 src 同级）
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── README.md
├── SPEC.md       # 本地规范
├── AGENTS.md     # 模块级规则
└── STATUS.md     # 模块状态（可选）
```

## 架构约束

### 禁止事项

| 禁止行为 | 原因 |
|----------|------|
| `core-engine` 依赖 `providers` 或 `workflows` | 违反分层依赖方向 |
| `providers` 依赖 `workflows` | 违反分层依赖方向 |
| `core-engine` 包含 IO 操作 | IO 只能存在于 `app/host` 或 adapter 边界 |
| UI 直接调用 provider 内部逻辑 | UI 应通过 `shared/` 收口 |
| 在 `app` 中实现 runtime lifecycle | runtime 由 `core-engine` 负责 |
| 在 `app` 中定义 provider 参数语义 | provider 语义由 `providers` 负责 |

### 依赖方向

```
app → workflows → providers → core-engine
```

上层可以依赖下层，**禁止反向依赖**。

## TypeScript 规范

### 类型导出

- type / interface / schema 必须使用 JSDoc
- 描述使用中文，术语保持 English

```typescript
/**
 * 任务状态
 */
export type JobStatus = 'created' | 'running' | 'completed' | 'failed';

/**
 * 任务定义
 */
export interface Job {
  /** 任务唯一标识 */
  id: string;
  /** 当前状态 */
  status: JobStatus;
  // ...
}
```

### 函数注释

- 仅函数使用结构化 docstring（见 `archive/DOCUMENTATION.md`）
- 不要求所有函数都写

```typescript
/**
 * 创建 runtime 实例
 *
 * @param options - runtime 配置
 * @returns runtime 实例
 */
export function createRuntime(options: RuntimeOptions): Runtime {
  // ...
}
```

## 文档语言规范

- 文档使用中文
- 代码符号 / 类型 / 接口 / API / 配置键 使用 English
- 引用代码时必须使用真实路径或函数名

## 格式化

- 使用 Prettier 格式化
- 配置见 `.prettierrc`
- 忽略规则见 `.prettierignore`

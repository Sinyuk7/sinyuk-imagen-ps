# workflows — 产品需求文档（PRD）

- 状态：当前权威基线
- 版本锚点：`2026-04-27`（以本次 change 完成时的 `src/` 与 `tests/` 现实为准）
- 依据：`src/builtins/`、`tests/`、`SPEC.md`、`STATUS.md`

---

## 1. 模块定位

`@imagen-ps/workflows` 是 monorepo 中负责 **declarative workflow spec** 的包。它描述步骤顺序、输入绑定和输出交接，但本身不包含可执行逻辑。

**目标用户**：
- `@imagen-ps/core-engine` 的 runtime（`createRuntime`、`createWorkflowRegistry`）
- 任何需要以 workflow name 寻址内置执行链路的上层调用方（如 `app/`）

---

## 2. 职责边界

### 本模块负责

- builtin workflow specs（纯数据，pure data）
- step id、step kind、input binding、output key 的声明
- 向 `core-engine` 提供可直接消费的稳定 `Workflow` shape

### 本模块不负责

- provider transport、provider 参数校验、provider 配置 schema
- host IO、network、文件系统读写
- UI-facing 数据结构或 surface 编排
- runtime state mutation、queue 语义、inline transform logic
- DAG、branch、loop、visual editor 等非最小编排系统
- host writeback workflow 或 runtime persistence

### 依赖方向

```
workflows
  └─ depends on: @imagen-ps/core-engine (共享类型)
  └─ NOT depends on: @imagen-ps/providers (不混入 provider 语义)
  └─ NOT depends on: app/ host 层
```

---

## 3. Builtin Workflow 命名约定

- 命名格式：`<layer>-<operation>`，全小写，连字符分隔
- 当前清单：

| workflow name       | 源文件                            | 导出名称                   | operation  |
|---------------------|-----------------------------------|----------------------------|------------|
| `provider-generate` | `src/builtins/provider-generate.ts` | `providerGenerateWorkflow` | `generate` |
| `provider-edit`     | `src/builtins/provider-edit.ts`     | `providerEditWorkflow`     | `edit`     |

- 统一集合：`builtinWorkflows`（只读，由 `src/builtins/index.ts` 导出）

---

## 4. 稳定 Contract 定义

### 4.1 `provider-generate`

**必需输入（job input 字段）**：

| 字段       | 类型     | 说明                          |
|------------|----------|-------------------------------|
| `provider` | `string` | 目标 provider 的注册名称      |
| `prompt`   | `string` | 生成图像的文本描述            |

**固定语义**：
- `request.operation` 固定为 `'generate'`
- `outputKey` 固定为 `'image'`

### 4.2 `provider-edit`

**必需输入（job input 字段）**：

| 字段          | 类型     | 说明                          |
|---------------|----------|-------------------------------|
| `provider`    | `string` | 目标 provider 的注册名称      |
| `prompt`      | `string` | 编辑指令的文本描述            |
| `inputAssets` | `Asset[]`| 待编辑的输入图像资源          |

**固定语义**：
- `request.operation` 固定为 `'edit'`
- `outputKey` 固定为 `'image'`

---

## 5. Tentative 字段（未纳入当前稳定范围）

以下字段在代码注释中出现，但当前**不作稳定承诺**：

| 字段              | 所在 workflow | 原因                                              |
|-------------------|---------------|---------------------------------------------------|
| `maskAsset`       | provider-edit | 编辑场景局部遮罩；binding 语义与 provider 兼容性未收敛 |
| `output`          | 两者          | 输出控制参数；与 provider 的 output 形式未统一    |
| `providerOptions` | 两者          | provider 特定选项；不同 provider 的 schema 各异   |

这些字段的状态记录在 `STATUS.md §2 Open Questions`。在明确提升为稳定 contract 之前，不应在 `core-engine` 或 `app/` 中依赖它们。

---

## 6. 与相邻模块的交互边界

### 与 `core-engine`

- `workflows` 依赖 `core-engine` 的 `Workflow` 类型（via `@imagen-ps/core-engine`）
- builtin workflows 通过 `satisfies Workflow` 在编译期验证 shape 合规性
- `createRuntime()` 与 `createWorkflowRegistry()` 直接消费 `builtinWorkflows`
- `workflows` **不**反向调用 `core-engine` 的任何运行时 API

### 与 `providers`

- `workflows` **不**直接依赖 `@imagen-ps/providers`
- `provider` 字段值（如 `'mock'`、`'openai-compatible'`）在 workflow 中作为纯字符串绑定，实际解析由 `core-engine` registry 完成
- provider transport、config schema、bridge adapter 均不属于 `workflows` 职责范围

### 与 `app/`

- `app/` 可以通过 workflow name（如 `'provider-generate'`）在 runtime 中寻址内置链路
- `workflows` 不持有任何 host-facing 或 UI-facing 结构

---

## 7. 禁止事项（Non-goals）

- 不扩写 DAG、visual editor、branch / loop / condition
- 不实现 host writeback、inline transform logic、runtime persistence 或 queue 语义
- 不把 surface 编排、CLI 参数格式或 runtime state mutation 放进本包
- 不把 `maskAsset`、`output`、`providerOptions` 提升为稳定 contract（保持 tentative）
- 不在 `src/` 内放置任何可执行逻辑（函数调用、网络、IO）

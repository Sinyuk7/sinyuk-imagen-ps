# PRD.md — Workflows 模块设计

## 文档状态

* **Status:** Proposed
* **Last Updated:** 2026-04-23
* **Scope:** `packages/workflows`
* **Related Docs:** `docs/IMPLEMENTATION_PLAN.md`, `packages/core-engine/PRD.md`

---

## 1. 背景

当前 change 的核心目标不是做复杂 workflow 系统，而是先证明共享执行链路成立。

因此，`packages/workflows` 当前的职责不是提供“强大编排能力”，而是提供：

* 稳定的 declarative workflow shape
* 可被 runtime 执行的最小 builtin workflow
* 明确的 step binding 与 output handoff

---

## 2. 模块目标

`packages/workflows` 当前阶段必须完成：

1. 定义和导出最小 builtin workflow specs
2. 保持 workflow 为 pure data
3. 给 runtime 提供稳定的 step ordering 与 binding shape
4. 让 provider-based happy path 可以直接复用 workflow

---

## 3. 非目标

当前阶段不做：

* DAG
* branch / loop / condition
* visual workflow editor
* callback / polling workflow
* host writeback steps
* inline transform logic
* runtime state persistence

---

## 4. 设计原则

### 4.1 Workflow 只是声明，不是执行器

Workflow 只描述：

* step 顺序
* 绑定关系
* 输出键
* 元数据

Workflow 不描述：

* HTTP 怎么发
* provider 怎么处理参数
* host 怎么读写资产

### 4.2 Workflow 不承担业务逻辑

复杂逻辑不允许塞进 workflow spec。
如果一个决策需要执行代码，它应属于：

* `core-engine`
* `providers`
* `adapters`

而不是 `workflows`。

### 4.3 Workflow 必须稳定、可审查

一个 workflow 文件应该让人直接看出：

* 会执行哪些 step
* 每步依赖什么输入
* 最终输出来自哪里

---

## 5. 当前范围

### 5.1 Builtin Workflow

当前只要求一个最小内置工作流族：

* 单 provider 调用
* 顺序执行
* 输入来自 job input
* 输出来自最后一个 provider step

### 5.2 Step Shape

当前沿用共享 step shape：

* `id`
* `kind`
* `inputBinding`
* `outputKey`
* `cleanupPolicy`
* `config`

当前允许保留 `transform` / `io` 作为类型空间，但不要求在本阶段落地复杂内置逻辑。

---

## 6. 与其他模块的边界

### 对 `core-engine`

* 输出 declarative specs
* 由 engine 负责执行、校验、状态流转

### 对 `providers`

* 不理解 provider transport
* 不定义 provider config schema
* 只在 step config 中持有最小引用信息

### 对 surface

* 不暴露 UI-facing shape
* 不响应 CLI 参数格式

---

## 7. 目录目标

建议目录：

```txt
src/
├── builtins/
│   ├── provider-generate.ts
│   ├── provider-edit.ts
│   └── minimal-image-job.ts
└── index.ts
```

说明：

* 文件名按场景命名，不按技术噪音命名
* 每个 spec 文件尽量小而清晰

---

## 8. 测试重点

必须覆盖：

* builtin workflow export correctness
* duplicate step id guard
* duplicate output key guard
* binding reference validity
* minimal happy path compatibility with runtime

---

## 9. 验收标准

以下全部满足才算当前阶段完成：

1. `packages/workflows` 能导出最小 builtin workflow
2. workflow 保持 pure data，无可执行逻辑
3. workflow shape 可被 `core-engine` 直接消费
4. 未将 provider 语义、host 语义、surface 语义混入 workflow
5. workflow 文档与 `IMPLEMENTATION_PLAN.md` 保持一致

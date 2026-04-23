# AGENTS.md — workflows

## Scope

`packages/workflows` 只放 declarative workflow specs。
这里描述“执行顺序与绑定关系”，不写“可执行逻辑”。

---

## What A Workflow Can Express

可以表达：

* step ordering
* input binding
* output key
* step metadata
* cleanup policy

不可以表达：

* network calls
* host IO
* inline business logic
* mutable runtime state
* provider transport details

---

## Relationship

* `workflows` 依赖 `core-engine` 的共享类型
* `core-engine` 执行 workflow
* `providers` 负责 provider invocation

workflow 本身不是 executor。

---

## Current Phase

当前先做最小 builtin workflow：

* provider invoke happy path
* generate / edit 共享最小步骤模型

当前不做：

* DAG
* visual editor
* branch / loop
* embedded transform logic
* host writeback workflow

---

## File Rules

建议拆分：

* `builtins/`：内置 workflow spec
* `index.ts`：barrel export

每个 workflow 文件只定义一组明确场景的 spec。

---

## Key Rules

* workflow 必须是 pure data
* step id / output key 必须稳定
* binding 必须清晰、可追踪
* 不把 provider 参数细节塞进 workflow 结构
* 不把 runtime state 回写到 workflow

---

## Testing Focus

* workflow shape validity
* duplicate step / output guard
* binding reference correctness
* builtin workflow export stability

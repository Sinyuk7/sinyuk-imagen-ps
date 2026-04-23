# AGENTS.md — packages

## Purpose

`packages/` 放共享核心模块，不放 surface 细节。
这里的设计目标只有一个：把 `runtime / provider / workflow` 的边界钉死。

---

## Modules

| Module | Role | Owns | Must NOT own |
|---|---|---|---|
| `core-engine` | runtime 核心 | job lifecycle、workflow orchestration、event emission、runtime-facing contracts | UI、host API、network、FS、provider 参数语义 |
| `providers` | provider 层 | provider contract、config schema、transport、result normalization、error mapping | runtime state、surface 格式、settings persistence、host IO |
| `workflows` | workflow 层 | declarative workflow specs、step ordering、binding shape | executable business logic、network、FS、state mutation |

---

## Dependency Direction

允许：

* `providers -> core-engine`
* `workflows -> core-engine`
* `apps/* -> core-engine + providers + workflows`

禁止：

* `core-engine -> providers`
* `core-engine -> apps/*`
* `workflows -> providers`
* 任意模块跨层拿 UI / Host API

---

## Relationship

运行链路是：

`surface -> thin facade -> core-engine -> providers -> adapters`

其中：

* `core-engine` 只依赖抽象契约，不理解 provider 细节
* `providers` 吃掉外部 API 差异，不拥有 job 状态机
* `workflows` 只描述“做什么顺序执行”，不描述“怎么执行”

---

## Change Rules

改动前先判断落点：

* lifecycle / event / state / dispatch → `core-engine`
* config / schema / HTTP / normalize / error map → `providers`
* step shape / bindings / builtin specs → `workflows`

如果一个改动同时影响多个模块：

* 先改对应模块 PRD
* 再改实现
* 保持 dependency direction 不反转

---

## Document Map

* `packages/core-engine/PRD.md`：runtime 目标、状态机、执行边界
* `packages/providers/PRD.md`：provider profile、transport、config、错误映射
* `packages/workflows/PRD.md`：workflow shape、binding、builtin scope
* 各模块 `AGENTS.md`：该模块内部结构、硬约束、常见落点

---

## Default Rule

* Clarity > cleverness
* Keep changes minimal
* 先收敛边界，再写代码
* 不把一个模块的问题“方便地”塞给另一个模块

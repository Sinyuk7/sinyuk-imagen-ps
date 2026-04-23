# AGENTS.md

## Purpose

`packages/` 只放共享核心模块，不放应用层细节。

## Modules

| Module | Role | Owns | Must NOT own |
|---|---|---|---|
| `core-engine` | runtime 核心 | lifecycle、workflow orchestration、event、runtime-facing contracts | UI、host API、network、FS、provider 参数语义 |
| `providers` | provider 层 | provider contract、config schema、transport、result normalization、error mapping | runtime state、应用格式、settings persistence、host IO |
| `workflows` | workflow 层 | declarative workflow specs、step ordering、binding shape | executable logic、network、FS、state mutation |

## Dependency Direction

允许：

- `providers -> core-engine`
- `workflows -> core-engine`
- `app -> core-engine + providers + workflows`

禁止：

- `core-engine -> providers`
- `core-engine -> app`
- `workflows -> providers`
- 任意模块跨层接触 UI / Host API

## Relationship

当前共享执行链路是：

`surface -> shared commands -> core-engine -> providers -> adapters`

其中：

- `core-engine` 只依赖抽象契约，不理解 provider 细节
- `providers` 吃掉外部 API 差异，不拥有 lifecycle
- `workflows` 只描述执行顺序与绑定，不描述执行逻辑

## Change Rules

- lifecycle / event / state / dispatch -> `core-engine`
- config / schema / HTTP / normalize / error map -> `providers`
- step shape / bindings / builtin specs -> `workflows`

如同时影响多个模块：

- 先改对应模块文档
- 再改实现
- 保持 dependency direction 不反转


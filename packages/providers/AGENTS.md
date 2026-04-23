# AGENTS.md — providers

## Scope

`packages/providers` 负责 provider 语义封装。
它是外部 API 与内部 runtime contract 之间的防腐层。

---

## Current Phase

当前只做：

* `openai-compatible` baseline
* built-in `mock provider`
* config schema / request schema / response normalization
* transport retry / error mapping

当前不做：

* Gemini native
* xAI native
* ComfyUI
* async polling family
* provider auto-discovery

---

## What Lives Here

建议按职责拆分：

* `contract/`：provider contract、capability、config、request、result
* `registry/`：provider registry、builtins
* `providers/mock/`：mock provider
* `providers/openai-compatible/`：真实 provider baseline
* `transport/openai-compatible/`：HTTP、retry、response parse、error map

---

## Hard Boundaries

必须做：

* 校验 config
* 校验 canonical request
* 构造请求
* 发起 HTTP
* 解析响应
* 归一化为共享结果
* 将外部错误映射为标准错误

禁止做：

* runtime lifecycle
* job store
* facade command orchestration
* settings persistence
* host-specific IO
* UI-facing view model

---

## Key Rules

* runtime 不理解 provider 参数语义
* provider 不拥有 job 状态机
* 所有 HTTP 统一走 transport helper
* 不直接把原始 HTTP 错误抛给 engine
* 不把外部 response shape 暴露到 runtime

---

## Expected Outputs

对外应稳定暴露：

* provider descriptor
* config validation
* request validation
* invoke result
* registry list / get

---

## Testing Focus

* schema validation
* mock provider happy/failure path
* auth/header injection
* retry on 429 / 5xx
* error mapping
* response normalization

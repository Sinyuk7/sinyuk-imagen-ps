# Prototype Brief: Photoshop One-Click Generation

Status: DRAFT
Source: /office-hours discussion
Repo: sinyuk-imagen-ps
Change: bootstrap-ai-image-system-foundation

## What the prototype is trying to do

Build a small, runnable prototype that feels immediate and futuristic:
- the user is in Photoshop
- they select the current layer
- they click one action to send that layer into AI image generation
- the result comes back as a new layer or comparable non-destructive output

This is intentionally narrower than the broader foundation spec. The prototype should prove the core feeling first: "I can stay inside Photoshop and get a useful generated result with almost no friction."

## What "future-looking" means here

The prototype should feel:
- direct, not wizard-like
- minimal, not crowded with controls
- fast to understand in one glance
- useful immediately, without requiring the user to learn a workflow system

The visual and interaction goal is not "enterprise dashboard". It is "one clean action that feels like the future arrived inside Photoshop."

## Current user intent

Confirmed from the discussion:
- primary audience: Photoshop users
- secondary audience: anyone with AI image generation needs
- product reference: `sd-ppp` (`https://github.com/zombieyang/sd-ppp`)
- desired direction: more pure, more useful, less cluttered

## Narrowest wedge

The smallest valuable version is:
- read the active layer from Photoshop
- send that layer through the generation flow
- return the result back into the document

Everything else should be treated as secondary unless it helps the one-click flow feel dramatically better.

## Design constraints

- Keep the interaction path short
- Avoid exposing unnecessary provider complexity in the first impression
- Keep the experience focused on Photoshop, not on a general-purpose job console
- Prefer clarity and usefulness over feature breadth

## Open questions

- What exact generation control should remain visible at first launch, if any?
- Should the prototype keep the UI almost entirely within Photoshop, or pair it with a tiny companion web surface?
- What is the minimum amount of provider choice needed before the flow starts to feel complicated?

## Notes

This file is the repo-local artifact for the current office-hours direction, so it can be committed and shared through git instead of living only in a local tool directory.


可以，我们把边界钉死成一张表。

**我建议的分层边界**

| 层 | 应该放什么 | 不应该放什么 | 备注 |
|---|---|---|---|
| `core-engine` | job 状态机、执行编排、事件、step 流转、结果/错误封装、纯类型和校验 | UI、Photoshop API、文件系统、具体存储后端、provider 语义解释 | 这是最硬的共享核心 |
| `providers` | provider schema、默认值、参数语义、输入输出转换、invoke、结果规范化 | UI 组件、宿主 API、引擎状态、持久化实现 | provider 决定“是什么” |
| `workflows` | 声明式 workflow spec、step 顺序、step binding、配置数据 | 可执行业务逻辑、宿主调用、UI 状态 | workflow 只负责“怎么串起来” |
| `adapters` | asset IO、storage/persistence backend、宿主能力桥接、权限/限制处理 | 业务决策、provider 语义、UI 结构 | 适合放 Web/UXP 的差异 |
| `apps/web` | Web UI、表单渲染、预览、浏览器存储接入 | Photoshop API、UXP 专有能力、核心执行逻辑 | 只做浏览器宿主层 |
| `apps/ps-uxp` | PS 面板 UI、active layer 读取、结果回写、UXP 存储接入 | DOM-only 逻辑、浏览器专有能力、核心执行逻辑 | 只做 Photoshop 宿主层 |

**你刚才问的 persistence，我建议这样定：**

- **共享的是**
  - 保存什么
  - 保存结构
  - 版本迁移规则
  - 校验规则
  - “已保存/未保存”的状态定义

- **不共享的是**
  - 存到哪
  - 具体 API
  - IndexedDB / UXP storage / file / server 的实现
  - 宿主权限细节

所以更准确的说法是：

> **可以共享同一套持久化模型和规则，但由不同宿主实现自己的 storage backend。**

**provider 私有参数也可以这样拆：**

- **共享的**
  - 参数语义
  - schema
  - 默认值
  - 校验规则
  - 版本定义

- **宿主决定的**
  - 怎么画
  - 怎么排版
  - 折叠哪些高级项
  - 是否要做快捷输入
  - 密钥怎么安全存

所以你的理解是对的：

> 一个 provider 的参数，对 Web 和 PS UXP 来说，语义应该一样；区别只是 UI 呈现和宿主存储方式。

**我再给你一个更硬的结论：**

- `core-engine` 不碰“怎么存”
- `providers` 不碰“怎么画”
- `apps/*` 不碰“参数到底是什么意思”
- `adapters` 负责把宿主差异收口

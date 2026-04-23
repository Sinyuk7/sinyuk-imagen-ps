# Docs Boundaries — Sinyuk Imagen PS

## 目的

这个文件只负责定义文档边界，避免 `DESIGN.md`、`IMPLEMENTATION_PLAN.md` 和未来的业务文档互相串味。

当前阶段的目标不是补齐所有业务细节，而是先把“哪份文档负责什么”钉死。
当前 change 默认顺序仍然是：

1. 先业务代码
2. 再 CLI surface
3. 最后才是 UI

## 当前文档分工

### `DESIGN.md`

负责：

- 视觉方向
- 布局原则
- 组件气质
- 颜色、字体、空间、动效原则
- Photoshop / UXP 设计约束
- 后续 UI 阶段的体验基线

不负责：

- runtime phase
- 工程交付拆解
- 业务接口细节
- 页面字段清单
- view model 定义
- 当前 change 的验收标准

### `TOKEN.md`

负责：

- 实现级 tokens
- 组件尺寸、间距、圆角、颜色、状态 token
- 后续 UI 实现的 token 基线

不负责：

- 产品范围
- 业务流程
- 阶段计划
- 当前 change 的交付 gate

### `UI_MAIN_PAGE.md`

负责：

- 主页面结构
- 消息卡片结构
- composer 呈现
- loading / success / failure 的 UI 表现
- UI 只依赖哪些 UI-facing 数据
- 后续 UXP 主界面的 shape

不负责：

- runtime 内部实现
- store / event bus / queue / state machine 技术细节
- provider 调用细节
- 阶段排期
- 当前 change 的必须交付项

### `IMPLEMENTATION_PLAN.md`

负责：

- change scope
- 实施阶段
- 边界
- 依赖
- 验收标准
- 当前阶段是 CLI 先行还是 UI 先行
- thin facade 的角色定义

不负责：

- 具体页面结构
- 组件 anatomy
- token 细节
- 视觉规则

## 文档到目录的映射

以当前计划为准，推荐保持下面这组对应关系：

| 文档 | 对应目录 | 说明 |
|---|---|---|
| `IMPLEMENTATION_PLAN.md` | `packages/core-engine/`, `packages/providers/`, `packages/workflows/`, future `facade` / `cli` 目录 | 当前交付分期、接入边界、实现落点 |
| `DESIGN.md` | future `apps/ps-uxp/src/ui/` | 后续 UI 的视觉语言、组件气质、布局原则 |
| `TOKEN.md` | future `apps/ps-uxp/src/ui/` | 后续 UI 的组件尺寸、间距、颜色、状态 token |
| `UI_MAIN_PAGE.md` | future `apps/ps-uxp/src/features/main-page/`, `apps/ps-uxp/src/view-models/` | 后续主页面结构、消息 anatomy、UI-facing data |

目录目标不是“按技术栈分”，而是“按职责边界分”。

## 当前实现顺序

当前默认顺序是：

1. 先业务代码
2. 再 CLI surface
3. 再 UI

因此当前文档策略也应该服务这个顺序：

- 先把边界和职责拆干净
- 先把 runtime / provider / facade / CLI 的边界写清楚
- 不把 UI 文档写成当前实施计划
- 不让未来 UI 文档反向污染当前范围

## 后续可新增但非当前必需

以下文档可以后补，但不是这一步的重点：

- `RUNTIME_CONTRACT.md`
- `PROVIDER_CONFIG.md`
- `HOST_ADAPTERS.md`
- `CLI_COMMANDS.md`
- `FACADE_COMMANDS.md`

当前不需要先把这些写细，先把现有 docs 解耦更重要。

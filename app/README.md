# app

`app/` 是当前唯一应用目录。它承接 Photoshop / UXP、React UI，以及应用侧对共享模块的薄桥接。

## 先读哪里

- `SPEC.md`：当前阶段的本地规范
- `STATUS.md`：实现状态、偏差与不确定项
- `AGENTS.md`：模块级短规则
- 根级 UI 文档：`docs/DESIGN.md`、`docs/TOKEN.md`、`docs/UI_MAIN_PAGE.md`

## 当前最小结构

```txt
app/src/
  ui/
  host/
  shared/
  index.tsx
```

- `ui/`：React UI，本地页面和组件
- `host/`：Photoshop / UXP 相关代码
- `shared/`：对接 `core-engine / providers / workflows` 的薄桥接
- `index.tsx`：插件入口

## 本模块负责什么

- Photoshop / UXP host integration
- UI 组合与应用入口
- host 边界
- 应用侧共享命令桥接

当前 `ui / host / shared` 已经作为最小骨架落地，但仍只是占位实现，不代表真正的 UI 或 host 流程已经开始。

## 本模块不负责什么

- runtime lifecycle
- provider 参数语义与外部 API 映射
- 共享层类型与错误模型的定义
- 把 host IO 回流进 `core-engine`

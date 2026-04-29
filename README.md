# Sinyuk Imagen PS

Photoshop 图像生成插件 monorepo。包含两个 surface 应用和四个共享包。

## 当前结构

```
apps/
  app/     — Photoshop / UXP surface
  cli/     — Node.js CLI surface
packages/
  shared-commands/ — 公共 command facade
  core-engine/     — host-agnostic runtime
  providers/       — provider 语义与映射
  workflows/       — declarative workflow specs
```

## 先读哪里

- 项目入口与架构边界：`AGENTS.md`
- 架构说明：`ARCHITECTURE.md`
- 项目状态：`STATUS.md`
- 待处理项：`OPEN_ITEMS.md`
- 模块本地真相：各模块下的 `AGENTS.md`、`SPEC.md`、`README.md`

## 文档使用规则

- 子模块优先，根目录只负责索引和范围
- 代码只作弱证据，不覆盖已写明的意图
- 不为"看起来完整"而补流程、示例、runbook 或测试文档
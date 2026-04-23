# AGENTS.md

## Boot
- 先读根级 `README.md`、`STATUS.md`
- 再进入目标模块读取本地 `README.md`、`SPEC.md`、`STATUS.md`、`AGENTS.md`
- 只读取与当前任务相关的文件

## Priority
- 文档优先级：
  AGENTS.md > PRD / SPEC > README > 代码

## Scope
- 根目录只定义范围与约束
- 模块细节以下层文档为准

## Modules
- 当前模块：
  - `app`
  - `packages/core-engine`
  - `packages/providers`
  - `packages/workflows`

## Boundaries
- `core-engine`：runtime only
- `providers`：provider mapping only
- `workflows`：spec only
- `app`：host layer only

## IO Rule
- IO 只能存在于 `app/host` 或 adapter 边界
- 不允许进入 engine

## Stability
- 不要把当前实现当作最终架构
- 不确定时使用“暂定”
- 文档与代码冲突 → 记录到 `STATUS.md`

## Documentation
- 文档使用中文
- 代码符号 / 类型 / 接口 / API / 配置键 使用 English
- 引用代码时必须使用真实路径或函数名

## Docstring
- 仅函数使用结构化 docstring（见 `docs/DOCUMENTATION.md`）
- 不要求所有函数都写

## JSDoc
- type / interface / schema 必须使用 JSDoc
- 描述使用中文，术语保持 English
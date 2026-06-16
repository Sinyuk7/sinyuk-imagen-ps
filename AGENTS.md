# AGENTS.md

## Development Phase Invariant

This project is in a zero-user, zero-history-burden development stage. Optimize for the cleanest current-state architecture and simplest correct implementation.

Do not add compatibility layers, migrations, old-contract support, legacy fallbacks, deprecated behavior preservation, phased rollout logic, or speculative future-proofing unless the user explicitly overrides this invariant in the same conversation.

## Hard Rules

- This repo does not use global GBrain.
- Before non-trivial fixes or architecture changes, search local memory and current docs with `rg`:
  `rg -n "<module|symptom|error|decision>" docs/dev-memory docs/loops AGENTS.md README.md`
- Everything else lives in [docs/ENGINEERING_CONTEXT.md](docs/ENGINEERING_CONTEXT.md).

### 1. 中文优先

- 所有面向人类的文本——文档（`*.md`）、代码注释、JSDoc、commit message——必须使用中文编写。
- 技术术语和专有名词保留原文：如 TypeScript、React、UXP、interface、generic、async/await、Promise、CLI、API、export、import、JSDoc、npm、pnpm、Node.js、Photoshop、plugin、hook 等。
- 变量名、函数名、类名、文件名不使用中文，遵循各语言命名惯例。

### 2. 路径跨平台兼容

- 所有文件路径引用必须跨平台兼容：统一使用正斜杠 `/` 作为分隔符，禁止反斜杠 `\`。
- 禁止绝对路径（如 `/Users/...`、`C:\...`）。配置文件、文档链接、脚本引用一律使用相对路径。
- `import` 语句不在此列——保持 workspace 包名导入方式（如 `@sinyuk/application`）。

### 3. 公开 API 必须有文档

- 所有跨 package 引用的 export（class、function、interface、type、const）必须有 JSDoc 注释，用中文说明用途、参数和返回值。
- package 内部 export 不做强制要求，但建议为复杂逻辑添加注释。
- 格式要求：至少包含 `@description`；有参数则包含 `@param`；有返回值则包含 `@returns`。

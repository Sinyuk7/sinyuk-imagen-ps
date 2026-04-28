# Architecture

## 架构概述

`@imagen-ps/cli` 是 imagen-ps monorepo 中的两个 surface app 之一，作为 **lightweight automation surface** 存在。它位于依赖链的最外层，仅依赖 `@imagen-ps/shared-commands` 公共命令层，通过 Adapter 注入模式向 runtime 提供 Node.js 文件系统能力。

```
┌─────────────────────────────────────────────────────────┐
│                      apps/cli                            │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐ │
│  │  index   │──│ commands │──│ adapters              │ │
│  │ (entry)  │  │(provider │  │(FileConfigAdapter)    │ │
│  └──────────┘  │  / job)  │  └───────────────────────┘ │
│       │        └──────────┘            │                │
│       │              │                 │                │
│       ▼              ▼                 ▼                │
│  setConfigAdapter   command functions   ConfigStorageAdapter │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
              ┌──────────────────────┐
              │ @imagen-ps/shared-   │
              │ commands             │
              │ (application layer)  │
              └──────────┬───────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        core-engine  providers  workflows
```

## 模块结构

```
apps/cli/
├── src/
│   ├── index.ts                    # 入口：adapter 注入 + commander 初始化 + 命令注册
│   ├── adapters/
│   │   └── file-config-adapter.ts  # ConfigStorageAdapter 实现，原子写入 ~/.imagen-ps/config.json
│   ├── commands/
│   │   ├── provider/               # Provider 命令组
│   │   │   ├── index.ts            # 命令注册入口
│   │   │   ├── list.ts             # provider list
│   │   │   ├── describe.ts         # provider describe <id>
│   │   │   ├── config-get.ts       # provider config get <id>
│   │   │   ├── config-save.ts      # provider config save <id> <json>
│   │   │   └── config-interactive.ts # provider config (人工 shortcut)
│   │   └── job/                    # Job 命令组
│   │       ├── index.ts            # 命令注册入口
│   │       ├── submit.ts           # job submit <workflow> <json>
│   │       ├── get.ts              # job get <id>
│   │       └── retry.ts            # job retry <id>
│   └── utils/
│       ├── input.ts                # JSON 字符串 / @file 输入解析
│       └── output.ts               # 统一 JSON stdout/stderr 输出 + exit code
├── tests/                          # Vitest 单元/集成测试
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## 核心流程

### 命令执行流

```
CLI invocation
    │
    ▼
index.ts: 创建 FileConfigAdapter → setConfigAdapter(adapter) 注入到 shared-commands
    │
    ▼
commander 解析 argv → 匹配命令
    │
    ▼
命令 handler 调用 shared-commands 的导出函数
    │
    ├─ 同步命令（listProviders, describeProvider, getJob）
    │   → 直接返回结果
    │
    └─ 异步命令（getProviderConfig, saveProviderConfig, submitJob, retryJob）
        → await 返回 CommandResult<T>
    │
    ▼
结果处理：
    ├─ ok=true  → success(value)  → stdout JSON + exit(0)
    └─ ok=false → error(message) → stderr JSON + exit(1)
```

### 配置持久化流

```
saveProviderConfig()
    │
    ▼
FileConfigAdapter.save(providerId, config)
    │
    ├─ 清理残留 tmp 文件
    ├─ ensureDir：递归创建 ~/.imagen-ps/
    ├─ 读取现有 config.json（或创建初始结构）
    ├─ 合并 providers[providerId]
    ├─ 原子写入：writeFileSync(tmp) → rename(tmp → config.json)
    │
    ▼
文件系统错误通过 adapter 抛出 → CLI 层 catch → stderr JSON + exit(1)
```

## 关键依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@imagen-ps/shared-commands` | workspace:* | 公共命令层 — 所有业务逻辑入口 |
| `commander` | ^12.1.0 | CLI 框架：命令解析、子命令、help 生成 |
| `@types/node` | ^20.12.0 | Node.js 类型定义 |
| `vitest` | ^1.6.0 | 测试框架 |
| `typescript` | ^5.4.0 | 编译器 |

## 设计约束

| 约束 | 说明 |
|------|------|
| 禁止依赖 `@imagen-ps/app` | CLI 与 Photoshop surface 完全隔离，不共享任何代码 |
| Automation-first | 所有命令默认非交互、JSON 输出；交互仅限 `provider config` shortcut |
| Job 历史进程隔离 | `job get`/`job retry` 仅访问当前进程 runtime store，不持久化跨进程 |
| 禁止 DOM/React/UXP | 纯 Node.js 环境，不引入任何 browser-side 依赖 |
| 原子配置写入 | 使用 tmp+rename 模式，避免 crash 导致配置损坏 |
| ESM-only | `"type": "module"`，所有 import 使用 `.js` 扩展名 |

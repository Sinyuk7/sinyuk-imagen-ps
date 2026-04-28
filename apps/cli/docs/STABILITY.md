# 稳定性规范

## 稳定性要求

| 指标 | 要求 |
|------|------|
| 命令不崩溃（无 unhandled exception） | 所有命令异常必须被 catch 并输出 JSON error |
| Exit code 语义正确 | 成功 = 0，失败 = 1 |
| 配置文件不损坏 | 原子写入保证即使 crash 也不会产生半写文件 |

## 异常处理策略

### 关键路径：命令执行

所有命令 handler 遵循统一异常处理模式：

```
try {
  result = await command()
  if (!result.ok) → error(message) → stderr + exit(1)
  success(value) → stdout + exit(0)
} catch {
  error(message) → stderr + exit(1)
}
```

**保证**：无论 `@imagen-ps/shared-commands` 返回错误还是抛出异常，CLI 始终输出合法 JSON 并以非零退出。

### 关键路径：配置持久化

| 异常场景 | 处理 |
|----------|------|
| 配置文件不存在（首次读取） | 返回 `undefined`，不抛出 |
| 目录不存在 | `mkdirSync({ recursive: true })` 自动创建 |
| 目录路径被文件占用 | 抛出明确错误：`Config directory path is occupied by a file` |
| 写入权限不足 | 由 fs 抛出，CLI 层 catch 输出 JSON error |
| 进程 crash 中途（tmp 已写） | 下次 `save()` 清理残留 tmp 后继续 |

## 兜底策略

| 场景 | 兜底方案 |
|------|----------|
| shared-commands runtime 初始化失败 | adapter 注入在最前执行；若 setConfigAdapter 抛异常，进程直接退出（未达到命令解析） |
| Provider 不存在 | 返回 `{error: "Provider not found: <id>"}` + exit(1)，不 crash |
| JSON 输入解析失败 | 返回 `{error: "Invalid JSON: ..."}` + exit(1) |
| Job 不存在（进程级限制） | 返回明确提示 "Note: only jobs from the current process are visible" |

## 性能基线

| 指标 | 基线 |
|------|------|
| 冷启动到命令执行 | TODO: 待测量（目标 < 200ms） |
| `provider list` 响应 | < 50ms（纯内存操作） |
| `provider config save` | < 100ms（含文件 I/O） |
| `job submit`（mock provider） | < 100ms（无网络） |

## 监控与告警

当前 CLI 为本地工具，无远程监控。关键质量信号：

- **CI 测试通过率**：27 个测试全部通过为发布前置条件
- **构建成功**：`pnpm --filter @imagen-ps/cli build` 无错误
- **架构合规**：`grep -r "@imagen-ps/app" apps/cli/` 返回空（仅 README 说明文字除外）

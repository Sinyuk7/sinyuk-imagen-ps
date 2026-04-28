# 代码规范

## 命名约定

| 类别 | 规范 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `file-config-adapter.ts` |
| 类名 | PascalCase | `FileConfigAdapter` |
| 函数名 | camelCase | `registerProviderCommands` |
| 常量 | camelCase（非 UPPER_CASE） | `configPath` |
| 类型/接口 | PascalCase | `ConfigFile` |
| 命令注册函数 | `register<Group><Action>` | `registerProviderList` |

## 模块组织

- 每个命令一个文件，命令组通过 `index.ts` 注册
- Adapter 放在 `adapters/` 目录
- 工具函数放在 `utils/` 目录
- 测试文件镜像 `src/` 目录结构，放在 `tests/` 下

## 禁用模式

| 禁止 | 原因 | 替代方案 |
|------|------|----------|
| `import ... from '@imagen-ps/app'` | 架构边界禁止 CLI 依赖 PS surface | 仅使用 `@imagen-ps/shared-commands` |
| `console.log()` / `console.error()` | 破坏 JSON 输出格式 | 使用 `success()` / `error()` from `utils/output.ts` |
| CommonJS `require()` | 项目为 ESM-only | 使用 `import` |
| 相对 import 省略 `.js` | ESM 要求显式扩展名 | `import { x } from './foo.js'` |
| 命令 handler 中 `throw` 未被 catch | 导致 unhandled rejection，无 JSON 错误输出 | 所有 async handler 需 try/catch 包裹 |
| 直接 `process.exit()` 在命令文件中 | 耦合退出逻辑 | 通过 `success()` / `error()` 统一退出 |
| 在 adapter 中 swallow 错误 | 隐藏文件系统问题 | 仅 ENOENT 可安全忽略（读操作），其余必须抛出 |

## 推荐模式

### 异步命令 handler 模板

```typescript
import type { Command } from 'commander';
import { someCommand } from '@imagen-ps/shared-commands';
import { success, error } from '../../utils/output.js';

export function registerXxxYyy(parent: Command): void {
  parent
    .command('yyy <arg>')
    .description('...')
    .action(async (arg: string) => {
      try {
        const result = await someCommand(arg);
        if (!result.ok) {
          error(result.error.message);
        }
        success(result.value);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        error(msg);
      }
    });
}
```

### 同步命令 handler 模板

```typescript
export function registerXxxYyy(parent: Command): void {
  parent
    .command('yyy')
    .description('...')
    .action(() => {
      const result = syncCommand();
      success(result);
    });
}
```

## 代码审查要点

- [ ] 命令 handler 是否用 try/catch 包裹所有 async 操作？
- [ ] 是否通过 `success()` / `error()` 统一输出？
- [ ] import 路径是否带 `.js` 扩展名？
- [ ] 是否引入了 `@imagen-ps/app` 或任何 browser-side 依赖？
- [ ] FileConfigAdapter 的 fs 操作是否正确处理 ENOENT？
- [ ] 新增命令是否在对应的 `index.ts` 中注册？

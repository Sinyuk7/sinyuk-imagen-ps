# 代码规范

## 命名约定

### 文件命名

| 类型 | 规则 | 示例 |
|------|------|------|
| React 组件 | kebab-case | `app-shell.tsx` |
| 工厂函数 | kebab-case，以 `create-` 开头 | `create-plugin-host-shell.ts` |
| 模型文件 | kebab-case，以 `-model` 结尾 | `plugin-app-model.ts` |
| 入口文件 | `index.tsx` 或 `index.ts` | `index.tsx` |

### 类型命名

| 类型 | 规则 | 示例 |
|------|------|------|
| 接口 | PascalCase | `PluginHostShell`, `AppShellProps` |
| 类型别名 | PascalCase | `PluginAppModel` |
| 泛型参数 | 单字母大写或描述性名称 | `T`, `TProps` |

### 函数命名

| 类型 | 规则 | 示例 |
|------|------|------|
| 工厂函数 | camelCase，以 `create` 开头 | `createPluginHostShell()` |
| React 组件 | PascalCase | `AppShell` |
| 事件处理 | camelCase，以 `handle` 或 `on` 开头 | `handleClick`, `onSubmit` |

### 常量命名

| 类型 | 规则 | 示例 |
|------|------|------|
| 模块级常量 | camelCase | `pluginHost` |
| 字面量类型值 | kebab-case 字符串 | `"photoshop-uxp"`, `"placeholder"` |

## 禁用模式

### 禁止：在 ui/ 直接调用 runtime

```typescript
// ❌ 错误：UI 组件直接持有 runtime
import { createRuntime } from "@imagen-ps/core-engine";

function MyComponent() {
  const runtime = createRuntime(); // 禁止
}
```

```typescript
// ✅ 正确：通过 shared 层桥接
import { useSomeCommand } from "../shared/commands";

function MyComponent() {
  const command = useSomeCommand();
}
```

### 禁止：在 ui/ 直接调用 provider

```typescript
// ❌ 错误：UI 直接调用 provider 内部逻辑
import { mockProvider } from "@imagen-ps/providers";

function Settings() {
  mockProvider.invoke(request); // 禁止
}
```

### 禁止：把 host IO 放在 shared/ 或 ui/

```typescript
// ❌ 错误：在 shared 层进行 Photoshop 操作
// src/shared/some-bridge.ts
const doc = await app.activeDocument; // 禁止

// ✅ 正确：host IO 只在 host/ 层
// src/host/document-adapter.ts
export async function getActiveDocument() {
  return app.activeDocument;
}
```

### 禁止：可变接口属性

```typescript
// ❌ 错误：允许修改
interface BadModel {
  stage: string; // 可变
}

// ✅ 正确：只读属性
interface GoodModel {
  readonly stage: string;
}
```

### 禁止：复杂的 shared 层抽象

```typescript
// ❌ 错误：shared 层不应该是复杂的状态管理器
// src/shared/complex-state-manager.ts
class ComplexStateManager {
  private state: Map<string, any>;
  subscribe() { ... }
  dispatch() { ... }
}

// ✅ 正确：shared 层保持薄桥接
// src/shared/simple-bridge.ts
export function submitJob(request: JobRequest) {
  return commands.submitJob(request);
}
```

## 推荐模式

### 工厂函数模式

```typescript
// 推荐：使用工厂函数创建实例
export interface PluginHostShell {
  readonly kind: "photoshop-uxp";
  readonly app: PluginAppModel;
}

export function createPluginHostShell(): PluginHostShell {
  return {
    kind: "photoshop-uxp",
    app: createPluginAppModel()
  };
}
```

### 接口优先导出

```typescript
// 推荐：先导出接口，再导出实现
export interface AppShellProps {
  readonly host: PluginHostShell;
}

export function AppShell({ host }: AppShellProps) {
  // ...
}
```

### 统一入口导出

```typescript
// 推荐：在 index.tsx 统一导出公开 API
export { createPluginHostShell } from "./host/create-plugin-host-shell";
export { createPluginAppModel } from "./shared/plugin-app-model";
export { AppShell } from "./ui/app-shell";

export const pluginHost = createPluginHostShell();
export default pluginHost;
```

## 代码审查要点

### 层级边界检查

- [ ] `ui/` 是否直接导入了 `@imagen-ps/core-engine` 的内部 API？
- [ ] `shared/` 是否包含 Photoshop/UXP 的直接调用？
- [ ] `host/` 是否包含业务逻辑或 UI 渲染代码？

### 不可变性检查

- [ ] 接口属性是否使用 `readonly`？
- [ ] 数组类型是否使用 `readonly T[]`？
- [ ] 是否避免了对象的直接修改？

### 命名一致性检查

- [ ] 工厂函数是否以 `create` 开头？
- [ ] React 组件是否使用 PascalCase？
- [ ] 文件名是否与导出的主要内容匹配？

### 导出检查

- [ ] 所有公开 API 是否在 `index.tsx` 中导出？
- [ ] 是否避免导出内部实现细节？

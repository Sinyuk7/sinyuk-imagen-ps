# 模块使用

## 核心 API 列表

### 导出入口 (index.tsx)

| API | 说明 |
|-----|------|
| `createPluginHostShell()` | 创建 Photoshop/UXP host shell 实例 |
| `createPluginAppModel()` | 创建插件应用模型 |
| `AppShell` | React 应用外壳组件 |
| `pluginHost` | 默认导出的 host shell 实例 |

### PluginHostShell

```typescript
interface PluginHostShell {
  readonly kind: "photoshop-uxp";
  readonly app: PluginAppModel;
}
```

- `kind`：host 类型标识，固定为 `"photoshop-uxp"`
- `app`：应用模型实例

### PluginAppModel

```typescript
interface PluginAppModel {
  readonly stage: "placeholder";
  readonly host: "photoshop-uxp";
  readonly notes: readonly string[];
}
```

- `stage`：当前阶段，`"placeholder"` 表示占位实现
- `host`：目标宿主类型
- `notes`：开发提示信息

### AppShell 组件

```typescript
interface AppShellProps {
  readonly host: PluginHostShell;
}

function AppShell({ host }: AppShellProps): JSX.Element
```

React 应用外壳组件，接收 host shell 实例进行渲染。

## 典型用法

### 场景一：创建并使用 host shell

```typescript
import { createPluginHostShell, AppShell } from "@imagen-ps/app";

// 创建 host shell
const host = createPluginHostShell();

// 检查 host 类型
console.log(host.kind); // "photoshop-uxp"

// 检查当前阶段
console.log(host.app.stage); // "placeholder"

// 在 React 中渲染
function MyPlugin() {
  return <AppShell host={host} />;
}
```

### 场景二：使用默认导出

```typescript
import pluginHost from "@imagen-ps/app";

// 直接使用预创建的实例
console.log(pluginHost.kind); // "photoshop-uxp"
console.log(pluginHost.app.notes);
```

### 场景三：分层导入

```typescript
// 仅导入需要的部分
import { createPluginAppModel } from "@imagen-ps/app";

// 单独创建应用模型
const appModel = createPluginAppModel();
console.log(appModel.notes);
```

## 注意事项

### 当前阶段限制

- 当前实现为占位阶段（`stage: "placeholder"`）
- 仅提供最小骨架，不包含完整的 UI 或 host 流程
- 共享模块（`core-engine`、`providers`、`workflows`）的集成尚未实现

### 层级边界

- `ui/` 组件不应直接访问 runtime 或 provider 内部对象
- 对共享模块的调用应通过 `shared/` 层进行
- 所有 Photoshop/UXP IO 必须在 `host/` 层处理

### 类型安全

- 所有接口属性均为 `readonly`
- `notes` 使用 `readonly string[]` 确保不可变

## 后续扩展方向

TODO: 以下功能待后续阶段实现：

- 与 `shared commands` 的集成
- provider 配置 UI
- job 提交与状态展示
- Photoshop 文件操作集成

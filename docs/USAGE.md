# 模块使用

## 包依赖声明

本项目为 monorepo 结构，包间依赖通过 pnpm workspace 管理。

### 在 surface app 中使用 shared commands

```json
// apps/app/package.json 或 apps/cli/package.json
{
  "dependencies": {
    "@imagen-ps/shared-commands": "workspace:*"
  }
}
```

Surface app 不应直接组装 runtime，也不应相互依赖。`apps/cli` MUST NOT 依赖 `@imagen-ps/app`。

`apps/cli` 定位为 lightweight automation surface：默认面向脚本、AI Skill、MCP wrapper 与 CI，使用非交互参数和机器可读 JSON；同时允许人工手动执行少量基础命令（例如 `imagen provider list`、`imagen provider config`）完成 provider/model bootstrap 配置。它不是复杂的交互式终端 UI 产品。

### 在 shared-commands 中依赖 runtime packages

```json
// packages/shared-commands/package.json
{
  "dependencies": {
    "@imagen-ps/core-engine": "workspace:*",
    "@imagen-ps/providers": "workspace:*",
    "@imagen-ps/workflows": "workspace:*"
  }
}
```

### 在 providers / workflows 中依赖 core-engine

```json
// packages/providers/package.json 或 packages/workflows/package.json
{
  "dependencies": {
    "@imagen-ps/core-engine": "workspace:*"
  }
}
```

## 导入方式

### shared-commands

```typescript
import {
  submitJob,
  getJob,
  subscribeJobEvents,
  listProviders,
  describeProvider,
  getProviderConfig,
  saveProviderConfig,
  retryJob,
  // v3: profile & model discovery
  listProviderProfiles,
  getProviderProfile,
  saveProviderProfile,
  deleteProviderProfile,
  testProviderProfile,
  listProfileModels,
  refreshProfileModels,
  setProfileDefaultModel,
  setProfileEnabled,
  setConfigAdapter,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  type CommandResult,
  type SubmitJobInput,
  type ConfigStorageAdapter,
  type ProviderProfile,
  type ProviderProfileRepository,
  type SecretStorageAdapter,
} from '@imagen-ps/shared-commands';
```

### core-engine

```typescript
import {
  createRuntime,
  createWorkflowRegistry,
  createWorkflowRunner,
  createJobStore,
  createEventBus,
  type Job,
  type JobInput,
  type WorkflowSpec,
  type ProviderDispatch,
} from '@imagen-ps/core-engine';
```

### providers

```typescript
import {
  createProviderRegistry,
  registerBuiltins,
  createDispatchAdapter,
  type Provider,
  type ProviderDescriptor,
  type ProviderConfig,
  type ProviderRequest,
  type ProviderResult,
} from '@imagen-ps/providers';
```

### workflows

```typescript
import { builtinWorkflows, providerGenerateWorkflow, providerEditWorkflow } from '@imagen-ps/workflows';
```

## 典型 surface 集成流程

### 1. 注入 surface-specific adapter

```typescript
import { setConfigAdapter, type ConfigStorageAdapter } from '@imagen-ps/shared-commands';

const adapter: ConfigStorageAdapter = {
  async get(providerId) {
    // surface-specific persistence read
    return undefined;
  },
  async save(providerId, config) {
    // surface-specific persistence write
  },
};

setConfigAdapter(adapter);
```

### 2. 调用命令

#### Profile-based dispatch（推荐）

当 `profileId` 已关联到 provider config（含 API key、baseURL、defaultModel）时，直接通过 profile submit job：

```typescript
import { submitJob } from '@imagen-ps/shared-commands';

const result = await submitJob({
  workflow: 'provider-generate',
  input: { profileId: 'my-n1n-profile', prompt: 'a cat' },
});

if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error);
}
```

#### Direct provider dispatch

直接指定 provider adapter（通常用于测试或特殊场景）：

```typescript
const result = await submitJob({
  workflow: 'provider-generate',
  input: { provider: 'mock', prompt: 'a cat' },
});
```

### 3. 查询 provider

```typescript
import { listProviders, describeProvider } from '@imagen-ps/shared-commands';

const providers = listProviders();
const mock = describeProvider('mock');
```

## CLI automation entrypoint

CLI 入口提供无需启动 Photoshop / UXP 的 Node.js 命令入口。典型用法：

```bash
# Provider management
imagen provider list
imagen provider describe mock
imagen provider config get mock
imagen provider config save mock @config.json

# Profile management (v3)
imagen profile list
imagen profile get <profileId>
imagen profile save @profile.json
imagen profile delete <profileId>
imagen profile test <profileId>
imagen profile enable <profileId>
imagen profile disable <profileId>

# Model discovery (v3)
imagen profile models <profileId>
imagen profile refresh-models <profileId>
imagen profile set-default-model <profileId> <modelId>

# Job submission — profile-based dispatch（推荐）
imagen job submit provider-generate '{"profileId":"my-n1n-profile","prompt":"a red apple"}'

# Job submission — direct provider dispatch（测试/特殊场景）
imagen job submit provider-generate @input.json
```

`provider config save` 与 `job submit` 这类 automation 命令应保持非交互、JSON 输入/输出，适合被脚本、AI Skill、MCP wrapper 或 CI 调用。

也允许一个极简人工配置 shortcut：

```bash
imagen provider config
```

该 shortcut 仅用于人工初始化或快速修正 provider/model 配置，例如选择 provider、输入 API key / base URL / default model，并保存到 CLI 的文件系统 config adapter。

## 直接使用底层 runtime packages

`core-engine`、`providers`、`workflows` 主要供 `packages/shared-commands` 组装 runtime 使用。Surface app 默认不直接访问这些包的 runtime assembly API。

如果需要在 package 内部做底层集成测试，可以直接创建 runtime：

```typescript
import { createRuntime } from '@imagen-ps/core-engine';
import { createProviderRegistry, createDispatchAdapter } from '@imagen-ps/providers';
import { builtinWorkflows } from '@imagen-ps/workflows';
```

## 注意事项

- 当前阶段 API 可能变动，以 OpenSpec 和源码为准
- `apps/app` 与 `apps/cli` 通过 `@imagen-ps/shared-commands` 收口对业务能力的调用
- IO 操作只能在 surface host/adapter 边界或 provider transport 边界发生
- `packages/shared-commands` 必须保持 host-agnostic，不依赖 React、DOM、Photoshop、UXP 或 Node fs/path/os

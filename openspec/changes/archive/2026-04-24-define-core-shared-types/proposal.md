## Why

当前 `packages/core-engine` 仅包含 bootstrap 占位符，缺少所有后续部件（store、events、runner、dispatch、registry）都依赖的共享类型契约。若不先固化 Job、Workflow、Step、ProviderRef、Asset、Runtime 等核心类型，后续实现将在不稳定的地基上构建，导致接口频繁重构。因此必须在任何执行逻辑之前，先定义并导出这些类型。

## What Changes

- 在 `packages/core-engine/src/types/` 下新建类型文件：
  - `job.ts`：Job 状态模型（`JobStatus`、`Job`、`JobInput`、`JobOutput`、`JobStore`）
  - `workflow.ts`：Workflow 声明模型（`Workflow`、`Step`、`StepKind`）
  - `provider.ts`：Provider 引用与调用抽象（`ProviderRef`、`ProviderDispatcher`）
  - `asset.ts`：Asset 资源描述（`Asset`、`AssetType`）
  - `index.ts`：类型聚合与统一导出
- 更新 `packages/core-engine/src/index.ts`，导出 `src/types/` 下的所有公共类型
- 所有类型保持 serializable、immutable，禁止包含函数或 DOM/UXP 相关类型

## Capabilities

### New Capabilities
- `core-shared-types`: 定义 Job、Workflow、Step、ProviderRef、Asset、Runtime 等核心共享类型契约，为 store、events、runner、dispatch 提供稳定的类型地基

### Modified Capabilities
- 无（当前没有已存在的 spec 需要修改）

## Impact

- **受影响代码**：`packages/core-engine/src/types/*`、`packages/core-engine/src/index.ts`
- **API 影响**：新增大量 TypeScript 类型导出，不引入运行时行为，无 breaking change
- **依赖影响**：`packages/providers`、`packages/workflows`、`app` 后续可通过 `core-engine` 的类型导引用统一契约
- **编译影响**：模块编译目标不变，仅增加类型定义，不增加运行时依赖

## Non-goals

- 不在本 change 中定义错误模型（`JobError` taxonomy），将在 `define-error-taxonomy` 中处理
- 不在本 change 中实现边界守卫（serializable / immutable 校验函数），将在 `define-invariant-guards` 中处理
- 不引入任何执行逻辑、状态管理或事件发射实现
- 不触碰 provider 参数语义解释或外部 API 映射
- 不添加 UI、DOM、UXP、文件系统或网络相关类型

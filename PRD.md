# **PRD — AI Image System (Agent-Native, TS-First, UXP + Web)**

---

# **1. Document Status**

* **Version:** v0.5
* **Status:** Ready for Implementation
* **Audience:** Engineering / AI Coding Agents

---

# **2. Product Summary**

构建一个 **跨宿主的 AI 图像执行系统**，支持：

* Photoshop UXP Plugin（受限运行环境）
* Web React Application（标准浏览器环境）
* 多 Provider 图像生成能力（Flux / ComfyUI / 自定义接口）
* 多步骤 Workflow 执行

---

## **系统定义**

```text
Deterministic Execution Engine + Extensible Provider System
```

---

# **3. Product Goals**

## **3.1 Core Goals**

* 单一语言：TypeScript
* 引擎与宿主完全解耦（Host-agnostic）
* Provider 可扩展
* 支持多步骤执行（Workflow）

---

## **3.2 Non-Goals (v1)**

* 不实现跨 Provider 参数统一
* 不实现 Workflow 可视化编辑器
* 不实现 Agent runtime 执行系统
* 不构建复杂 DAG 编辑器

---

# **4. System Architecture**

```text
apps/
  web/
  ps-uxp/

packages/
  core-engine/
  providers/
  workflows/

agents/
  (用于开发阶段 AI 协作)
```

---

# **5. Core Engine**

---

## **5.1 Engine Definition**

Engine 是一个 **确定性的执行运行时**，负责：

* Job 生命周期管理
* Workflow 执行
* Provider 调度
* 状态更新
* 事件分发

---

## **5.2 Engine Boundary**

Engine 不负责：

* UI
* 文件系统
* 宿主 API
* 参数语义解析

---

## **5.3 Execution Model**

```text
Job → Workflow → Steps
```

---

## **5.4 Data Model**

### **Job**

```ts
type JobEnvelope = {
  id: string
  provider: string
  workflow: string
  input: unknown
  metadata?: Record<string, any>
}
```

---

### **Workflow（声明层）**

```ts
type WorkflowSpec = {
  id: string
  steps: StepSpec[]
}
```

---

### **Step**

```ts
type StepSpec =
  | { kind: "provider"; provider: string; action: string; input: string }
  | { kind: "transform"; transformer: string; input: string }
  | { kind: "io"; operation: string; input: string }
```

---

## **5.5 Execution Rules**

* 每个 Step 接收不可变输入
* Step 不共享临时状态
* Step 执行结束必须释放资源
* 仅允许显式输出进入下一 Step

---

## **5.6 Event System**

```ts
job:created
job:running
job:completed
job:failed
```

---

## **5.7 State Management**

* 使用 Zustand（vanilla）
* 独立于 UI 框架运行

---

# **6. Provider System**

---

## **6.1 Provider Interface**

```ts
type Provider = {
  schema: ZodSchema
  invoke: (input: unknown) => Promise<any>
  transformInput?: Function
  transformOutput?: Function
}
```

---

## **6.2 Design Principles**

* Provider 拥有完整参数语义控制权
* Engine 不解析参数
* 使用 Zod 进行运行时校验

---

# **7. Workflow System**

---

## **7.1 Capability**

* 单步骤执行
* 多步骤 Pipeline
* Provider 调用链

---

## **7.2 Execution**

Workflow 在运行时被解析为顺序执行的步骤列表。

---

# **8. Asset & IO System**

---

## **8.1 Binary Format**

```ts
type BinaryPayload = ArrayBuffer | Uint8Array
```

---

## **8.2 AssetIOAdapter**

```ts
interface AssetIOAdapter {
  read(ref: AssetRef): Promise<BinaryPayload>
  write(ref: AssetTarget, data: BinaryPayload): Promise<AssetRef>
}
```

---

## **8.3 Host Implementation**

### Web

* File / Blob API（内部转换为 BinaryPayload）

### Photoshop UXP

* `uxp.storage.localFileSystem`
* `BatchPlay`

---

## **8.4 Constraints（UXP）**

* 无完整 DOM
* 无 Node.js API
* 文件系统通过 UXP API
* 网络请求需要 manifest 权限声明
* 二进制数据需使用 ArrayBuffer

---

# **9. Technical Stack**

---

## **9.1 Monorepo**

* pnpm workspace
* Turborepo

---

## **9.2 Internal Packages**

* TypeScript（tsc）
* 不强制 bundling

---

## **9.3 Engine**

* Event Bus：mitt
* State：zustand/vanilla
* Validation：Zod

---

## **9.4 Web**

* React
* Vite
* Tailwind CSS
* Radix UI

---

## **9.5 Photoshop UXP**

* React
* Spectrum Web Components
* Webpack 5
* UXP API v6+

---

# **10. Functional Requirements**

---

## **10.1 Web**

* 上传图像
* 配置参数
* 提交 Job
* 显示执行状态
* 渲染结果

---

## **10.2 Photoshop**

* 读取当前图层
* 转换为输入数据
* 提交 Job
* 输出新图层

---

# **11. Observability**

---

系统必须提供：

* Job 状态追踪
* 执行事件日志
* 错误信息

---

# **12. Agent Collaboration（开发阶段）**

---

## **12.1 作用**

Agent 用于：

* 代码生成
* 架构扩展
* Workflow 编写

---

## **12.2 结构**

```text
agents/
  system/
  skills/
  tools/
```

---

## **12.3 约束原则**

* 核心模块必须保持纯净
* IO 必须通过 Adapter
* 不允许跨层依赖

---

# **13. Risks & Mitigation**

| 风险       | 描述           | 对策             |
| -------- | ------------ | -------------- |
| UXP 内存限制 | 大图处理易 OOM    | 使用 Binary + 分块 |
| API 限制   | 无标准 fs       | 使用 Adapter     |
| 参数复杂     | Provider 差异大 | Opaque Params  |
| 状态污染     | 异步链路复杂       | Step 隔离        |
| 架构破坏     | 误用 UI API    | 强边界约束          |

---

# **14. Final Summary**

---

## **系统本质**

```text
Deterministic Execution Engine + Extensible Provider System
```

---

## **核心组成**

* Engine：执行
* Provider：语义
* Workflow：编排
* Host：输入输出
* Agent：开发辅助

---

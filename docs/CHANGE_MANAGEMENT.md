# 变更管理

## 开发阶段不可变约束

当前项目处于 0 用户、0 历史负担的开发阶段。

这是本仓库最高优先级的变更管理规则。它优先于架构偏好、实现便利性、review comment、OpenSpec 惯例和任何生成的 artifact 模板。

所有变更流程、OpenSpec proposal、design、spec、tasks、review notes、archive notes、实现计划、任务列表、代码注释、JSDoc 契约说明、测试描述与代码修改都必须基于以下前提：不存在现有用户、生产数据、历史 API 契约、已发布插件契约或需要保留的旧行为。

因此，变更设计必须优先选择最干净的当前态架构与最简单正确实现。除非用户在同一段对话中明确覆盖该约束，否则严禁引入、保留或讨论以下概念：

- 兼容层
- 迁移路径
- 升级路径
- 版本号门禁
- 为旧行为设置的 feature gate
- 旧逻辑 fallback
- 旧契约支持
- 废弃行为保留
- 分阶段 rollout 逻辑
- 向后/向前兼容性分析
- API、契约或 spec 的版本化标签，例如 `Stable v1`、`Stable v1.1`、`v2 contract` 或类似版本声明
- 因为某个旧 artifact、旧任务、旧草稿、旧实现或 review comment 中曾经存在，就继续保留某种行为
- 非当前设计必需的预留字段或未来化描述，例如 `for future support`、`future model selection`、`future compatibility`

在编辑或接受任何 OpenSpec artifact 前，必须主动扫描并消除以下禁用语言：`Stable v`、`v1`、`v1.1`、`legacy`、`compat`、`compatibility`、`migration`、`fallback`、`deprecated`、`rollout`、`upgrade`、`old contract`、`backward`、`forward`、`future support`。当这些词用于产品、API 或契约行为时，必须立即移除或重写；第三方依赖版本号不属于该限制。

OpenSpec 文档中如果出现依赖上述概念的设计，必须重写为干净的当前态设计。不得把这类问题降级为 P1/P2/P3 polish 或 archive 前再处理；任何出现都属于阻塞缺陷，必须在进入实现前立即修复。

当前阶段允许破坏性变更，只要它能提升正确性、清晰度或架构质量。

## 变更分类

| 类型 | 描述 | 风险等级 |
|------|------|----------|
| 新增模块 | 添加新的共享包或功能模块 | 高 |
| 接口变更 | 修改公开导出的类型或函数签名 | 高 |
| 内部重构 | 不改变公开接口的内部实现调整 | 中 |
| 文档更新 | 更新 README、SPEC、STATUS 等文档 | 低 |
| 依赖更新 | 升级外部依赖版本 | 中 |
| Bug 修复 | 修复已有功能的缺陷 | 中 |

## 变更流程

### 1. 文档优先

在动手写代码之前，先更新相关文档：

- 如果是新功能，先更新对应模块的 `SPEC.md`
- 如果影响架构，先更新 `ARCHITECTURE.md`
- 如果影响使用方式，先更新 `docs/USAGE.md`

### 2. openspec 流程

本项目使用 `openspec/` 目录管理变更规范：

```
openspec/
├── changes/              # 进行中的变更
│   └── {change-name}/
│       ├── .openspec.yaml
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       └── specs/
└── specs/                # 已落地的规范
```

### 3. 提交与审查

#### 提交信息规范

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type**：
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关

**Scope**：
- `core-engine`
- `providers`
- `workflows`
- `app`
- `docs`

**示例**：

```
feat(providers): add openai-compatible provider

Implement OpenAI compatible API provider with:
- Config schema validation
- Request/response transformation
- Error mapping

Closes #123
```

## CR 流程

### 必须检查项

| 检查项 | 适用变更 |
|--------|----------|
| 类型定义完整且有 JSDoc | 所有接口/类型变更 |
| 测试覆盖关键路径 | 功能新增/修改 |
| 文档与代码同步 | 所有变更 |
| 依赖方向正确 | 涉及跨包依赖 |
| 无 IO 泄漏到 core-engine | 涉及 core-engine 变更 |

### 审批要求

TODO: 审批人数和角色待定义。

当前阶段建议：
- 涉及接口变更：至少 1 人 review
- 涉及架构变更：需要讨论确认

## 发布流程

### 分支策略

TODO: 分支策略待定义。

当前阶段建议：
- 主分支：`main`
- 功能分支：`feat/{feature-name}`
- 修复分支：`fix/{issue-id}`

### 发版节奏

当前项目处于早期阶段，暂无固定发版节奏。

所有包标记为 `private: true`，不发布到 npm。

## 回滚策略

### 代码回滚

```bash
# 回滚到指定 commit
git revert <commit-hash>

# 强制回滚（慎用）
git reset --hard <commit-hash>
```

### 依赖回滚

如果依赖升级导致问题：

1. 修改 `package.json` 中的版本号
2. 删除 `node_modules` 和 `pnpm-lock.yaml`
3. 重新安装：`pnpm install`

## 文档同步

变更完成后，确保以下文档同步更新：

| 变更类型 | 需更新的文档 |
|----------|-------------|
| 新增模块 | `COMPONENT_REGISTRY.md`, 对应包的 `README.md` |
| 接口变更 | 对应包的 `SPEC.md`, `docs/USAGE.md` |
| 架构变更 | `ARCHITECTURE.md`, `AGENTS.md` |
| 状态变化 | `STATUS.md`（根级或模块级） |

## 已知偏差记录

当文档与代码出现冲突时：

1. 在对应的 `STATUS.md` 中记录偏差
2. 创建 issue 跟踪
3. 后续修复时同步更新文档

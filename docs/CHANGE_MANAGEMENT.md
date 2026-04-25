# 变更管理

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

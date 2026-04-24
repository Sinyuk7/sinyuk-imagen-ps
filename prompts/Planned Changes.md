请在 <MODULE_PATH> 内执行一次模块状态规划任务。

目标：
将当前模块文档压缩成一份可执行的 <MODULE_PATH>/STATUS.md，使它成为后续单个 OpenSpec change 的输入文档。

本次任务只做：
- 阅读与分析模块文档
- 识别当前模块状态、阻塞、风险、依赖
- 拆分高内聚的 change candidates
- 推荐下一个最应该创建的 OpenSpec change
- 重写 <MODULE_PATH>/STATUS.md

本次任务不做：
- 不创建 openspec/changes/*
- 不生成 proposal.md / design.md / specs / tasks.md
- 不修改源码
- 不实现功能
- 不生成跨模块 roadmap
- 不把 change candidates 展开成 implementation tasks
- 不改写 README.md / PRD.md / SPEC.md / AGENTS.md
- 如发现这些文件存在冲突，只在 STATUS.md 的 Open Questions / Risks 或 Notes 中记录

## 1. Context Loading Rules

先读取以下必读文档：

- <MODULE_PATH>/AGENTS.md
- <MODULE_PATH>/PRD.md
- <MODULE_PATH>/README.md
- <MODULE_PATH>/SPEC.md
- <MODULE_PATH>/STATUS.md

然后获取模块目录快照：

- 只需要 1~2 层目录树
- 重点确认 docs、contracts、workflows、templates、examples、tests、src 等目录是否存在
- 不要默认阅读源码内容
- 只有当文档无法判断模块边界、接口、目录职责，或文档明确引用某个文件时，才读取额外文件

额外 md 文档读取规则：

- 如果核心文档引用了其他 md，必须读取
- 如果发现文档之间存在冲突，可以读取相关 md 进行核对
- 不要为了“完整性”无边界扫描所有文件
- 不要读取当前模块之外的文档，除非核心文档明确引用；即便读取，也只能作为 external reference，不得把它纳入当前模块计划

## 2. Evidence Rules

写入 STATUS.md 时必须区分 confirmed 与 tentative：

- Confirmed Baseline 只能写来自已有文档明确支持的内容
- 没有明确证据、但根据目录或上下文推导出的内容，必须标记 `(tentative)`
- 文档冲突、缺失、互相矛盾的内容，不得写成既定事实
- 不要重抄 PRD / README / SPEC 的长段内容，只提炼对后续 change planning 有用的状态
- 如果 PRD 已经清楚描述职责，不要在 STATUS.md 里重复完整 PRD；只保留压缩后的 planning baseline

## 3. Baseline Analysis

分析当前模块已经明确的：

- responsibilities
- boundaries
- non-goals
- constraints

要求：

- 只保留后续规划必须知道的信息
- 避免把 STATUS.md 写成迷你版 PRD
- 如果某项已经在 PRD / SPEC 中非常明确，可以用压缩表达
- 如果某项仍不确定，标记 `(tentative)` 或放入 Open Questions / Risks

## 4. Open Questions / Risks

识别当前模块的：

- open questions
- ambiguous areas
- risks
- blocker
- 文档冲突点
- 依赖未决点
- 可能影响后续 OpenSpec change 的未知项

如果发现严重问题，例如：

- PRD 与 SPEC 明显冲突
- 模块职责无法判断
- 当前模块边界与已有文档完全不一致
- 必要输入文档缺失，导致无法可靠规划

不要强行编造完整计划。

这种情况下：

- 仍然重写 STATUS.md
- 在 `## 2. Open Questions / Risks` 中把 blocker 放在最前面
- `Planned Changes` 只能给出 unblock 类型的 change
- `Suggested Next OpenSpec Change` 必须优先选择解除 blocker 的 change

## 5. Change Candidate Splitting Rules

将后续推进拆分为 1~5 个有顺序的 change candidates。

每个 change candidate 必须满足：

- 边界清晰
- 高内聚
- 可独立转化为一个 OpenSpec change
- 可独立验证
- 不跨出当前模块
- 不直接展开 implementation tasks
- 不把宿主层或其他模块纳入 scope

避免过度拆分：

- 如果多个小变更修改同一批文件、同一组接口、同一个逻辑闭环，应合并为一个中等粒度 change
- 如果一个变更必须和另一个变更同时完成才有意义，应合并
- 如果拆分只会制造 proposal/spec/tasks 的往返成本，而不会降低风险，应合并
- 不要把“类型定义”“接口调整”“对应文档更新”拆成多个 change，除非它们有独立决策风险
- 一个好的 change 应该是“一个可验证的模块状态跃迁”，不是“一个文件修改动作”

允许的 change 粒度：

- clarify-module-contract
- define-provider-interface
- stabilize-task-state-model
- add-verification-harness
- align-docs-with-current-boundary

不推荐的过细粒度：

- update-types-only
- rename-one-interface
- add-one-section-to-readme
- split-one-table
- create-one-empty-folder

## 6. Cross-module Boundary Rule

默认不规划当前模块之外的改动。

如果某个 change 需要宿主层、其他 package、上层 app、外部 adapter 配合：

- 当前模块内只规划 contract / boundary / expectation
- 外部改动写入 out_of_scope
- 如果外部依赖会阻塞当前模块，写入 depends_on 或 Open Questions / Risks
- 不要为了规避边界而设计无意义的中间层

## 7. Change Candidate Fields

每个候选变更必须包含：

- name: kebab-case
- goal: 一句话说明这个 change 要让模块达到什么状态
- scope: 当前模块内允许触及的范围
- out_of_scope: 明确排除什么
- why_now: 它解除哪个阻塞、降低哪个风险、或为哪个后续 change 铺路
- depends_on: 逻辑依赖、文档依赖、决策依赖或前置 change；没有则写 none
- touches: 预计涉及的当前模块内文件或目录；不确定时标记 `(tentative)`
- acceptance_criteria: 完成后应该能验证什么；不要写实现步骤
- openspec_timing: now | later

字段要求：

- depends_on 不只限于代码依赖，也可以是决策依赖
- acceptance_criteria 必须是状态验收，不是任务清单
- touches 不得包含当前模块外路径；如确实相关，写入 out_of_scope 或 Notes

## 8. Execution Order

给出推荐执行顺序。

排序原则：

1. 先解除 blocker
2. 先固化边界，再扩展能力
3. 先定义 contract，再实现 workflow
4. 先降低架构不确定性，再做功能性扩展
5. 高内聚变更优先合并，避免碎片化 spec
6. 如果一个 change 的价值依赖另一个 change，必须排在后面

说明每一步消除什么阻塞，或为后续打开什么路径。

## 9. STATUS.md Rewrite Format

将分析结果按下面固定结构写入 <MODULE_PATH>/STATUS.md。

不要自由发挥格式。
不要把 tentative 内容写成既定事实。
未确认内容必须使用 `(tentative)` 标记。

使用以下固定结构：

# <Module Name> Status

## 1. Confirmed Baseline

### Responsibilities
- ...

### Boundaries
- ...

### Non-goals
- ...

### Constraints
- ...

## 2. Open Questions / Risks
- [ ] ...
- [ ] ...

## 3. Planned Changes (Ordered)

### Change 1: <kebab-case-name>
- goal:
- scope:
- out_of_scope:
- why_now:
- depends_on:
- touches:
- acceptance_criteria:
- openspec_timing:

### Change 2: <kebab-case-name>
- goal:
- scope:
- out_of_scope:
- why_now:
- depends_on:
- touches:
- acceptance_criteria:
- openspec_timing:

至少 1 个，最多 5 个。

## 4. Execution Order
1. <change-name> → ...
2. <change-name> → ...

## 5. Suggested Next OpenSpec Change
- name:
- reason:
- expected_outcome:

## 6. Notes
- ...
- ...

## 10. Quality Bar

完成前自检：

- STATUS.md 是否只服务于后续 OpenSpec change，而不是重写 PRD？
- Confirmed Baseline 是否只包含有文档依据的内容？
- tentative 内容是否全部标记？
- Planned Changes 是否最多 5 个？
- 是否避免了过度拆分？
- 每个 change 是否高内聚、可验证、可单独转成 OpenSpec change？
- 是否只推荐了 1 个 Suggested Next OpenSpec Change？
- 是否没有创建 openspec/changes/*？
- 是否没有生成 proposal/design/spec/tasks？
- 是否没有修改源码？
- 是否没有规划跨模块 roadmap？

## 11. Final Response

完成后只输出：

1. 已重写的文件路径
2. 发现的关键 blocker 或风险摘要
3. Planned Changes 数量
4. Suggested Next OpenSpec Change
5. 如有未修改但建议后续修正的文档冲突，列出文件名和原因

不要在最终回复中重复粘贴完整 STATUS.md，除非用户明确要求。
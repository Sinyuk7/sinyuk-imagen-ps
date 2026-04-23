请完整阅读模块中的所有文档与必要目录上下文，重点包括：
- <MODULE_PATH>/AGENTS.md
- <MODULE_PATH>/PRD.md
- <MODULE_PATH>/README.md
- <MODULE_PATH>/SPEC.md
- <MODULE_PATH>/STATUS.md
- 其他md文档

本次任务是模块内规划：为该模块生成一份“顺序化的小变更计划”，并根据实际分析结果结构化重写 <MODULE_PATH>/STATUS.md，使其成为后续 OpenSpec changes 的输入文档。

请完成以下工作：

1. 分析当前模块基线
总结当前已经明确的：
- responsibilities
- boundaries
- non-goals
- constraints

2. 识别未决问题
识别当前的：
- open questions
- ambiguous areas
- risks
- 文档冲突点（如有）

3. 拆分后续变更
将后续推进拆分为一组有顺序的小变更（change candidates）。
每个 change 必须满足：
- 边界清晰
- 尽量可独立实现和验证
- 不跨出当前模块
- 不扩展到其他模块或宿主层
- 不直接展开 implementation tasks

4. 为每个候选变更提供：
- name（kebab-case）
- goal
- scope
- out_of_scope
- why_now
- depends_on
- touches
- openspec_timing: now | later

5. 给出推荐执行顺序
说明为什么这样排序，以及每一步在消除什么阻塞。

6. 重写 STATUS.md
将分析结果按下面的固定结构写入 <MODULE_PATH>/STATUS.md。
不要自由发挥格式；不要把 tentative 内容写成既定事实；对未确认内容使用 `(tentative)` 标记。

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
- openspec_timing:

### Change 2: <kebab-case-name>
- ...

（至少 1 个，最多 5 个）

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

额外要求：
- 不生成跨模块 roadmap
- 不改写 README.md / PRD.md，除非发现明显冲突且必须指出
- SPEC.md 仅允许必要的轻微修正
- STATUS.md 是本次任务唯一必须回写的文件
- 输出必须偏边界、决策、依赖，不要写空泛建议
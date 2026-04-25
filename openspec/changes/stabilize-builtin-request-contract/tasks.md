## Tasks

### Task 1: 收敛 builtin workflow 契约文档与代码注释
- **Goal**: 让 `provider-generate` 与 `provider-edit` 的稳定输入字段、输出 key 和 tentative 字段在文档与代码中一致。
- **Files**: `packages/workflows/src/builtins/provider-generate.ts`、`packages/workflows/src/builtins/provider-edit.ts`
- **Acceptance Criteria**:
  - 代码注释明确说明当前稳定字段与 tentative 字段
  - `outputKey` 保持为 `image`
  - 不引入新的运行时依赖

### Task 2: 显式标记 tentative 字段并更新 spec
- **Goal**: 在 change spec 中落实 design Decision 5，避免调用侧猜测 contract。
- **Files**: `openspec/changes/stabilize-builtin-request-contract/specs/builtin-workflow-contract/spec.md`
- **Acceptance Criteria**:
  - spec 中包含当前稳定字段清单
  - spec 中显式列出 tentative 字段（`maskAsset`、`output`、`providerOptions` 等）
  - 明确说明这些字段不在当前稳定范围内，后续 change 收敛

### Task 3: 细化 bridge 兼容场景的可判定条件
- **Goal**: 消除 `spec.md` 中 "matches" 的歧义，使 scenario 可被测试断言。
- **Files**: `openspec/changes/stabilize-builtin-request-contract/specs/builtin-workflow-contract/spec.md`
- **Acceptance Criteria**:
  - Provider bridge scenario 定义具体的字段存在性与值等价条件
  - 不扩大 scope 到完整集成测试

### Task 4: 补充 contract 验证测试
- **Goal**: 在 `packages/workflows/tests` 中增加对导出 shape、字段约束和最小 bridge 兼容路径的测试覆盖。
- **Files**: `packages/workflows/tests/builtins.test.ts`（或新增测试文件）
- **Acceptance Criteria**:
  - 测试验证 `provider-generate` / `provider-edit` 的 step input binding 包含预期字段
  - 测试验证 tentative 字段当前未出现在稳定 binding 中（或至少不声称已稳定）
  - 若条件允许，增加一条使用 mock provider bridge adapter 的最小 happy path 测试

### Task 5: 同步模块级 SPEC.md 与代码现实
- **Goal**: 消除 `packages/workflows/SPEC.md` 中关于 `src/index.ts` 仍为空的不准确描述。
- **Files**: `packages/workflows/SPEC.md`
- **Acceptance Criteria**:
  - SPEC.md 的“当前公开面”章节反映已导出最小 builtin workflows 的事实

### Task 6: 统一 STATUS.md 中 bridge 测试的范围描述
- **Goal**: 消除 Change 1 与 Change 2 在 bridge 验证上的 scope 重叠歧义。
- **Files**: `packages/workflows/STATUS.md`
- **Acceptance Criteria**:
  - Change 1 的验收标准明确包含“最小 bridge 兼容验证”
  - Change 2 聚焦在“更完整的跨包集成验证”，而非重复最小 happy path

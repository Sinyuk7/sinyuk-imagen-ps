## 1. 新建 `PRD.md`

- [ ] 1.1 创建 `packages/workflows/PRD.md`，包含以下章节：
  - 模块定位与目标用户
  - 职责边界（与 `core-engine`、`providers`、`app` 的分工）
  - builtin workflow 命名约定与当前清单（`provider-generate`、`provider-edit`）
  - 稳定 contract 定义（输入字段、输出 key、operation）
  - tentative 字段清单（`maskAsset`、`output`、`providerOptions`）及不承诺原因
  - 依赖方向与禁止事项
- [ ] 1.2 在 `PRD.md` 末尾注明版本锚点（以当前 change 完成时的代码现实为准）
- [ ] 1.3 自审 `PRD.md`，确保无 archive 内容直接复制，所有断言均可由当前 `src/` 与 `tests/` 验证

## 2. 更新 `README.md`

- [ ] 2.1 在“当前文档集”段落中新增 `PRD.md` 条目，说明其职责为“产品需求与权威基线”
- [ ] 2.2 明确声明“本模块不再依赖 archive PRD 作为权威来源”
- [ ] 2.3 检查 `README.md` 与 `PRD.md`、`SPEC.md` 的内容一致性，消除矛盾

## 3. 收敛 `SPEC.md`

- [ ] 3.1 保留当前稳定 contract 的精确描述，不删减已验证的 shape 信息
- [ ] 3.2 对仍 tentative 的字段，保持标注并指明其记录位置（`STATUS.md` 或 `PRD.md`）
- [ ] 3.3 若 `SPEC.md` 中存在与 `PRD.md` 的重复内容，以交叉引用替代复制，明确各自职责边界
- [ ] 3.4 检查 `SPEC.md` 中的“当前公开面”段落，确认与 `src/index.ts` 的实际导出一致

## 4. 同步 `STATUS.md`

- [ ] 4.1 关闭 §2 Open Questions 中 `PRD.md` 缺失项，标注解决方式（本 change 新建 `PRD.md`）
- [ ] 4.2 将 `Change 3: restore-authoritative-module-baseline` 标记为 `completed`，补充 outcome 摘要
- [ ] 4.3 如有文档与代码的残余偏差（如 `SPEC.md` 与源码不一致），显式记录到 §2 或新增 Notes
- [ ] 4.4 更新 §5 Suggested Next OpenSpec Change（若当前序列已全部完成，声明后续建议）

## 5. 验证与收尾

- [ ] 5.1 通读 `packages/workflows/` 下的四份文档（`README.md`、`SPEC.md`、`STATUS.md`、`PRD.md`、`AGENTS.md`），确认无内部矛盾
- [ ] 5.2 确认所有文档均可在不引用 archive 的情况下独立理解模块职责
- [ ] 5.3 确认零代码变更（`git diff` 仅涉及 `.md` 文件）
- [ ] 5.4 运行 `pnpm test --filter @imagen-ps/workflows` 确认测试未因文档变更而失败

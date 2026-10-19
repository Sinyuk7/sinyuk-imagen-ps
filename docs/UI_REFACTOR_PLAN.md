# Composer UI 重构计划

## 问题分析

### 1. 字体系统混乱
- **Model 选择器**：使用 `font-family-mono` + 特殊 font-weight（composer.ts:356, 540, 612）
- **其他参数选择器**：使用默认 mono 字体但没有特殊处理
- **菜单选项**：统一使用 mono 字体（composer.ts:339-356）
- **标签**：独立字号 9px（composer.ts:243）

**根本原因**：`.cmp-select-model` 和普通 `.cmp-chip-text` 走不同的样式路径，导致字体规则不一致。

### 2. 尺寸系统不统一
- **标签**：9px / 12px 行高（composer.ts:243）
- **选择器内容**：10px / 14px（composer.ts:357-358），紧凑模式降为 9px（responsive.ts:17）
- **Model 特殊处理**：9px / 13px + font-weight 600（composer.ts:561-563）
- **高度**：标签与选择器的最小高度不匹配

**根本原因**：字段组件（ComposerParameterField）只负责布局，不控制内部控件的视觉规格。

### 3. 布局系统分散
- **主参数行**：Prompt 38%、Ratio 24%、Size 24%（composer.ts:249-250）
- **高级字段**：48% + 4% 间距（composer.ts:260）
- **响应式**：三种模式各自覆盖比例（responsive.ts）

**根本原因**：布局规则直接写在 CSS 里，没有统一的字段容器规格。

### 4. 配置摘要层级不清
- 模型名与参数只有字号差异（10px vs 9px）
- 所有参数用点号串联，没有分组
- Quality 只有颜色区分（composer.ts:266）

### 5. Advanced 按钮图标文字布局
- CSS 声明了 flex-direction: row（composer.ts:256）
- 但实际渲染为上下布局
- Button 包装组件可能覆盖了布局

### 6. 测试 ID 语义混乱
- `generation-current-target-summary` 放在字段容器上（main-page.tsx:2057）
- 无障碍树把 GRSAI（实际模型值）识别为字段内容
- 与可见的 "Model" 标签冲突

## 重构方案

### Phase 1: 统一字体与尺寸系统

#### 1.1 定义字段规格 Token
```css
/* 字段统一规格 */
--cmp-field-label-size: 9px;
--cmp-field-label-line: 12px;
--cmp-field-control-size: 10px;
--cmp-field-control-line: 14px;
--cmp-field-control-height: 28px;
--cmp-field-control-padding-v: 4px;
--cmp-field-control-padding-h: 8px;
```

#### 1.2 移除 Model 选择器特殊处理
- 移除 `.cmp-select-model .cmp-chip-icon` 特殊字号/字重规则
- 统一所有选择器使用相同的基础字体规则
- 保留必要的布局差异（如宽度）

#### 1.3 更新 ComposerParameterField
```tsx
// 确保标签与控件视觉对齐
.cmp-parameter-field {
  display: flex;
  align-items: center; // 已有
  min-height: var(--cmp-field-control-height);
}

.cmp-parameter-label {
  font-size: var(--cmp-field-label-size);
  line-height: var(--cmp-field-label-line);
  // 垂直居中对齐控件
  align-self: center;
}

.cmp-parameter-control {
  font-size: var(--cmp-field-control-size);
  line-height: var(--cmp-field-control-line);
  min-height: var(--cmp-field-control-height);
}
```

### Phase 2: 统一布局网格

#### 2.1 标准化字段宽度分配
```css
/* 主参数行 - 使用 grid 替代 flex basis */
.cmp-secondary-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr; // Prompt 2份，Ratio/Size 各1份
  gap: 6px;
}

/* 高级字段 - 统一为两列网格 */
.cmp-advanced-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 4%;
}
```

#### 2.2 响应式调整
```css
/* 紧凑模式 */
.panel[data-panel-width-mode="compact"] .cmp-secondary-row {
  grid-template-columns: 1fr;
  grid-template-rows: auto auto auto;
}

.panel[data-panel-width-mode="compact"] .cmp-prompt-slot {
  grid-column: 1;
}

.panel[data-panel-width-mode="compact"] .cmp-ratio-slot,
.panel[data-panel-width-mode="compact"] .cmp-size-slot {
  grid-column: 1;
}
```

### Phase 3: 优化配置摘要

#### 3.1 建立视觉层级
```css
.cmp-summary-model {
  font-size: 11px; // 从 10px 提升
  font-weight: 600;
  color: var(--app-color-text-primary); // 从 secondary 提升
}

.cmp-summary-details {
  display: flex;
  gap: 8px; // 替代 margin-right
}

.cmp-summary-detail {
  font-size: 9px;
  color: var(--app-color-text-muted);
}

.cmp-summary-detail::before {
  content: '·';
  margin-right: 4px;
  opacity: 0.5; // 降低点号视觉权重
}

.cmp-summary-detail-quality {
  font-weight: 500; // 增加字重区分
  color: var(--app-color-text-secondary);
}
```

#### 3.2 可选：参数分组
```tsx
// 如果参数多，考虑分组显示
<span className="cmp-summary-group">
  <span className="cmp-summary-detail">ratio</span>
  <span className="cmp-summary-detail">size</span>
</span>
<span className="cmp-summary-group">
  <span className="cmp-summary-detail-quality">quality</span>
</span>
```

### Phase 4: 修复 Advanced 按钮布局

#### 4.1 检查 Button 组件实现
- 确认 Button 是否添加了内部 flex 容器
- 检查 Spectrum button 是否覆盖了外层样式

#### 4.2 确保图标文字横向排列
```css
.cmp-advanced-toggle {
  // 已有的 flex row 声明
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.cmp-advanced-toggle-content {
  display: inline-flex;
  flex-direction: row; // 明确指定
  align-items: center;
  gap: 7px; // 替代 margin-left
}
```

### Phase 5: 修复测试 ID 与无障碍语义

#### 5.1 调整测试 ID 位置
```tsx
// 从字段容器移动到实际控件
<ComposerParameterField label="Model" className="cmp-model-slot" title={...}>
  <ComposerSelect
    testId="generation-current-target-summary" // 移到这里
    // ...
  />
</ComposerParameterField>
```

#### 5.2 确保 aria-label 正确
- ComposerSelect 应该暴露正确的 value 给无障碍树
- 标签应该通过 aria-labelledby 关联

### Phase 6: 呼吸空间优化

#### 6.1 增加关键间距
```css
.cmp-toolbar {
  margin-top: 6px; // 从 4px 增加
  padding: 0;
}

.cmp-parameter-row {
  min-height: 32px; // 给字段更多垂直空间
}

.cmp-footer {
  padding: 8px 8px 10px; // 增加底部 padding
}
```

#### 6.2 调整 Composer 高度分配
```css
.composer {
  max-height: min(58%, 360px); // 从 330px 增加到 360px
}
```

## 实施顺序

1. **Phase 1** (最高优先级) - 修复字体混乱，立即可见改善
2. **Phase 5** - 修复测试 ID 语义问题，避免无障碍缺陷
3. **Phase 2** - 统一布局网格，改善对齐
4. **Phase 3** - 优化配置摘要，提升可读性
5. **Phase 4** - 修复 Advanced 按钮（需要先查看 Button 实现）
6. **Phase 6** - 呼吸空间优化（视觉调优）

## 风险与注意事项

1. **兼容性**：紧凑/常规/宽模式都需要测试
2. **Spectrum UXP 限制**：需要验证 grid 布局在 UXP 中的支持
3. **现有 harness**：需要更新相关测试用例
4. **无障碍**：确保 ARIA 标签正确关联

## 成功标准

- [ ] 所有参数选择器使用统一字体规则
- [ ] 标签与控件视觉对齐
- [ ] 配置摘要层级清晰
- [ ] Advanced 按钮图标文字横向排列
- [ ] 测试 ID 语义正确
- [ ] 三种面板模式布局一致
- [ ] 通过无障碍审计

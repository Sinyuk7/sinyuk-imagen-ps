# Composer UI 重构前后对比

## 样式规则对比

### 1. Model 选择器字体规则

| 样式属性 | 重构前 | 重构后 | 说明 |
|---------|--------|--------|------|
| **font-size** | 9px (特殊) | 10px (统一) | 使用 `--cmp-field-control-size` |
| **font-weight** | 600 (特殊) | 400 (统一) | 移除加粗，与其他参数一致 |
| **line-height** | 13px (特殊) | 14px (统一) | 使用 `--cmp-field-control-line` |
| **min-height** | 26px (特殊) | 28px (统一) | 使用 `--cmp-field-control-height` |
| **padding** | 3px 8px (特殊) | 4px 8px (统一) | 使用变量 |
| **图标尺寸** | 14px (特殊) | 16px (统一) | 与其他选择器一致 |

### 2. 字段标签与控件对齐

| 组件 | 重构前 | 重构后 | 改进 |
|-----|--------|--------|-----|
| `.cmp-parameter-field` | 无最小高度 | `min-height: 28px` | 确保高度一致 |
| `.cmp-parameter-label` | 无垂直对齐 | `align-self: center` | 标签居中对齐 |
| `.cmp-parameter-control` | 无最小高度 | `min-height: 28px` | 与字段高度匹配 |

### 3. 布局系统

#### 主参数行（Prompt, Ratio, Size）

| 属性 | 重构前 | 重构后 |
|-----|--------|--------|
| **布局方式** | Flex + flex-basis | Grid |
| **宽度分配** | `38% / 24% / 24%` | `2fr / 1fr / 1fr` |
| **间距控制** | `margin-right` + `:last-child` | `gap: 6px` |
| **响应式** | 三种 flex-basis 覆盖 | 改变 grid-template-columns |

**代码对比：**

```css
/* 重构前 */
.cmp-secondary-row { 
  display: flex; 
  flex-wrap: nowrap; 
}
.cmp-prompt-slot { flex: 1 1 38%; }
.cmp-ratio-slot { flex: 0 1 24%; }
.cmp-size-slot { flex: 0 1 24%; }

/* 紧凑模式覆盖 */
.compact .cmp-prompt-slot { flex: 1 1 100%; }
.compact .cmp-ratio-slot { flex: 1 1 34%; }
```

```css
/* 重构后 */
.cmp-secondary-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 6px;
}

/* 紧凑模式 */
.compact .cmp-secondary-row {
  grid-template-columns: 1fr;
  gap: 4px;
}
```

#### 高级字段行

| 属性 | 重构前 | 重构后 |
|-----|--------|--------|
| **布局方式** | Flex + flex-wrap | Grid |
| **宽度分配** | `flex: 0 1 48%` | `1fr 1fr` |
| **间距控制** | `margin-right: 4%` + `:nth-child(2n)` | `gap: 5px 4%` |

**代码对比：**

```css
/* 重构前 */
.cmp-advanced-row { flex-wrap: wrap; }
.cmp-advanced-field { 
  flex: 0 1 48%; 
  margin-right: 4%; 
  margin-bottom: 5px; 
}
.cmp-advanced-field:nth-child(2n) { margin-right: 0; }
```

```css
/* 重构后 */
.cmp-advanced-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px 4%;
}
.cmp-advanced-field { /* 不需要手动间距 */ }
```

### 4. 配置摘要层级

| 元素 | 重构前 | 重构后 | 改进 |
|-----|--------|--------|-----|
| **模型名颜色** | `text-secondary` | `text-primary` | 更突出 |
| **模型名字号** | 10px | 11px | 提升层级 |
| **模型名字重** | 600 | 600 | 保持 |
| **参数间距** | `margin-right: 5px` | `gap: 8px` | 更整洁 |
| **点号透明度** | 无 | `opacity: 0.5` | 降低视觉噪音 |
| **Quality 字重** | 无 | 500 | 突出重要参数 |

### 5. 间距与呼吸空间

| 区域 | 重构前 | 重构后 | 变化 |
|-----|--------|--------|------|
| **Toolbar 顶部** | 4px | 6px | +2px |
| **参数行最小高度** | 无 | 32px | 新增 |
| **Footer padding** | 6px 8px 8px | 8px 8px 10px | +2px/+2px |
| **Composer 最大高度** | 330px | 360px | +30px |

## CSS 变量系统

### 新增变量

```css
:root {
  --cmp-field-label-size: 9px;        /* 标签字号 */
  --cmp-field-label-line: 12px;       /* 标签行高 */
  --cmp-field-control-size: 10px;     /* 控件字号 */
  --cmp-field-control-line: 14px;     /* 控件行高 */
  --cmp-field-control-height: 28px;   /* 控件高度 */
  --cmp-field-control-padding-v: 4px; /* 控件垂直 padding */
  --cmp-field-control-padding-h: 8px; /* 控件水平 padding */
}
```

### 使用位置

| 变量 | 使用位置 |
|-----|---------|
| `--cmp-field-label-size` | `.cmp-parameter-label` |
| `--cmp-field-label-line` | `.cmp-parameter-label` |
| `--cmp-field-control-size` | `.cmp-parameter-control`, `.cmp-chip-icon`, `.cmp-chip-text`, `.cmp-chip-host` |
| `--cmp-field-control-line` | `.cmp-parameter-control`, `.cmp-chip-icon`, `.cmp-chip-text`, `.cmp-chip-host` |
| `--cmp-field-control-height` | `.cmp-parameter-field`, `.cmp-parameter-control`, `.cmp-chip-icon`, `.cmp-chip-text`, `.cmp-select-model .cmp-chip-host` |
| `--cmp-field-control-padding-v` | `.cmp-chip-icon`, `.cmp-chip-text` |
| `--cmp-field-control-padding-h` | `.cmp-chip-icon`, `.cmp-chip-text` |

## 测试 ID 语义修正

### 修改

```tsx
// 重构前：testId 在字段容器上
<ComposerParameterField 
  label="Model" 
  testId="generation-current-target-summary"  // ❌ 关联到容器
>
  <ComposerSelect testId="main-model-selector" />
</ComposerParameterField>

// 重构后：testId 在实际控件上
<ComposerParameterField label="Model">
  <ComposerSelect 
    testId="generation-current-target-summary"  // ✅ 关联到控件
  />
</ComposerParameterField>
```

### 无障碍影响

| 场景 | 重构前 | 重构后 |
|-----|--------|--------|
| **aria-label** | 容器被识别为字段，值为模型名 | 控件被识别为选择器，值为模型名 |
| **屏幕阅读器** | "GRSAI" 被读作字段内容 | "GRSAI" 被读作选择器当前值 |
| **测试定位** | 定位到整个字段容器 | 定位到可交互的选择器 |

## 移除的特殊规则

### Model 选择器不再需要的规则

```css
/* 全部移除 ❌ */
.cmp-select-model .cmp-chip-icon {
  min-height: 26px;
  padding: 3px 8px 3px 9px;
  font-size: 9px;
  font-weight: 600;
  line-height: 13px;
}

.cmp-select-model .cmp-chip-host {
  font-family: var(--app-font-family-mono);
  font-size: 9px;
  font-weight: 600;
  line-height: 13px;
}

.cmp-select-model .cmp-chip-leading-proxy-icon {
  width: 14px;
  min-width: 14px;
  height: 14px;
}

.cmp-select-model .cmp-chip-arrow-proxy-icon {
  width: 12px;
  min-width: 12px;
  min-height: 14px;
}

.cmp-select-model .cmp-chip-overlay-inner-icon {
  padding: 3px 8px 3px 9px;
}

.cmp-select-model .cmp-chip-overlay-value-icon {
  min-height: 14px;
  line-height: 14px;
}
```

### 保留的 Model 选择器规则

```css
/* 只保留必要的视觉差异 ✅ */
.cmp-select-model .cmp-chip-icon {
  border-color: color-mix(in srgb, var(--app-color-border-default) 46%, transparent);
}

.cmp-select-model .cmp-chip-leading-proxy-icon {
  color: var(--app-color-text-muted);
}

.cmp-select-model .cmp-chip-arrow-proxy-icon {
  color: color-mix(in srgb, var(--app-color-text-muted) 68%, transparent);
}

.cmp-select-model .cmp-chip-host[data-open="true"] .cmp-chip-leading-proxy-icon,
.cmp-select-model .cmp-chip-host[data-open="true"] .cmp-chip-arrow-proxy-icon {
  color: var(--app-color-accent-default);
}
```

## 代码量变化

| 指标 | 重构前 | 重构后 | 变化 |
|-----|--------|--------|------|
| **composer.ts 行数** | ~937 | ~900 | -37 行 |
| **特殊规则数量** | 15+ | 4 | -11 |
| **CSS 变量** | 0 | 7 | +7 |
| **Grid 布局** | 0 | 2 | +2 |

## 维护性改进

### 新增参数的成本

| 场景 | 重构前 | 重构后 |
|-----|--------|--------|
| **新增主参数** | 调整 3 个 flex-basis 比例 + 响应式覆盖 | 调整 grid-template-columns 比例 |
| **新增高级参数** | 确保 nth-child 规则正确 | 直接添加，Grid 自动排列 |
| **新增特殊选择器** | 需要添加字体/尺寸覆盖规则 | 使用统一规则，无需特殊处理 |

### 响应式维护

| 场景 | 重构前 | 重构后 |
|-----|--------|--------|
| **改变紧凑模式布局** | 修改 3 个 flex 规则 | 改变 grid-template-columns |
| **改变间距** | 修改多个 margin 规则 + 清除规则 | 改变 gap 值 |
| **调整尺寸** | 搜索所有相关规则 | 改变 CSS 变量 |

## 预期视觉效果

### 统一性改进
- ✅ 所有选择器使用相同字体大小和字重
- ✅ 所有标签垂直居中对齐控件
- ✅ 所有字段具有相同的最小高度
- ✅ 所有间距使用 Grid gap 统一控制

### 层级改进
- ✅ 配置摘要模型名更突出
- ✅ 参数之间的点号视觉权重降低
- ✅ Quality 参数通过字重突出显示

### 呼吸空间改进
- ✅ Toolbar 顶部间距增加
- ✅ 参数行高度更统一
- ✅ Footer 留白更充足
- ✅ 整体 Composer 高度增加

## 向后兼容性

### 不影响的功能
- ✅ 选择器交互行为
- ✅ 菜单弹出位置
- ✅ 键盘导航
- ✅ 数据绑定
- ✅ 测试覆盖（除了 testId 位置调整）

### 需要验证的兼容性
- ⚠️ UXP CSS Grid 支持（需在 Photoshop 中验证）
- ⚠️ CSS 变量在 UXP 中的支持
- ⚠️ Spectrum button 内部布局是否影响 Advanced 按钮

## 总结

### 核心改进
1. **从特殊化到统一化**：移除 Model 选择器的 11 条特殊规则
2. **从手动到系统化**：引入 7 个 CSS 变量统一控制尺寸
3. **从 Flex 到 Grid**：布局规则从分散到集中
4. **从平面到层级**：配置摘要建立清晰的视觉层级

### 设计原则
- 消除特殊情况
- 建立统一规则
- 提升可维护性
- 保持向后兼容

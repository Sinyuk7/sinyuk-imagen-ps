import { useEffect, useRef } from 'react';
import { Icon, type IconName } from './icons';
import { ActionButton, registerSpectrumControls } from '../primitives/spectrum-controls';

export interface ComposerSelectOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
}

export interface ComposerSelectProps {
  /** 下拉触发按钮的 aria-label / tooltip 文本。 */
  readonly label: string;
  /** 当前触发器上显示的简短文本。 */
  readonly value: string;
  /** 是否禁用（运行中状态）。 */
  readonly disabled?: boolean;
  /** 当前是否展开。 */
  readonly open: boolean;
  /** 展开状态变化回调。 */
  readonly onOpenChange: (open: boolean) => void;
  /** 候选项列表。 */
  readonly options: readonly ComposerSelectOption[];
  /** 当前选中的 id。 */
  readonly selectedId: string;
  /** 选择变化回调。 */
  readonly onSelect: (id: string) => void;
  /** 数据测试 ID 前缀。 */
  readonly testId?: string;
  /** 触发器 + 菜单容器类名，用于窄面板里的局部宽度约束。 */
  readonly containerClassName?: string;
  /** 触发器内额外前缀图标。 */
  readonly leadingIcon?: IconName;
  /** 触发器内额外后缀图标，默认 chevron-down。 */
  readonly trailingIcon?: IconName;
  /**
   * 下拉表面额外 CSS 类名。定位默认使用内联 style，但在复杂布局里需要额外
   * 微调时可通过 className 覆盖。
   */
  readonly menuClassName?: string;
}

type MenuElement = HTMLElement & {
  focus?: () => void;
};

type MenuItemElement = HTMLElement & {
  value?: string;
};

/**
 * Composer 底部控制行用的受控单选下拉原语。
 *
 * 触发器保持自定义 chip 外观（基于 `sp-action-button`），候选项列表仍由
 * `sp-menu` + `sp-menu-item` 承载。菜单外层改回普通定位容器，而不是直接依赖
 * `sp-popover` 的定位行为：Chrome 实测里 `sp-popover` 叠加到 panel 内的
 * positioned ancestor 后，会把菜单坐标再偏移一次并压缩可视区域，导致
 * 菜单跑出屏幕或整块表面异常。
 *
 * 选择反馈同时监听 `sp-menu` 的 `change` 事件（真实浏览器）与各
 * `sp-menu-item` 的 `click` 事件（测试 harness / 轻量环境兜底），两者
 * 都是幂等的：最终只调用 `onSelect` 一次有效 value。
 */
export function ComposerSelect({
  label,
  value,
  disabled,
  open,
  onOpenChange,
  options,
  selectedId,
  onSelect,
  testId,
  containerClassName,
  leadingIcon,
  trailingIcon = 'chevron-down',
  menuClassName,
}: ComposerSelectProps) {
  registerSpectrumControls();
  const menuRef = useRef<MenuElement | null>(null);

  useEffect(() => {
    if (open) {
      // 轻微延迟让 sp-menu 完成首次渲染后再聚焦，确保键盘导航可用。
      const timer = window.setTimeout(() => {
        menuRef.current?.focus?.();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  const handleTriggerClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (disabled) return;
    onOpenChange(!open);
  };

  const selectValue = (id: string) => {
    if (id) {
      onSelect(id);
    }
    onOpenChange(false);
  };

  const handleMenuChange = (event: Event) => {
    event.stopPropagation();
    const menu = event.currentTarget as MenuElement & { value?: string };
    selectValue(menu.value ?? '');
  };

  const handleItemClick = (event: Event) => {
    event.stopPropagation();
    const item = event.currentTarget as MenuItemElement;
    selectValue(item.value ?? item.getAttribute('value') ?? '');
  };

  const handleMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onOpenChange(false);
    }
  };

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu || !open) {
      return undefined;
    }
    const handleChange = (event: Event) => handleMenuChange(event);
    const handleKeyDown = (event: Event) => handleMenuKeyDown(event as unknown as KeyboardEvent);
    menu.addEventListener('change', handleChange);
    menu.addEventListener('keydown', handleKeyDown);

    // 在 happy-dom / 轻量测试环境里 sp-menu 内部选择链可能不完整，直接为每个
    // menu-item 添加 click 兜底，确保选择反馈可触发。真实浏览器里 menu change
    // 与 item click 都会触发，但两者幂等。
    const items = Array.from(menu.querySelectorAll<MenuItemElement>('sp-menu-item'));
    items.forEach((item) => item.addEventListener('click', handleItemClick));

    return () => {
      menu.removeEventListener('change', handleChange);
      menu.removeEventListener('keydown', handleKeyDown);
      items.forEach((item) => item.removeEventListener('click', handleItemClick));
    };
  }, [open, options]);

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <div className={containerClassName ?? 'cmp-select'}>
      <ActionButton
        data-testid={testId}
        className="cmp-chip"
        quiet
        selected={open}
        disabled={disabled}
        label={label}
        onClick={handleTriggerClick}
      >
        {leadingIcon ? <Icon name={leadingIcon} size={12} /> : <span className="cmp-dot" />}
        <span className="cmp-chip-value">{value}</span>
        <Icon name={trailingIcon} size={9} />
      </ActionButton>
      {open && (
        <div
          data-testid={testId ? `${testId}-popover` : undefined}
          className={menuClassName ?? 'cmp-select-menu'}
          onClick={handleMenuClick}
        >
          <sp-menu
            ref={menuRef}
            data-testid={testId ? `${testId}-menu` : undefined}
            selects="single"
            tabIndex={0}
          >
            {options.map((option) => (
              <sp-menu-item
                key={option.id}
                data-testid={testId ? `${testId}-option-${option.id}` : undefined}
                value={option.id}
                selected={option.id === selectedId}
              >
                {option.icon && <Icon name={option.icon} size={14} />}
                {option.label}
              </sp-menu-item>
            ))}
          </sp-menu>
        </div>
      )}
    </div>
  );
}

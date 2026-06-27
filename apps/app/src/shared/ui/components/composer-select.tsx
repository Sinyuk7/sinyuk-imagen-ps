import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

interface MenuPlacement {
  readonly direction: 'up' | 'down';
  readonly align: 'start' | 'end';
  readonly width: number;
  readonly maxHeight: number;
}

const DEBUG_COMPOSER_SELECT_QUERY = 'debugComposerSelect';
const PANEL_EDGE_PADDING = 12;
const MENU_GAP = 6;
const MENU_ITEM_ESTIMATE = 34;
const MENU_MAX_VISIBLE_ITEMS = 6;
const MENU_MIN_HEIGHT = 96;
const MENU_MIN_WIDTH = 132;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function shouldDebugComposerSelectLayout(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get(DEBUG_COMPOSER_SELECT_QUERY) === '1') {
    return true;
  }
  try {
    return window.localStorage.getItem(DEBUG_COMPOSER_SELECT_QUERY) === '1';
  } catch {
    return false;
  }
}

function resolveComposerSelectKind(testId?: string, label?: string): string {
  const hint = `${testId ?? ''} ${label ?? ''}`.toLowerCase();
  if (hint.includes('model')) return 'model';
  if (hint.includes('target')) return 'target';
  if (hint.includes('aspect')) return 'aspect';
  if (hint.includes('ratio')) return 'aspect';
  return testId ?? label ?? 'composer-select';
}

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
  const chipRef = useRef<HTMLElement | null>(null);
  const chipBodyRef = useRef<HTMLSpanElement | null>(null);
  const chipValueRef = useRef<HTMLSpanElement | null>(null);
  const chipArrowRef = useRef<HTMLSpanElement | null>(null);
  const [menuPlacement, setMenuPlacement] = useState<MenuPlacement>({
    direction: 'up',
    align: 'start',
    width: MENU_MIN_WIDTH,
    maxHeight: MENU_ITEM_ESTIMATE * MENU_MAX_VISIBLE_ITEMS,
  });

  const updateMenuPlacement = () => {
    const chip = chipRef.current;
    if (!chip) {
      return;
    }
    const panel = chip.closest('.panel') as HTMLElement | null;
    const panelRect = panel?.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    if (!panelRect || panelRect.width <= 0 || panelRect.height <= 0) {
      return;
    }

    const availableWidth = Math.max(0, panelRect.width - PANEL_EDGE_PADDING * 2);
    const minWidth = Math.min(MENU_MIN_WIDTH, availableWidth);
    const preferredWidth = Math.max(chipRect.width, MENU_MIN_WIDTH);
    const width = clampNumber(preferredWidth, minWidth, availableWidth);
    const spaceAbove = chipRect.top - panelRect.top - PANEL_EDGE_PADDING - MENU_GAP;
    const spaceBelow = panelRect.bottom - chipRect.bottom - PANEL_EDGE_PADDING - MENU_GAP;
    const direction = spaceBelow >= MENU_MIN_HEIGHT || spaceBelow >= spaceAbove ? 'down' : 'up';
    const verticalSpace = Math.max(direction === 'down' ? spaceBelow : spaceAbove, 48);
    const maxHeight = clampNumber(verticalSpace, 48, MENU_ITEM_ESTIMATE * MENU_MAX_VISIBLE_ITEMS);
    const spaceToRight = panelRect.right - chipRect.left - PANEL_EDGE_PADDING;
    const align = spaceToRight >= width ? 'start' : 'end';

    setMenuPlacement((current) => {
      if (
        current.direction === direction &&
        current.align === align &&
        Math.round(current.width) === Math.round(width) &&
        Math.round(current.maxHeight) === Math.round(maxHeight)
      ) {
        return current;
      }
      return { direction, align, width, maxHeight };
    });
  };

  useEffect(() => {
    if (open) {
      updateMenuPlacement();
      // 轻微延迟让 sp-menu 完成首次渲染后再聚焦，确保键盘导航可用。
      const timer = window.setTimeout(() => {
        menuRef.current?.focus?.();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    updateMenuPlacement();
    const chip = chipRef.current;
    const panel = chip?.closest('.panel') as HTMLElement | null;
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateMenuPlacement);
    if (resizeObserver) {
      if (chip) {
        resizeObserver.observe(chip);
      }
      if (panel) {
        resizeObserver.observe(panel);
      }
    }
    window.addEventListener('resize', updateMenuPlacement);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateMenuPlacement);
    };
  }, [open, options.length]);

  useLayoutEffect(() => {
    if (!shouldDebugComposerSelectLayout()) {
      return undefined;
    }

    const measureAndLog = () => {
      const chip = chipRef.current;
      const chipBody = chipBodyRef.current;
      const chipValue = chipValueRef.current;
      const chipArrow = chipArrowRef.current;
      if (!chip || !chipBody || !chipValue || !chipArrow) {
        return;
      }

      const chipRect = chip.getBoundingClientRect();
      const bodyRect = chipBody.getBoundingClientRect();
      const valueRect = chipValue.getBoundingClientRect();
      const arrowRect = chipArrow.getBoundingClientRect();
      const kind = resolveComposerSelectKind(testId, label);

      console.info(`[ComposerSelect:${kind}]`, {
        testId,
        label,
        value,
        selectedId,
        open,
        container: {
          width: Math.round(chipRect.width),
          height: Math.round(chipRect.height),
        },
        body: {
          left: Math.round(bodyRect.left - chipRect.left),
          right: Math.round(chipRect.right - bodyRect.right),
          top: Math.round(bodyRect.top - chipRect.top),
          bottom: Math.round(chipRect.bottom - bodyRect.bottom),
          width: Math.round(bodyRect.width),
          height: Math.round(bodyRect.height),
        },
        text: {
          left: Math.round(valueRect.left - chipRect.left),
          right: Math.round(chipRect.right - valueRect.right),
          top: Math.round(valueRect.top - chipRect.top),
          bottom: Math.round(chipRect.bottom - valueRect.bottom),
          width: Math.round(valueRect.width),
          height: Math.round(valueRect.height),
        },
        arrow: {
          left: Math.round(arrowRect.left - chipRect.left),
          right: Math.round(chipRect.right - arrowRect.right),
          top: Math.round(arrowRect.top - chipRect.top),
          bottom: Math.round(chipRect.bottom - arrowRect.bottom),
          width: Math.round(arrowRect.width),
          height: Math.round(arrowRect.height),
        },
      });
    };

    measureAndLog();

    const resizeObserver = new ResizeObserver(() => {
      measureAndLog();
    });
    const chip = chipRef.current;
    if (chip) {
      resizeObserver.observe(chip);
    }
    window.addEventListener('resize', measureAndLog);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', measureAndLog);
    };
  }, [label, open, selectedId, testId, value]);

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

  const placementClass = [
    menuClassName ?? 'cmp-select-menu',
    `cmp-select-menu-${menuPlacement.direction}`,
    `cmp-select-menu-${menuPlacement.align}`,
  ].join(' ');

  return (
    <div className={containerClassName ?? 'cmp-select'}>
      <ActionButton
        ref={chipRef}
        data-testid={testId}
        className="cmp-chip"
        quiet
        selected={open}
        disabled={disabled}
        label={label}
        onClick={handleTriggerClick}
      >
        <span ref={chipBodyRef} className="cmp-chip-body">
          {leadingIcon ? <Icon name={leadingIcon} size={10} className="cmp-chip-leading" /> : <span className="cmp-dot" />}
          <span ref={chipValueRef} className="cmp-chip-value">{value}</span>
        </span>
        <span ref={chipArrowRef} className="cmp-chip-arrow" aria-hidden="true">
          <Icon name={trailingIcon} size={12} className="cmp-chip-chevron" />
        </span>
      </ActionButton>
      {open && (
        <div
          data-testid={testId ? `${testId}-popover` : undefined}
          className={placementClass}
          style={{
            width: `${Math.round(menuPlacement.width)}px`,
            maxHeight: `${Math.round(menuPlacement.maxHeight)}px`,
          }}
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

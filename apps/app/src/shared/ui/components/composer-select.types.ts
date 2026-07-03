import type { IconName } from './icons';

export interface ComposerSelectOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly disabled?: boolean;
  readonly description?: string;
  readonly badges?: readonly string[];
}

interface ComposerSelectPropsBase {
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
  /** 触发按钮 id，用于外部 label 关联。 */
  readonly triggerId?: string;
  /** 触发器 + 菜单容器类名，用于窄面板里的局部宽度约束。 */
  readonly containerClassName?: string;
  /**
   * 下拉表面额外 CSS 类名。定位默认使用内联 style，但在复杂布局里需要额外
   * 微调时可通过 className 覆盖。
   */
  readonly menuClassName?: string;
}

export interface IconComposerSelectProps extends ComposerSelectPropsBase {
  readonly triggerKind: 'icon';
  /** 图标版触发器必填前缀图标。 */
  readonly leadingIcon: IconName;
}

export interface TextComposerSelectProps extends ComposerSelectPropsBase {
  readonly triggerKind: 'text';
}

export type ComposerSelectProps = IconComposerSelectProps | TextComposerSelectProps;

export interface ComposerSelectMenuPlacement {
  readonly direction: 'up' | 'down';
  readonly align: 'start' | 'end';
  readonly width: number;
  readonly maxHeight: number;
  readonly top?: number;
  readonly bottom?: number;
  readonly left?: number;
  readonly right?: number;
}

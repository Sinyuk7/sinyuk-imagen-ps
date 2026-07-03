import { ComposerSelect } from './composer-select';
import type { ComposerSelectOption, IconComposerSelectProps } from './composer-select';
import type { IconName } from './icons';

export interface IconSelectProps {
  readonly label: string;
  readonly value: string;
  readonly icon: IconName;
  readonly disabled?: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly options: readonly ComposerSelectOption[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly isOptionSelectable?: (id: string) => boolean;
  readonly testId?: string;
  readonly triggerId?: string;
  readonly containerClassName?: string;
  readonly menuClassName?: string;
}

/**
 * 带前缀图标的选择器触发器，只用于输入区这类 icon + text + arrow 轨道。
 */
export function IconSelect(props: IconSelectProps) {
  const nextProps: IconComposerSelectProps = {
    ...props,
    triggerKind: 'icon',
    leadingIcon: props.icon,
  };
  return <ComposerSelect {...nextProps} />;
}

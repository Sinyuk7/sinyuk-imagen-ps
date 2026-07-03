import { ComposerSelect } from './composer-select';
import type { ComposerSelectOption, TextComposerSelectProps } from './composer-select';

export interface TextSelectProps {
  readonly label: string;
  readonly value: string;
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
 * 纯文本选择器触发器，只用于设置页这类 text + arrow 轨道。
 */
export function TextSelect(props: TextSelectProps) {
  const nextProps: TextComposerSelectProps = {
    ...props,
    triggerKind: 'text',
  };
  return <ComposerSelect {...nextProps} />;
}

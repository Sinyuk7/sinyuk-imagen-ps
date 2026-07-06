import type { KeyboardEvent, MouseEvent, RefObject } from 'react';

export interface SelectTriggerButtonCommonProps {
  readonly label: string;
  readonly value: string;
  readonly selectedId: string;
  readonly disabled?: boolean;
  readonly open: boolean;
  readonly testId?: string;
  readonly triggerId?: string;
  readonly ariaDescribedBy?: string;
  readonly menuId?: string;
  readonly hostRef: RefObject<HTMLDivElement | null>;
  readonly chipRef: RefObject<HTMLButtonElement | null>;
  readonly chipBodyRef: RefObject<HTMLSpanElement | null>;
  readonly chipValueRef: RefObject<HTMLSpanElement | null>;
  readonly chipArrowRef: RefObject<HTMLSpanElement | null>;
  readonly onClick: (event: MouseEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

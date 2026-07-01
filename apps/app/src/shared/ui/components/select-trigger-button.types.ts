import type { KeyboardEvent, MouseEvent, RefObject } from 'react';

export interface SelectTriggerButtonCommonProps {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly open: boolean;
  readonly testId?: string;
  readonly triggerId?: string;
  readonly chipRef: RefObject<HTMLButtonElement | null>;
  readonly chipBodyRef: RefObject<HTMLSpanElement | null>;
  readonly chipValueRef: RefObject<HTMLSpanElement | null>;
  readonly chipArrowRef: RefObject<HTMLSpanElement | null>;
  readonly onClick: (event: MouseEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

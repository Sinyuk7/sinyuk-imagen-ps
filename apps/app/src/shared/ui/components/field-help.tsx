import type { ReactNode } from 'react';
import { HelpText } from '../primitives/native-controls';
import { Icon } from './icons';

export interface FieldHelpProps {
  readonly id?: string;
  readonly tone?: 'neutral' | 'negative';
  readonly children: ReactNode;
  readonly className?: string;
  readonly testId?: string;
}

function classNames(...parts: Array<string | undefined | false>): string | undefined {
  const value = parts.filter(Boolean).join(' ');
  return value || undefined;
}

export function FieldHelp({
  id,
  tone = 'neutral',
  children,
  className,
  testId,
}: FieldHelpProps) {
  const iconName = tone === 'negative' ? 'error' : 'info';
  return (
    <div
      id={id}
      className={classNames('field-help', className)}
      data-tone={tone}
      data-testid={testId}
    >
      <span className="field-help-icon" aria-hidden="true">
        <Icon name={iconName} size={14} />
      </span>
      <HelpText className="field-help-text" variant={tone === 'negative' ? 'negative' : undefined}>
        {children}
      </HelpText>
    </div>
  );
}

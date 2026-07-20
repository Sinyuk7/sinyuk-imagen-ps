import { type KeyboardEvent, type ReactNode } from 'react';
import { MotionContent } from './motion-ui';
import { Icon } from './icons';

interface SettingsListRowProps {
  readonly testId?: string;
  readonly watch?: string;
  readonly title: string;
  readonly leading: ReactNode;
  readonly meta?: ReactNode;
  readonly end?: ReactNode;
  readonly special?: boolean;
  readonly disabled?: boolean;
  readonly onOpen: () => void;
}

function onRowKeyDown(event: KeyboardEvent<HTMLDivElement>, onOpen: () => void, disabled: boolean): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  event.preventDefault();
  if (!disabled) {
    onOpen();
  }
}

export function SettingsListRow({
  testId,
  watch,
  title,
  leading,
  meta,
  end,
  special = false,
  disabled = false,
  onOpen,
}: SettingsListRowProps) {
  const row = (
    <div
      data-testid={testId}
      className={`prov-row settings-provider-row${special ? ' is-special' : ''}${disabled ? ' is-disabled' : ''}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onOpen}
      onKeyDown={(event) => onRowKeyDown(event, onOpen, disabled)}
    >
      <div className="prov-leading">{leading}</div>
      <div className="prov-content">
        <div className="prov-title-row">
          <span className="prov-name">{title}</span>
        </div>
        {meta ? (
          <div className="prov-meta-row">{meta}</div>
        ) : null}
      </div>
      <div className="prov-end">
        {end}
        {!disabled ? <div className="prov-trail"><Icon name="chevron-right" /></div> : null}
      </div>
    </div>
  );

  return watch ? <MotionContent watch={watch}>{row}</MotionContent> : row;
}

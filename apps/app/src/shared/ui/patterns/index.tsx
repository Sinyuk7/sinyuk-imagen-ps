import { forwardRef, type ReactNode } from 'react';
import { MotionPageFrame } from '../components/motion-ui';
import { Icon } from '../components/icons';
import { StatusNotice, type StatusTone } from '../components/status-notice';
import { IconButton } from '../primitives/icon-button';

export function PageFrame({ watch, children }: { readonly watch: string; readonly children: ReactNode }) {
  return <MotionPageFrame watch={watch}><section className="ui-page-frame">{children}</section></MotionPageFrame>;
}

export function PageHeader({ title, center, backLabel, backTestId, back, onBack, right, sideClassName, rightClassName, children }: { readonly title: ReactNode; readonly center?: ReactNode; readonly backLabel?: string; readonly backTestId?: string; readonly back?: ReactNode; readonly onBack?: () => void; readonly right?: ReactNode; readonly sideClassName?: string; readonly rightClassName?: string; readonly children?: ReactNode }) {
  return <header className="ui-page-header">
    <div className={sideClassName ? `ui-page-header-start ${sideClassName}` : 'ui-page-header-start'}>{back ?? (onBack ? <IconButton data-testid={backTestId} className="ui-page-header-back" quiet icon={<Icon name="chevron-left" />} tooltip={backLabel ?? 'Back'} onClick={onBack} /> : null)}</div>
    <div className="ui-page-header-title">{center ?? <h1>{title}</h1>}{children}</div>
    <div className={rightClassName ? `ui-page-header-end ${rightClassName}` : 'ui-page-header-end'}>{right}</div>
  </header>;
}

export const PageScroll = forwardRef<HTMLDivElement, { readonly className?: string; readonly children: ReactNode }>(function PageScroll({ className, children }, ref) {
  return <main ref={ref} className={className ? `scroll ui-page-scroll ${className}` : 'scroll ui-page-scroll'} data-primary-scroll="true">{children}</main>;
});

export interface SegmentedTab { readonly id: string; readonly label: string; readonly disabled?: boolean; readonly testId?: string; }
export function SegmentedTabs({ tabs, selectedId, onSelect, className }: { readonly tabs: readonly SegmentedTab[]; readonly selectedId: string; readonly onSelect: (id: string) => void; readonly className?: string }) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = tabs.filter((tab) => !tab.disabled);
    const current = enabled.findIndex((tab) => tab.id === selectedId);
    const destination = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : event.key === 'ArrowRight' ? (current + 1) % enabled.length : event.key === 'ArrowLeft' ? (current - 1 + enabled.length) % enabled.length : -1;
    if (destination < 0) return;
    event.preventDefault();
    const next = enabled[destination];
    if (!next) return;
    onSelect(next.id);
    (event.currentTarget.querySelector(`[data-tab-id="${next.id}"]`) as HTMLButtonElement | null)?.focus();
  };
  return <div className={className ? `ui-segmented-tabs ${className}` : 'ui-segmented-tabs'} role="tablist" onKeyDown={onKeyDown}>{tabs.map((tab, index) => <button key={tab.id} data-testid={tab.testId} data-tab-id={tab.id} type="button" role="tab" aria-selected={tab.id === selectedId} disabled={tab.disabled} className={index === 0 ? 'ui-segmented-tab' : 'ui-segmented-tab ui-segmented-tab-spaced'} onClick={() => onSelect(tab.id)}>{tab.label}</button>)}</div>;
}

export function SettingsListSection({ title, testId, children }: { readonly title?: ReactNode; readonly testId?: string; readonly children: ReactNode }) {
  return <section className="ui-settings-list-section" data-testid={testId}>{title ? <h2>{title}</h2> : null}<div className="ui-settings-list">{children}</div></section>;
}
export function SettingsFormSection({ title, testId, children }: { readonly title?: ReactNode; readonly testId?: string; readonly children: ReactNode }) {
  return <section className="section ui-settings-form-section" data-testid={testId}>{title ? <h2>{title}</h2> : null}{children}</section>;
}
export function FieldGroup({ label, htmlFor, help, children }: { readonly label: string; readonly htmlFor?: string; readonly help?: ReactNode; readonly children: ReactNode }) {
  return <div className="ui-field-group"><label className="ui-field-group-label" htmlFor={htmlFor}>{label}</label>{children}{help ? <span className="ui-field-group-help">{help}</span> : null}</div>;
}
export function PageState({ tone, message, action, className, variant = 'default' }: { readonly tone: StatusTone; readonly message: string; readonly action?: ReactNode; readonly className?: string; readonly variant?: 'default' | 'empty' }) {
  const classes = ['ui-page-state', variant === 'empty' ? 'ui-page-state-empty' : undefined, className].filter(Boolean).join(' ');
  return <div className={classes} data-variant={variant}><StatusNotice tone={tone} message={message} />{action}</div>;
}
export function FooterActions({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return <footer className={className ? `ui-footer-actions ${className}` : 'ui-footer-actions'}>{children}</footer>;
}

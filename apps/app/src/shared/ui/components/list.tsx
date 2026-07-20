import { type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from './icons';
import { Button } from '../primitives/native-controls';

type ListItemTone = 'default' | 'muted' | 'danger';
type ListStateKind = 'loading' | 'empty' | 'error';

interface ListProps {
  /** 列表内的领域行或状态行；不拥有数据与 lifecycle。 */
  readonly children: ReactNode;
  /** 额外类名。 */
  readonly className?: string;
  /** 列表可访问名称。 */
  readonly 'aria-label'?: string;
}

interface ListItemShellProps {
  /** leading 轨道内容。 */
  readonly icon?: ReactNode;
  /** 主标题。 */
  readonly title: ReactNode;
  /** 标题下方的辅助说明。 */
  readonly description?: ReactNode;
  /** trailing 轨道内容。 */
  readonly trailing?: ReactNode;
  /** 行的视觉语气。 */
  readonly tone?: ListItemTone;
  /** 禁用时阻断整行激活，并移出 tab 顺序。 */
  readonly disabled?: boolean;
  /** 领域行的可选整行激活；状态行不得使用。 */
  readonly onPress?: () => void;
  /** 额外类名。 */
  readonly className?: string;
  /** 测试或调用方标识。 */
  readonly 'data-testid'?: string;
}

interface ListStateItemProps {
  /** 列表状态种类。 */
  readonly kind: ListStateKind;
  /** 状态标题。 */
  readonly title?: string;
  /** 状态辅助说明。 */
  readonly description?: string;
  /** 替代默认状态图标的 leading 内容。 */
  readonly icon?: ReactNode;
  /** 仅在 trailing 轨道显示的直接操作。 */
  readonly action?: {
    readonly label: string;
    readonly onPress: () => void;
    readonly disabled?: boolean;
  };
  /** 额外类名。 */
  readonly className?: string;
  /** 测试或调用方标识。 */
  readonly 'data-testid'?: string;
}

function classNames(...parts: Array<string | undefined | false>): string | undefined {
  const value = parts.filter(Boolean).join(' ');
  return value || undefined;
}

function onRowKeyDown(event: KeyboardEvent<HTMLDivElement>, onPress: (() => void) | undefined, disabled: boolean): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  event.preventDefault();
  if (!disabled) {
    onPress?.();
  }
}

function defaultStateIcon(kind: ListStateKind): ReactNode {
  if (kind === 'loading') {
    return <Icon name="spinner" className="ui-list-state-item-spinner" />;
  }
  return <Icon name={kind === 'error' ? 'error' : 'empty'} />;
}

function defaultStateTitle(kind: ListStateKind): string {
  if (kind === 'loading') return 'Loading';
  if (kind === 'error') return 'Unable to load';
  return 'No items';
}

/** 页面独立列表的纯布局容器。 */
export function List({ children, className, 'aria-label': ariaLabel }: ListProps) {
  return <div className={classNames('ui-list', className)} aria-label={ariaLabel}>{children}</div>;
}

/** 领域行与状态行共用的纯渲染几何 shell。 */
export function ListItemShell({
  icon,
  title,
  description,
  trailing,
  tone = 'default',
  disabled = false,
  onPress,
  className,
  'data-testid': testId,
}: ListItemShellProps) {
  const interactive = Boolean(onPress);
  return (
    <div
      aria-disabled={disabled || undefined}
      className={classNames(
        'ui-list-item-shell',
        `ui-list-item-shell--${tone}`,
        interactive && 'ui-list-item-shell--interactive',
        disabled && 'ui-list-item-shell--disabled',
        className,
      )}
      data-testid={testId}
      onClick={interactive && !disabled ? onPress : undefined}
      onKeyDown={interactive ? (event) => onRowKeyDown(event, onPress, disabled) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? (disabled ? -1 : 0) : undefined}
    >
      {icon ? <div className="ui-list-item-leading">{icon}</div> : null}
      <div className="ui-list-item-content">
        <div className="ui-list-item-title">{title}</div>
        {description ? <div className="ui-list-item-description">{description}</div> : null}
      </div>
      {trailing ? <div className="ui-list-item-trailing">{trailing}</div> : null}
    </div>
  );
}

/** 不拥有请求或行导航的列表状态行。 */
export function ListStateItem({
  kind,
  title,
  description,
  icon,
  action,
  className,
  'data-testid': testId,
}: ListStateItemProps) {
  const tone: ListItemTone = kind === 'error' ? 'danger' : kind === 'empty' ? 'muted' : 'default';
  return (
    <ListItemShell
      className={classNames('ui-list-state-item', `ui-list-state-item--${kind}`, className)}
      data-testid={testId}
      description={description}
      disabled={!action}
      icon={icon ?? defaultStateIcon(kind)}
      title={title ?? defaultStateTitle(kind)}
      tone={tone}
      trailing={action ? <Button disabled={action.disabled} onClick={action.onPress}>{action.label}</Button> : undefined}
    />
  );
}

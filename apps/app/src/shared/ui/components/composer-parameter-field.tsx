import type { ReactNode } from 'react';

/** Composer 参数字段统一承载纯文本标签与可组合控件。 */
export function ComposerParameterField({
  label,
  children,
  className = '',
  testId,
  title,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly testId?: string;
  readonly title?: string;
}) {
  return (
    <div className={['cmp-parameter-field', className].filter(Boolean).join(' ')} data-testid={testId} title={title}>
      <span className="cmp-parameter-label">{label}</span>
      <div className="cmp-parameter-control">{children}</div>
    </div>
  );
}

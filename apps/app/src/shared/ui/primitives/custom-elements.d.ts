import type { DetailedHTMLProps, HTMLAttributes, ReactNode } from 'react';

type SpectrumElementProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  readonly class?: string;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly type?: string;
  readonly value?: string;
  readonly variant?: string;
  readonly size?: string;
  readonly for?: string;
  readonly required?: boolean;
  readonly selected?: boolean;
  readonly quiet?: boolean;
  readonly emphasized?: boolean;
  readonly toggles?: boolean;
  readonly placement?: string;
  readonly 'self-managed'?: boolean;
  readonly selects?: string;
  readonly open?: boolean;
  readonly selects?: string;
  readonly timeout?: number;
  readonly vertical?: boolean;
  readonly color?: string;
  readonly scale?: string;
  readonly children?: ReactNode;
};

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'sp-theme': SpectrumElementProps;
      'sp-button': SpectrumElementProps;
      'sp-textfield': SpectrumElementProps;
      'sp-checkbox': SpectrumElementProps;
      'sp-action-button': SpectrumElementProps;
      'sp-field-label': SpectrumElementProps;
      'sp-help-text': SpectrumElementProps;
      'sp-tag': SpectrumElementProps;
      'sp-tags': SpectrumElementProps;
      'sp-divider': SpectrumElementProps;
      'sp-tooltip': SpectrumElementProps;
      'sp-toast': SpectrumElementProps;
      'sp-menu': SpectrumElementProps;
      'sp-menu-item': SpectrumElementProps;
      'sp-popover': SpectrumElementProps;
      [key: `sp-icon-${string}`]: SpectrumElementProps;
    }
  }
}

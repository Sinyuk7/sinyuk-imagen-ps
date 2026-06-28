import type { DetailedHTMLProps, HTMLAttributes, ReactNode } from 'react';

type SpectrumElementProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  readonly class?: string;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly type?: string;
  readonly value?: string | number;
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
      'sp-action-bar': SpectrumElementProps;
      'sp-action-group': SpectrumElementProps;
      'sp-button': SpectrumElementProps;
      'sp-asset': SpectrumElementProps;
      'sp-banner': SpectrumElementProps;
      'sp-button-group': SpectrumElementProps;
      'sp-card': SpectrumElementProps;
      'sp-textfield': SpectrumElementProps;
      'sp-checkbox': SpectrumElementProps;
      'sp-action-button': SpectrumElementProps;
      'sp-dropdown': SpectrumElementProps;
      'sp-picker-button': SpectrumElementProps;
      'sp-dialog': SpectrumElementProps;
      'sp-field-label': SpectrumElementProps;
      'sp-field-group': SpectrumElementProps;
      'sp-help-text': SpectrumElementProps;
      'sp-illustrated-message': SpectrumElementProps;
      'sp-link': SpectrumElementProps;
      'sp-tag': SpectrumElementProps;
      'sp-tags': SpectrumElementProps;
      'sp-divider': SpectrumElementProps;
      'sp-switch': SpectrumElementProps;
      'sp-meter': SpectrumElementProps;
      'sp-number-field': SpectrumElementProps;
      'sp-overlay': SpectrumElementProps;
      'sp-tooltip': SpectrumElementProps;
      'sp-quick-actions': SpectrumElementProps;
      'sp-radio': SpectrumElementProps;
      'sp-search': SpectrumElementProps;
      'sp-toast': SpectrumElementProps;
      'sp-menu': SpectrumElementProps;
      'sp-menu-item': SpectrumElementProps;
      'sp-popover': SpectrumElementProps;
      'sp-sidenav': SpectrumElementProps;
      'sp-swatch': SpectrumElementProps;
      'sp-table': SpectrumElementProps;
      [key: `sp-icon-${string}`]: SpectrumElementProps;
    }
  }
}

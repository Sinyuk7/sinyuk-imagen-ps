import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type SpectrumElementProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  class?: string;
  'data-testid'?: string;
  disabled?: boolean;
  invalid?: boolean;
  pending?: boolean;
  quiet?: boolean;
  selected?: boolean;
  size?: 's' | 'm' | 'l' | 'xl';
  variant?: string;
};

type SpectrumButtonProps = SpectrumElementProps & {
  active?: boolean;
  emphasized?: boolean;
  holdAffordance?: boolean;
  label?: string;
  quiet?: boolean;
  selected?: boolean;
  treatment?: 'fill' | 'outline';
  toggles?: boolean;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'accent' | 'cta' | 'negative' | 'overBackground' | 'primary' | 'secondary';
};

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'sp-action-bar': SpectrumElementProps;
      'sp-action-button': SpectrumButtonProps;
      'sp-action-group': SpectrumElementProps;
      'sp-asset': SpectrumElementProps;
      'sp-avatar': SpectrumElementProps;
      'sp-banner': SpectrumElementProps & { corner?: boolean; type?: 'info' | 'error' };
      'sp-button': SpectrumButtonProps;
      'sp-button-group': SpectrumElementProps;
      'sp-card': SpectrumElementProps;
      'sp-checkbox': SpectrumElementProps & {
        checked?: boolean;
        emphasized?: boolean;
        indeterminate?: boolean;
        name?: string;
        readonly?: boolean;
        value?: string;
      };
      'sp-dialog': SpectrumElementProps;
      'sp-dialog-base': SpectrumElementProps;
      'sp-dialog-wrapper': SpectrumElementProps;
      'sp-divider': SpectrumElementProps & { vertical?: boolean };
      'sp-field-group': SpectrumElementProps;
      'sp-field-label': SpectrumElementProps & {
        disabled?: boolean;
        for?: string;
        required?: boolean;
        sideAligned?: string;
      };
      'sp-help-text': SpectrumElementProps & { icon?: boolean; variant?: 'negative' | 'neutral' };
      'sp-illustrated-message': SpectrumElementProps;
      'sp-link': SpectrumElementProps & { href?: string; target?: string };
      'sp-menu': SpectrumElementProps & { label?: string; selects?: 'single' | 'multiple' | 'inherit'; value?: string };
      'sp-menu-divider': SpectrumElementProps;
      'sp-menu-group': SpectrumElementProps;
      'sp-menu-item': SpectrumElementProps & { selected?: boolean; value?: string };
      'sp-meter': SpectrumElementProps & { max?: number; min?: number; progress?: number; value?: number };
      'sp-number-field': SpectrumElementProps & { label?: string; max?: number; min?: number; value?: number | string };
      'sp-overlay': SpectrumElementProps & {
        offset?: number | number[];
        open?: boolean;
        placement?: string;
        receivesFocus?: 'auto' | 'false' | 'true';
        tipPadding?: number;
        trigger?: string;
        triggerInteraction?: 'click' | 'hover' | 'longpress';
        triggerElement?: HTMLElement | null;
        type?: 'auto' | 'hint' | 'modal' | 'page';
      };
      'sp-picker-button': SpectrumButtonProps & { invalid?: boolean; position?: 'left' | 'right' };
      'sp-popover': SpectrumElementProps & { dialog?: boolean; open?: boolean; placement?: string; tip?: boolean };
      'sp-quick-actions': SpectrumElementProps;
      'sp-radio': SpectrumElementProps & { checked?: boolean; value?: string };
      'sp-radio-group': SpectrumElementProps & { selected?: string };
      'sp-search': SpectrumElementProps & { action?: string; label?: string; method?: string; placeholder?: string; value?: string };
      'sp-sidenav': SpectrumElementProps;
      'sp-sidenav-heading': SpectrumElementProps;
      'sp-sidenav-item': SpectrumElementProps & { selected?: boolean; value?: string };
      'sp-swatch': SpectrumElementProps & { color?: string; selected?: boolean };
      'sp-swatch-group': SpectrumElementProps;
      'sp-switch': SpectrumElementProps & { checked?: boolean };
      'sp-table': SpectrumElementProps;
      'sp-table-body': SpectrumElementProps;
      'sp-table-cell': SpectrumElementProps;
      'sp-table-checkbox-cell': SpectrumElementProps;
      'sp-table-head': SpectrumElementProps;
      'sp-table-head-cell': SpectrumElementProps;
      'sp-table-row': SpectrumElementProps & { selected?: boolean };
      'sp-tag': SpectrumElementProps;
      'sp-tags': SpectrumElementProps;
      'sp-textfield': SpectrumElementProps & {
        autocomplete?: string;
        grows?: boolean;
        label?: string;
        maxlength?: number;
        minlength?: number;
        multiline?: boolean;
        name?: string;
        pattern?: string;
        placeholder?: string;
        readonly?: boolean;
        required?: boolean;
        rows?: number;
        type?: 'text' | 'url' | 'tel' | 'email' | 'password';
        valid?: boolean;
        value?: string;
      };
      'sp-textarea': SpectrumElementProps & {
        maxlength?: number;
        minlength?: number;
        placeholder?: string;
        readonly?: boolean;
        required?: boolean;
        rows?: number;
        value?: string;
      };
      'sp-theme': SpectrumElementProps & { color?: 'light' | 'dark' | 'lightest' | 'darkest'; scale?: 'medium' | 'large'; theme?: 'spectrum' | 'express' };
      'sp-toast': SpectrumElementProps & { open?: boolean; timeout?: number; variant?: 'negative' | 'positive' | 'info' | 'error' | 'warning' };
      'sp-tooltip': SpectrumElementProps & { open?: boolean; placement?: string; variant?: string };
    }
  }
}

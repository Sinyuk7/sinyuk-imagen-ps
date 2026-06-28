import {
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { Button as SpectrumButton } from '@spectrum-web-components/button';
import { ActionBar as SpectrumActionBar } from '@spectrum-web-components/action-bar';
import { ActionGroup as SpectrumActionGroup } from '@spectrum-web-components/action-group';
import { Checkbox as SpectrumCheckbox } from '@spectrum-web-components/checkbox';
import { Asset as SpectrumAsset } from '@spectrum-web-components/asset';
import { Banner as SpectrumBanner } from '@spectrum-web-components/banner';
import { Textfield as SpectrumTextfield } from '@spectrum-web-components/textfield';
import { ActionButton as SpectrumActionButton } from '@spectrum-web-components/action-button';
import { PickerButton as SpectrumPickerButton } from '@spectrum-web-components/picker-button';
import { ButtonGroup as SpectrumButtonGroup } from '@spectrum-web-components/button-group';
import { Card as SpectrumCard } from '@spectrum-web-components/card';
import { FieldLabel as SpectrumFieldLabel } from '@spectrum-web-components/field-label';
import { HelpText as SpectrumHelpText } from '@spectrum-web-components/help-text';
import { Dialog as SpectrumDialog } from '@spectrum-web-components/dialog';
import { FieldGroup as SpectrumFieldGroup } from '@spectrum-web-components/field-group';
import { IllustratedMessage as SpectrumIllustratedMessage } from '@spectrum-web-components/illustrated-message';
import { Link as SpectrumLink } from '@spectrum-web-components/link';
import { Tag as SpectrumTag, Tags as SpectrumTags } from '@spectrum-web-components/tags';
import { Divider as SpectrumDivider } from '@spectrum-web-components/divider';
import { Switch as SpectrumSwitch } from '@spectrum-web-components/switch';
import { Meter as SpectrumMeter } from '@spectrum-web-components/meter';
import { NumberField as SpectrumNumberField } from '@spectrum-web-components/number-field';
import { Overlay as SpectrumOverlay } from '@spectrum-web-components/overlay';
import { Tooltip as SpectrumTooltip } from '@spectrum-web-components/tooltip';
import { QuickActions as SpectrumQuickActions } from '@spectrum-web-components/quick-actions';
import { Radio as SpectrumRadio } from '@spectrum-web-components/radio';
import { Search as SpectrumSearch } from '@spectrum-web-components/search';
import { Toast as SpectrumToast } from '@spectrum-web-components/toast';
import { Menu as SpectrumMenu, MenuItem as SpectrumMenuItem } from '@spectrum-web-components/menu';
import { Popover as SpectrumPopover } from '@spectrum-web-components/popover';
import { SideNav as SpectrumSidenav } from '@spectrum-web-components/sidenav';
import { Swatch as SpectrumSwatch } from '@spectrum-web-components/swatch';
import { Table as SpectrumTable } from '@spectrum-web-components/table';

type SpectrumButtonVariant = 'accent' | 'primary' | 'secondary' | 'negative';
type SpectrumTextFieldType = 'text' | 'password' | 'url' | 'search';
type TooltipPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'right'
  | 'right-start'
  | 'right-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end';

type SpectrumElement = HTMLElement & {
  disabled?: boolean;
  checked?: boolean;
  value?: string;
  type?: string;
  placeholder?: string;
  selected?: boolean;
};

interface ButtonProps extends Omit<HTMLAttributes<HTMLElement>, 'onInput' | 'onChange'> {
  readonly variant?: SpectrumButtonVariant;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

interface TextFieldProps extends Omit<HTMLAttributes<HTMLElement>, 'defaultValue' | 'onInput' | 'onChange'> {
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly type?: SpectrumTextFieldType;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}

interface CheckboxProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onInput' | 'onChange'> {
  readonly checked: boolean;
  readonly onChecked: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly children?: ReactNode;
}

interface ActionButtonProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange' | 'ref'> {
  readonly quiet?: boolean;
  readonly emphasized?: boolean;
  readonly selected?: boolean;
  readonly toggles?: boolean;
  readonly disabled?: boolean;
  /** 提供时渲染 self-managed <sp-tooltip>，作为该按钮的 hover/focus 提示。 */
  readonly label?: string;
  readonly placement?: TooltipPlacement;
  readonly className?: string;
  readonly children?: ReactNode;
}

interface FieldLabelProps {
  readonly htmlFor: string;
  readonly children: ReactNode;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

interface HelpTextProps {
  readonly children: ReactNode;
  readonly variant?: 'negative';
  readonly className?: string;
}

interface TagProps {
  readonly children: ReactNode;
  readonly className?: string;
}

interface DividerProps {
  readonly className?: string;
  readonly vertical?: boolean;
}

interface ActionBarProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface ActionGroupProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface AssetProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface BannerProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface ButtonGroupProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface DialogProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly open?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
}

interface FieldGroupProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface IllustratedMessageProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface LinkProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly href?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

interface MeterProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly value?: number;
  readonly children?: ReactNode;
  readonly className?: string;
}

interface NumberFieldProps extends Omit<HTMLAttributes<HTMLElement>, 'onInput' | 'onChange'> {
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

interface OverlayProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly open?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
}

interface QuickActionsProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface RadioProps extends Omit<HTMLAttributes<HTMLElement>, 'onInput' | 'onChange'> {
  readonly checked: boolean;
  readonly onChecked: (checked: boolean) => void;
  readonly children?: ReactNode;
  readonly className?: string;
}

interface SearchProps extends Omit<HTMLAttributes<HTMLElement>, 'onInput' | 'onChange'> {
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

interface SidenavProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface SwatchProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface TableProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface SwitchProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly checked: boolean;
  readonly onChecked: (checked: boolean) => void;
  readonly children?: ReactNode;
  readonly className?: string;
}

let registered = false;

/**
 * Shared UI 统一直接引用原生 SWC 包名；UXP build 通过 bundler alias 指向
 * `@swc-uxp-wrappers/*`，这样页面层只维护一套 `sp-*` 合同和注册流程。
 *
 * 这里显式 `define()` 而不是依赖副作用入口，便于在 React 测试、Chrome build、
 * 和 UXP reload 场景下保持同一套 registry guard。`sp-theme` 的注册在
 * `spectrum-theme.ts` 中独立完成（它没有 UXP wrapper，走官方 SWC 包）。
 */
export function registerSpectrumControls(): void {
  if (registered || typeof customElements === 'undefined') {
    return;
  }
  if (!customElements.get('sp-button')) {
    customElements.define('sp-button', SpectrumButton);
  }
  if (!customElements.get('sp-action-bar')) {
    customElements.define('sp-action-bar', SpectrumActionBar);
  }
  if (!customElements.get('sp-action-group')) {
    customElements.define('sp-action-group', SpectrumActionGroup);
  }
  if (!customElements.get('sp-textfield')) {
    customElements.define('sp-textfield', SpectrumTextfield);
  }
  if (!customElements.get('sp-checkbox')) {
    customElements.define('sp-checkbox', SpectrumCheckbox);
  }
  if (!customElements.get('sp-action-button')) {
    customElements.define('sp-action-button', SpectrumActionButton);
  }
  if (!customElements.get('sp-picker-button')) {
    customElements.define('sp-picker-button', SpectrumPickerButton);
  }
  if (!customElements.get('sp-button-group')) {
    customElements.define('sp-button-group', SpectrumButtonGroup);
  }
  if (!customElements.get('sp-asset')) {
    customElements.define('sp-asset', SpectrumAsset);
  }
  if (!customElements.get('sp-banner')) {
    customElements.define('sp-banner', SpectrumBanner);
  }
  if (!customElements.get('sp-card')) {
    customElements.define('sp-card', SpectrumCard);
  }
  if (!customElements.get('sp-field-label')) {
    customElements.define('sp-field-label', SpectrumFieldLabel);
  }
  if (!customElements.get('sp-help-text')) {
    customElements.define('sp-help-text', SpectrumHelpText);
  }
  if (!customElements.get('sp-tag')) {
    customElements.define('sp-tag', SpectrumTag);
  }
  if (!customElements.get('sp-tags')) {
    customElements.define('sp-tags', SpectrumTags);
  }
  if (!customElements.get('sp-divider')) {
    customElements.define('sp-divider', SpectrumDivider);
  }
  if (!customElements.get('sp-switch')) {
    customElements.define('sp-switch', SpectrumSwitch);
  }
  if (!customElements.get('sp-dialog')) {
    customElements.define('sp-dialog', SpectrumDialog);
  }
  if (!customElements.get('sp-field-group')) {
    customElements.define('sp-field-group', SpectrumFieldGroup);
  }
  if (!customElements.get('sp-illustrated-message')) {
    customElements.define('sp-illustrated-message', SpectrumIllustratedMessage);
  }
  if (!customElements.get('sp-link')) {
    customElements.define('sp-link', SpectrumLink);
  }
  if (!customElements.get('sp-meter')) {
    customElements.define('sp-meter', SpectrumMeter);
  }
  if (!customElements.get('sp-number-field')) {
    customElements.define('sp-number-field', SpectrumNumberField);
  }
  if (!customElements.get('sp-overlay')) {
    customElements.define('sp-overlay', SpectrumOverlay as unknown as CustomElementConstructor);
  }
  if (!customElements.get('sp-tooltip')) {
    customElements.define('sp-tooltip', SpectrumTooltip);
  }
  if (!customElements.get('sp-quick-actions')) {
    customElements.define('sp-quick-actions', SpectrumQuickActions);
  }
  if (!customElements.get('sp-radio')) {
    customElements.define('sp-radio', SpectrumRadio);
  }
  if (!customElements.get('sp-search')) {
    customElements.define('sp-search', SpectrumSearch);
  }
  if (!customElements.get('sp-toast')) {
    customElements.define('sp-toast', SpectrumToast);
  }
  if (!customElements.get('sp-menu')) {
    customElements.define('sp-menu', SpectrumMenu);
  }
  if (!customElements.get('sp-menu-item')) {
    customElements.define('sp-menu-item', SpectrumMenuItem);
  }
  if (!customElements.get('sp-popover')) {
    customElements.define('sp-popover', SpectrumPopover);
  }
  if (!customElements.get('sp-sidenav')) {
    customElements.define('sp-sidenav', SpectrumSidenav);
  }
  if (!customElements.get('sp-swatch')) {
    customElements.define('sp-swatch', SpectrumSwatch);
  }
  if (!customElements.get('sp-table')) {
    customElements.define('sp-table', SpectrumTable);
  }
  registered = true;
}

function readTextValue(element: EventTarget | null | undefined): string {
  return typeof (element as SpectrumElement | null)?.value === 'string'
    ? ((element as SpectrumElement).value ?? '')
    : '';
}

function readCheckedValue(element: EventTarget | null | undefined): boolean {
  return Boolean((element as SpectrumElement | null)?.checked);
}

export function Button({ variant = 'secondary', children, disabled, className, ...props }: ButtonProps) {
  registerSpectrumControls();
  return (
    <sp-button {...props} class={className} variant={variant} disabled={disabled || undefined}>
      {children}
    </sp-button>
  );
}

export function TextField({
  value,
  onValue,
  type = 'text',
  placeholder,
  disabled,
  className,
  onKeyUp,
  onBlur,
  ...props
}: TextFieldProps) {
  registerSpectrumControls();
  const controlRef = useRef<SpectrumElement | null>(null);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    if (control.value !== value) {
      control.value = value;
    }
  }, [value]);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    control.type = type;
    control.placeholder = placeholder ?? '';
    control.disabled = Boolean(disabled);
  }, [disabled, placeholder, type]);

  const sync = useCallback(
    (target?: EventTarget | null) => {
      onValue(readTextValue(target ?? controlRef.current));
    },
    [onValue],
  );

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    const syncFromEvent = (event: Event) => sync(event.currentTarget);
    control.addEventListener('change', syncFromEvent);
    control.addEventListener('input', syncFromEvent);
    control.addEventListener('blur', syncFromEvent);
    return () => {
      control.removeEventListener('change', syncFromEvent);
      control.removeEventListener('input', syncFromEvent);
      control.removeEventListener('blur', syncFromEvent);
    };
  }, [sync]);

  return (
    <sp-textfield
      {...props}
      ref={controlRef}
      class={className}
      value={value}
      type={type}
      placeholder={placeholder}
      disabled={disabled || undefined}
      onKeyUp={(event: KeyboardEvent<HTMLElement>) => {
        sync(event.currentTarget);
        onKeyUp?.(event);
      }}
      onBlur={onBlur}
    />
  );
}

export function Checkbox({ checked, onChecked, disabled, children, className, onClick, onKeyUp, ...props }: CheckboxProps) {
  registerSpectrumControls();
  const controlRef = useRef<SpectrumElement | null>(null);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    if (control.checked !== checked) {
      control.checked = checked;
    }
    control.disabled = Boolean(disabled);
  }, [checked, disabled]);

  const sync = useCallback(
    (target?: EventTarget | null) => {
      onChecked(readCheckedValue(target ?? controlRef.current));
    },
    [onChecked],
  );

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    const syncFromEvent = (event: Event) => sync(event.currentTarget);
    control.addEventListener('change', syncFromEvent);
    return () => control.removeEventListener('change', syncFromEvent);
  }, [sync]);

  return (
    <sp-checkbox
      {...props}
      ref={controlRef}
      class={className}
      checked={checked || undefined}
      disabled={disabled || undefined}
      onClick={onClick}
      onKeyUp={onKeyUp}
    >
      {children}
    </sp-checkbox>
  );
}

/**
 * 通用图标 / 行动按钮。`label` 提供时挂载 self-managed `<sp-tooltip>`，
 * 取代旧的 CSS `Tip` 组件。`selected` 由调用方受控（不使用 `toggles` 的内部翻转），
 * 以便在单选 chip / filter 场景下由 React state 决定高亮。
 */
export const ActionButton = forwardRef<HTMLElement, ActionButtonProps>(function ActionButton(
  {
    quiet,
    emphasized,
    selected,
    toggles,
    disabled,
    label,
    placement = 'top',
    className,
    children,
    onClick,
    onKeyUp,
    ...props
  },
  ref,
) {
  registerSpectrumControls();
  return (
    <sp-action-button
      {...props}
      ref={ref as Ref<HTMLElement>}
      class={className}
      quiet={quiet || undefined}
      emphasized={emphasized || undefined}
      selected={selected || undefined}
      toggles={toggles || undefined}
      disabled={disabled || undefined}
      onClick={onClick}
      onKeyUp={onKeyUp}
    >
      {children}
      {label ? <sp-tooltip self-managed placement={placement}>{label}</sp-tooltip> : null}
    </sp-action-button>
  );
});

export function FieldLabel({ htmlFor, children, required, disabled, className }: FieldLabelProps) {
  registerSpectrumControls();
  return (
    <sp-field-label
      class={className}
      for={htmlFor}
      size="m"
      required={required || undefined}
      disabled={disabled || undefined}
    >
      {children}
    </sp-field-label>
  );
}

export function HelpText({ children, variant, className }: HelpTextProps) {
  registerSpectrumControls();
  return (
    <sp-help-text class={className} size="m" variant={variant === 'negative' ? 'negative' : undefined}>
      {children}
    </sp-help-text>
  );
}

export function Tag({ children, className }: TagProps) {
  registerSpectrumControls();
  return <sp-tag class={className}>{children}</sp-tag>;
}

export function Divider({ className, vertical }: DividerProps) {
  registerSpectrumControls();
  return <sp-divider class={className} vertical={vertical || undefined} />;
}

export function ActionBar({ className, children, ...props }: ActionBarProps) {
  registerSpectrumControls();
  return <sp-action-bar {...props} class={className}>{children}</sp-action-bar>;
}

export function ActionGroup({ className, children, ...props }: ActionGroupProps) {
  registerSpectrumControls();
  return <sp-action-group {...props} class={className}>{children}</sp-action-group>;
}

export function Asset({ className, children, ...props }: AssetProps) {
  registerSpectrumControls();
  return <sp-asset {...props} class={className}>{children}</sp-asset>;
}

export function Banner({ className, children, ...props }: BannerProps) {
  registerSpectrumControls();
  return <sp-banner {...props} class={className}>{children}</sp-banner>;
}

export function ButtonGroup({ className, children, ...props }: ButtonGroupProps) {
  registerSpectrumControls();
  return <sp-button-group {...props} class={className}>{children}</sp-button-group>;
}

export function Card({ className, children, ...props }: CardProps) {
  registerSpectrumControls();
  return <sp-card {...props} class={className}>{children}</sp-card>;
}

export function Dialog({ className, children, ...props }: DialogProps) {
  registerSpectrumControls();
  return <sp-dialog {...props} class={className}>{children}</sp-dialog>;
}

export function FieldGroup({ className, children, ...props }: FieldGroupProps) {
  registerSpectrumControls();
  return <sp-field-group {...props} class={className}>{children}</sp-field-group>;
}

export function IllustratedMessage({ className, children, ...props }: IllustratedMessageProps) {
  registerSpectrumControls();
  return <sp-illustrated-message {...props} class={className}>{children}</sp-illustrated-message>;
}

export function Link({ className, children, ...props }: LinkProps) {
  registerSpectrumControls();
  return <sp-link {...props} class={className}>{children}</sp-link>;
}

export function Meter({ className, children, ...props }: MeterProps) {
  registerSpectrumControls();
  return <sp-meter {...props} class={className}>{children}</sp-meter>;
}

export function NumberField({ className, value, onValue, placeholder, disabled, ...props }: NumberFieldProps) {
  registerSpectrumControls();
  const controlRef = useRef<SpectrumElement | null>(null);
  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    control.value = value;
    control.placeholder = placeholder ?? '';
    control.disabled = Boolean(disabled);
  }, [disabled, placeholder, value]);
  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    const syncFromEvent = (event: Event) => onValue(readTextValue(event.currentTarget));
    control.addEventListener('change', syncFromEvent);
    control.addEventListener('input', syncFromEvent);
    return () => {
      control.removeEventListener('change', syncFromEvent);
      control.removeEventListener('input', syncFromEvent);
    };
  }, [onValue]);
  return <sp-number-field {...props} ref={controlRef} class={className} value={value} placeholder={placeholder} disabled={disabled || undefined} />;
}

export function Overlay({ className, children, ...props }: OverlayProps) {
  registerSpectrumControls();
  return <sp-overlay {...props} class={className}>{children}</sp-overlay>;
}

export function QuickActions({ className, children, ...props }: QuickActionsProps) {
  registerSpectrumControls();
  return <sp-quick-actions {...props} class={className}>{children}</sp-quick-actions>;
}

export function Radio({ className, checked, onChecked, children, ...props }: RadioProps) {
  registerSpectrumControls();
  const controlRef = useRef<SpectrumElement | null>(null);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    if (control.checked !== checked) {
      control.checked = checked;
    }
  }, [checked]);

  const sync = useCallback(
    (target?: EventTarget | null) => {
      onChecked(readCheckedValue(target ?? controlRef.current));
    },
    [onChecked],
  );

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    const syncFromEvent = (event: Event) => sync(event.currentTarget);
    control.addEventListener('change', syncFromEvent);
    return () => control.removeEventListener('change', syncFromEvent);
  }, [sync]);

  return (
    <sp-radio {...props} ref={controlRef} class={className} checked={checked || undefined}>
      {children}
    </sp-radio>
  );
}

export function Search({ className, value, onValue, placeholder, disabled, ...props }: SearchProps) {
  registerSpectrumControls();
  const controlRef = useRef<SpectrumElement | null>(null);
  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    control.value = value;
    control.placeholder = placeholder ?? '';
    control.disabled = Boolean(disabled);
  }, [disabled, placeholder, value]);
  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    const syncFromEvent = (event: Event) => onValue(readTextValue(event.currentTarget));
    control.addEventListener('change', syncFromEvent);
    control.addEventListener('input', syncFromEvent);
    return () => {
      control.removeEventListener('change', syncFromEvent);
      control.removeEventListener('input', syncFromEvent);
    };
  }, [onValue]);
  return <sp-search {...props} ref={controlRef} class={className} value={value} placeholder={placeholder} disabled={disabled || undefined} />;
}

export function Sidenav({ className, children, ...props }: SidenavProps) {
  registerSpectrumControls();
  return <sp-sidenav {...props} class={className}>{children}</sp-sidenav>;
}

export function Swatch({ className, children, ...props }: SwatchProps) {
  registerSpectrumControls();
  return <sp-swatch {...props} class={className}>{children}</sp-swatch>;
}

export function Table({ className, children, ...props }: TableProps) {
  registerSpectrumControls();
  return <sp-table {...props} class={className}>{children}</sp-table>;
}

export function Switch({ checked, onChecked, children, className, ...props }: SwitchProps) {
  registerSpectrumControls();
  const controlRef = useRef<SpectrumElement | null>(null);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    if (control.checked !== checked) {
      control.checked = checked;
    }
  }, [checked]);

  const sync = useCallback(
    (target?: EventTarget | null) => {
      onChecked(readCheckedValue(target ?? controlRef.current));
    },
    [onChecked],
  );

  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return;
    }
    const syncFromEvent = (event: Event) => sync(event.currentTarget);
    control.addEventListener('change', syncFromEvent);
    return () => control.removeEventListener('change', syncFromEvent);
  }, [sync]);

  return (
    <sp-switch {...props} ref={controlRef} class={className} checked={checked || undefined}>
      {children}
    </sp-switch>
  );
}

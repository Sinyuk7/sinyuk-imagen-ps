import type { ReactNode } from 'react';
import { Icon } from './icons';
import { useI18n } from '../i18n/i18n-context';
import { TextField, FieldLabel, HelpText } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';

function classNames(...parts: Array<string | undefined | false>): string | undefined {
  const value = parts.filter(Boolean).join(' ');
  return value || undefined;
}

interface SecretFieldProps {
  readonly label: string;
  readonly inputId: string;
  readonly testIdPrefix: string;
  readonly value: string;
  readonly placeholder: string;
  readonly showValue: boolean;
  readonly onValue: (value: string) => void;
  readonly onShowValueChange: (shown: boolean) => void;
  readonly disabled?: boolean;
  readonly removalPending?: boolean;
  readonly helperText?: ReactNode;
  readonly helperVariant?: 'negative';
  readonly helperTestId?: string;
  readonly helperClassName?: string;
  readonly fieldClassName?: string;
  readonly shellClassName?: string;
  readonly inputClassName?: string;
  readonly nativeEditorSuspended?: boolean;
  readonly onClear?: () => void;
  readonly clearPersistent?: boolean;
  readonly clearTooltip?: string;
  readonly clearAriaLabel?: string;
}

export function SecretField({
  label,
  inputId,
  testIdPrefix,
  value,
  placeholder,
  showValue,
  onValue,
  onShowValueChange,
  disabled = false,
  removalPending = false,
  helperText,
  helperVariant,
  helperTestId,
  helperClassName,
  fieldClassName,
  shellClassName,
  inputClassName,
  nativeEditorSuspended = false,
  onClear,
  clearPersistent = false,
  clearTooltip,
  clearAriaLabel,
}: SecretFieldProps) {
  const { messages: t } = useI18n();

  return (
    <div className={classNames('field', fieldClassName)}>
      <FieldLabel htmlFor={inputId} disabled={disabled}>{label}</FieldLabel>
      <div
        className={classNames('field-input-affordance', shellClassName)}
        data-disabled={disabled ? 'true' : undefined}
        data-native-editor-suspended={nativeEditorSuspended ? 'true' : undefined}
      >
        <TextField
          data-testid={`${testIdPrefix}-input`}
          id={inputId}
          type={showValue ? 'text' : 'password'}
          className={classNames('field-input mono ui-field-control field-input-embedded', inputClassName)}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          nativeEditorSuspended={nativeEditorSuspended}
          onValue={onValue}
        />
        {onClear ? (
          <IconButton
            data-testid={`${testIdPrefix}-clear`}
            hostClassName={classNames(
              'field-input-action-host',
              'field-input-action-host-clear',
              clearPersistent && 'field-input-action-host-persistent',
            )}
            className="field-input-action field-input-action-secondary"
            compactSquare
            icon={<Icon name="close" size={14} />}
            tooltip={clearTooltip}
            aria-label={clearAriaLabel ?? clearTooltip}
            disabled={disabled}
            onClick={onClear}
          />
        ) : null}
        <IconButton
          data-testid={`${testIdPrefix}-toggle`}
          hostClassName="field-input-action-host"
          className="field-input-action"
          compactSquare
          icon={<Icon name={showValue ? 'eye-off' : 'eye'} size={14} />}
          tooltip={showValue ? t.settings.hideApiKey : t.settings.showApiKey}
          aria-label={showValue ? t.settings.hideApiKey : t.settings.showApiKey}
          disabled={disabled}
          onClick={() => onShowValueChange(!showValue)}
        />
      </div>
      {helperText !== undefined && helperText !== null ? (
        <HelpText
          data-testid={helperTestId}
          className={classNames('field-hint', helperClassName)}
          variant={helperVariant}
        >
          {helperText}
        </HelpText>
      ) : removalPending ? (
        <HelpText data-testid={`${testIdPrefix}-removal-pending`} className={classNames('field-hint', helperClassName)} variant="negative">
          {t.settings.secretRemovalPending}
        </HelpText>
      ) : null}
    </div>
  );
}

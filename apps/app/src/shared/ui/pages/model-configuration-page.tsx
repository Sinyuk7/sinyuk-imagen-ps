import { useEffect, useMemo, useState } from 'react';
import type {
  ApiFormat,
  OfficialModelPreset,
  RequestStrategy,
  SaveUserModelConfigInput,
  UserModelConfig,
} from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import { ProviderSettingsPageHeader } from '../components/provider-settings-sections';
import { Icon } from '../components/icons';
import { StatusNotice } from '../components/status-notice';
import { TextSelect } from '../components/text-select';
import { useI18n } from '../i18n/i18n-context';
import { Button, Checkbox, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';

interface ModelConfigurationPageProps {
  readonly onNav: (view: string) => void;
  readonly onSaved?: (result: { readonly apiFormat: ApiFormat; readonly modelId: string }) => void;
  readonly initialEditorState?: {
    readonly apiFormat?: ApiFormat | null;
    readonly modelId?: string | null;
  } | null;
}

interface MultiSelectFieldProps {
  readonly title: string;
  readonly values: readonly string[];
  readonly selected: readonly string[];
  readonly disabled?: boolean;
  readonly emptyMessage: string;
  readonly onToggle: (value: string, checked: boolean) => void;
}

const CUSTOM_PRESET_ID = '__custom__';

function MultiSelectField({
  title,
  values,
  selected,
  disabled,
  emptyMessage,
  onToggle,
}: MultiSelectFieldProps) {
  if (values.length === 0) {
    return <HelpText className="field-hint">{emptyMessage}</HelpText>;
  }

  return (
    <div className="field">
      <div className="settings-subsection-heading">{title}</div>
      <div className="model-config-multi-list">
        {values.map((value) => (
          <Checkbox
            key={value}
            checked={selected.includes(value)}
            disabled={disabled}
            className="model-config-checkbox"
            onChecked={(checked) => onToggle(value, checked)}
          >
            {value}
          </Checkbox>
        ))}
      </div>
    </div>
  );
}

function commandMessage(error: { readonly category: string; readonly message: string }): string {
  return `${error.category}: ${error.message}`;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function sourceLabel(config: UserModelConfig, presets: readonly OfficialModelPreset[], t: ReturnType<typeof useI18n>['messages']): string {
  return presets.some((preset) => preset.apiFormat === config.apiFormat && preset.modelId === config.modelId)
    ? t.settings.modelConfigCatalogSource
    : t.settings.modelConfigUserSource;
}

function presetMatchesConfig(
  preset: OfficialModelPreset | undefined,
  config: {
    readonly requestStrategyId: string;
    readonly aspectRatios: readonly string[];
    readonly sizes: readonly string[];
    readonly outputFormats: readonly string[];
  },
): boolean {
  if (!preset) {
    return false;
  }
  return (
    preset.requestStrategyId === config.requestStrategyId &&
    preset.output.aspectRatios.join('\u0000') === config.aspectRatios.join('\u0000') &&
    preset.output.sizes.join('\u0000') === config.sizes.join('\u0000') &&
    preset.output.outputFormats.join('\u0000') === config.outputFormats.join('\u0000')
  );
}

export function ModelConfigurationPage({ onNav, onSaved, initialEditorState = null }: ModelConfigurationPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [configs, setConfigs] = useState<readonly UserModelConfig[]>([]);
  const [presets, setPresets] = useState<readonly OfficialModelPreset[]>([]);
  const [strategies, setStrategies] = useState<readonly RequestStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [apiFormatMenuOpen, setApiFormatMenuOpen] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [strategyMenuOpen, setStrategyMenuOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [apiFormat, setApiFormat] = useState<ApiFormat>('openai-images');
  const [modelId, setModelId] = useState('');
  const [requestStrategyId, setRequestStrategyId] = useState('');
  const [aspectRatios, setAspectRatios] = useState<readonly string[]>([]);
  const [sizes, setSizes] = useState<readonly string[]>([]);
  const [outputFormats, setOutputFormats] = useState<readonly string[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const loadApiFormatData = async (nextApiFormat: ApiFormat) => {
    const [presetResult, strategyResult] = await Promise.all([
      services.commands.listOfficialModelConfigPresets(nextApiFormat),
      services.commands.listRequestStrategiesForApiFormat(nextApiFormat),
    ]);
    if (!presetResult.ok) {
      throw new Error(commandMessage(presetResult.error));
    }
    if (!strategyResult.ok) {
      throw new Error(commandMessage(strategyResult.error));
    }
    setPresets(presetResult.value);
    setStrategies(strategyResult.value);
    return {
      presets: presetResult.value,
      strategies: strategyResult.value,
    };
  };

  const reloadConfigs = async () => {
    setLoading(true);
    try {
      const result = await services.commands.listUserModelConfigs();
      if (!result.ok) {
        throw new Error(commandMessage(result.error));
      }
      setConfigs(result.value);
      setError(null);
    } catch (nextError) {
      setConfigs([]);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadConfigs();
    void loadApiFormatData(apiFormat).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
  }, []);

  useEffect(() => {
    const nextApiFormat = initialEditorState?.apiFormat;
    const nextModelId = initialEditorState?.modelId?.trim();
    if (!nextApiFormat && !nextModelId) {
      return;
    }
    void (async () => {
      try {
        const resolvedApiFormat = nextApiFormat ?? apiFormat;
        setApiFormat(resolvedApiFormat);
        const { presets: nextPresets, strategies: nextStrategies } = await loadApiFormatData(resolvedApiFormat);
        if (nextModelId) {
          const configResult = await services.commands.getUserModelConfig(resolvedApiFormat, nextModelId);
          if (!configResult.ok) {
            throw new Error(commandMessage(configResult.error));
          }
          const preset = nextPresets.find((item) => item.modelId === nextModelId);
          const template = preset ?? nextPresets[0] ?? null;
          const config = configResult.value ?? template ?? null;
          setModelId(nextModelId);
          setRequestStrategyId(config?.requestStrategyId ?? nextStrategies[0]?.id ?? '');
          setAspectRatios(config?.output.aspectRatios ?? []);
          setSizes(config?.output.sizes ?? []);
          setOutputFormats(config?.output.outputFormats ?? []);
          setEditingKey(`${resolvedApiFormat}:${nextModelId}`);
        }
        setEditorOpen(true);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    })();
  }, [initialEditorState]);

  const presetOptions = useMemo(
    () => [
      { id: CUSTOM_PRESET_ID, label: t.settings.modelConfigPresetCustom },
      ...presets.map((preset) => ({
        id: preset.modelId,
        label: `${preset.displayName} · ${preset.modelId}`,
      })),
    ],
    [presets, t.settings.modelConfigPresetCustom],
  );
  const apiFormatOptions = useMemo(
    () => [
      { id: 'openai-images', label: 'OpenAI Images' },
      { id: 'openai-chat-completions', label: 'OpenAI Chat Completions' },
      { id: 'gemini-generate-content', label: 'Gemini GenerateContent' },
    ],
    [],
  );
  const strategyOptions = useMemo(
    () => strategies.map((strategy) => ({ id: strategy.id, label: strategy.id })),
    [strategies],
  );

  const selectedPreset = presets.find((preset) => presetMatchesConfig(preset, {
    requestStrategyId,
    aspectRatios,
    sizes,
    outputFormats,
  }));
  const validationMessage = useMemo(() => {
    if (!apiFormat) {
      return t.settings.modelConfigValidationApiFormat;
    }
    if (modelId.trim().length === 0) {
      return t.settings.modelConfigValidationModelId;
    }
    if (requestStrategyId.trim().length === 0) {
      return t.settings.modelConfigValidationStrategy;
    }
    if (aspectRatios.length === 0) {
      return t.settings.modelConfigValidationAspectRatios;
    }
    if (sizes.length === 0) {
      return t.settings.modelConfigValidationSizes;
    }
    if (outputFormats.length === 0) {
      return t.settings.modelConfigValidationOutputFormats;
    }
    return null;
  }, [apiFormat, aspectRatios.length, modelId, outputFormats.length, requestStrategyId, sizes.length, t.settings]);

  const openCreateEditor = async () => {
    try {
      setApiFormat('openai-images');
      const { presets: nextPresets, strategies: nextStrategies } = await loadApiFormatData('openai-images');
      const firstPreset = nextPresets[0];
      setModelId(firstPreset?.modelId ?? '');
      setRequestStrategyId(firstPreset?.requestStrategyId ?? nextStrategies[0]?.id ?? '');
      setAspectRatios(firstPreset?.output.aspectRatios ?? []);
      setSizes(firstPreset?.output.sizes ?? []);
      setOutputFormats(firstPreset?.output.outputFormats ?? []);
      setEditingKey(null);
      setEditorOpen(true);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const openEditEditor = async (config: UserModelConfig) => {
    try {
      setApiFormat(config.apiFormat);
      await loadApiFormatData(config.apiFormat);
      setModelId(config.modelId);
      setRequestStrategyId(config.requestStrategyId);
      setAspectRatios(config.output.aspectRatios);
      setSizes(config.output.sizes);
      setOutputFormats(config.output.outputFormats);
      setEditingKey(`${config.apiFormat}:${config.modelId}`);
      setEditorOpen(true);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const toggleInList = (
    current: readonly string[],
    value: string,
    checked: boolean,
    setter: (values: readonly string[]) => void,
  ) => {
    setter(checked ? uniqueStrings([...current, value]) : current.filter((item) => item !== value));
  };

  const save = async () => {
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setSaveBusy(true);
    try {
      const result = await services.commands.saveUserModelConfig({
        apiFormat,
        modelId,
        requestStrategyId,
        output: {
          aspectRatios,
          sizes,
          outputFormats,
        },
      } satisfies SaveUserModelConfigInput);
      if (!result.ok) {
        throw new Error(commandMessage(result.error));
      }
      setEditorOpen(false);
      setEditingKey(null);
      await reloadConfigs();
      onSaved?.({ apiFormat: result.value.apiFormat, modelId: result.value.modelId });
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <div className="page page-enter settings-page" onClick={() => {
      setApiFormatMenuOpen(false);
      setPresetMenuOpen(false);
      setStrategyMenuOpen(false);
    }}>
      <ProviderSettingsPageHeader
        backButtonTestId="model-configuration-back-button"
        title={t.settings.modelConfiguration}
        onBack={() => onNav('settings')}
        rightSlot={(
          <IconButton
            data-testid="model-configuration-add-button"
            className="hdr-btn"
            quiet
            icon={<Icon name="add" />}
            tooltip={t.settings.createModelConfiguration}
            onClick={() => void openCreateEditor()}
          />
        )}
      />
      <div className="scroll scroll-footer-pad">
        {!editorOpen ? (
          <div className="settings-detail-layout">
            <section className="section generation-settings-section">
              <HelpText className="field-hint">{t.settings.modelConfigurationHint}</HelpText>
              {loading ? <HelpText className="field-hint">{t.common.loading}</HelpText> : null}
              {error ? <StatusNotice tone="warning" message={error} copyText={error} /> : null}
              {!loading && configs.length === 0 ? (
                <StatusNotice
                  tone="info"
                  message={t.settings.modelConfigurationEmpty}
                  detail={t.settings.modelConfigurationSaveHint}
                />
              ) : null}
              <div className="model-config-list">
                {configs.map((config) => (
                  <div
                    key={`${config.apiFormat}:${config.modelId}`}
                    data-testid={`model-config-row-${config.apiFormat}-${config.modelId}`}
                    className="prompt-preset-row model-config-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => void openEditEditor(config)}
                  >
                    <div className="prompt-preset-row-main model-config-row-main">
                      <span className="prompt-preset-name">{config.modelId}</span>
                      <span className="prompt-preset-mode">{sourceLabel(config, presets, t)}</span>
                      <IconButton
                        data-testid={`model-config-edit-${config.apiFormat}-${config.modelId}`}
                        className="settings-icon-button prompt-preset-action"
                        compactSquare
                        quiet
                        icon={<Icon name="pencil" size={16} />}
                        tooltip={t.settings.editModelConfiguration}
                        aria-label={t.settings.editModelConfiguration}
                        onClick={(event) => {
                          event.stopPropagation();
                          void openEditEditor(config);
                        }}
                      />
                    </div>
                    <HelpText className="field-hint">
                      {config.apiFormat} · {config.requestStrategyId}
                    </HelpText>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="settings-detail-layout">
            <section className="section generation-settings-section">
              <div className="field">
                <FieldLabel htmlFor="model-config-api-format-trigger">{t.settings.modelConfigApiFormat}</FieldLabel>
                <TextSelect
                  testId="model-config-api-format-selector"
                  triggerId="model-config-api-format-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-compact"
                  label={t.settings.modelConfigApiFormat}
                  value={apiFormatOptions.find((option) => option.id === apiFormat)?.label ?? apiFormat}
                  disabled={saveBusy}
                  open={apiFormatMenuOpen}
                  onOpenChange={setApiFormatMenuOpen}
                  options={apiFormatOptions}
                  selectedId={apiFormat}
                  onSelect={(value) => {
                    const nextApiFormat = value as ApiFormat;
                    void (async () => {
                      setApiFormat(nextApiFormat);
                      const { presets: nextPresets, strategies: nextStrategies } = await loadApiFormatData(nextApiFormat);
                      const firstPreset = nextPresets[0];
                      setModelId((current) => current.trim() || firstPreset?.modelId || '');
                      setRequestStrategyId(firstPreset?.requestStrategyId ?? nextStrategies[0]?.id ?? '');
                      setAspectRatios(firstPreset?.output.aspectRatios ?? []);
                      setSizes(firstPreset?.output.sizes ?? []);
                      setOutputFormats(firstPreset?.output.outputFormats ?? []);
                    })().catch((nextError) => {
                      setError(nextError instanceof Error ? nextError.message : String(nextError));
                    });
                  }}
                />
              </div>
              <div className="field">
                <FieldLabel htmlFor="model-config-preset-trigger">{t.settings.modelConfigPreset}</FieldLabel>
                <TextSelect
                  testId="model-config-preset-selector"
                  triggerId="model-config-preset-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-model"
                  label={t.settings.modelConfigPreset}
                  value={selectedPreset
                    ? `${selectedPreset.displayName} · ${selectedPreset.modelId}`
                    : t.settings.modelConfigPresetCustom}
                  disabled={saveBusy}
                  open={presetMenuOpen}
                  onOpenChange={setPresetMenuOpen}
                  options={presetOptions}
                  selectedId={selectedPreset?.modelId ?? CUSTOM_PRESET_ID}
                  onSelect={(value) => {
                    if (value === CUSTOM_PRESET_ID) {
                      setPresetMenuOpen(false);
                      return;
                    }
                    const preset = presets.find((item) => item.modelId === value);
                    if (!preset) {
                      return;
                    }
                    setRequestStrategyId(preset.requestStrategyId);
                    setAspectRatios(preset.output.aspectRatios);
                    setSizes(preset.output.sizes);
                    setOutputFormats(preset.output.outputFormats);
                    setPresetMenuOpen(false);
                  }}
                />
              </div>
              <div className="field">
                <FieldLabel htmlFor="model-config-model-id">{t.settings.modelConfigModelId}</FieldLabel>
                <TextField
                  data-testid="model-config-model-id"
                  id="model-config-model-id"
                  className="field-input mono ui-field-control"
                  value={modelId}
                  disabled={saveBusy}
                  onValue={setModelId}
                />
              </div>
              <div className="field">
                <FieldLabel htmlFor="model-config-strategy-trigger">{t.settings.modelConfigRequestStrategy}</FieldLabel>
                <TextSelect
                  testId="model-config-strategy-selector"
                  triggerId="model-config-strategy-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-model"
                  label={t.settings.modelConfigRequestStrategy}
                  value={requestStrategyId || t.settings.modelConfigValidationStrategy}
                  disabled={saveBusy}
                  open={strategyMenuOpen}
                  onOpenChange={setStrategyMenuOpen}
                  options={strategyOptions}
                  selectedId={requestStrategyId}
                  onSelect={(value) => {
                    setRequestStrategyId(value);
                    setStrategyMenuOpen(false);
                  }}
                />
              </div>
            </section>

            <section className="section generation-settings-section">
              <MultiSelectField
                title={t.settings.modelConfigAspectRatios}
                values={uniqueStrings(selectedPreset?.output.aspectRatios ?? aspectRatios)}
                selected={aspectRatios}
                disabled={saveBusy}
                emptyMessage={t.settings.modelConfigSelectAtLeastOne}
                onToggle={(value, checked) => toggleInList(aspectRatios, value, checked, setAspectRatios)}
              />
              <MultiSelectField
                title={t.settings.modelConfigSizes}
                values={uniqueStrings(selectedPreset?.output.sizes ?? sizes)}
                selected={sizes}
                disabled={saveBusy}
                emptyMessage={t.settings.modelConfigSelectAtLeastOne}
                onToggle={(value, checked) => toggleInList(sizes, value, checked, setSizes)}
              />
              <MultiSelectField
                title={t.settings.modelConfigOutputFormats}
                values={uniqueStrings(selectedPreset?.output.outputFormats ?? outputFormats)}
                selected={outputFormats}
                disabled={saveBusy}
                emptyMessage={t.settings.modelConfigSelectAtLeastOne}
                onToggle={(value, checked) => toggleInList(outputFormats, value, checked, setOutputFormats)}
              />
            </section>

            <section className="section generation-settings-section generation-settings-secondary-section">
              <HelpText className="field-hint">{t.settings.modelConfigurationSaveHint}</HelpText>
              {editingKey ? (
                <HelpText className="field-hint">{editingKey}</HelpText>
              ) : null}
              {validationMessage ? (
                <StatusNotice tone="warning" message={validationMessage} />
              ) : null}
              {error ? (
                <StatusNotice tone="warning" message={error} copyText={error} />
              ) : null}
            </section>
          </div>
        )}
      </div>
      {editorOpen ? (
        <footer className="det-footer">
          <div className="settings-detail-footer-inner">
            <div className="settings-detail-footer-actions">
              <Button
                data-testid="model-config-cancel-button"
                className="btn-save"
                disabled={saveBusy}
                onClick={() => {
                  setEditorOpen(false);
                  setEditingKey(null);
                  setError(null);
                }}
              >
                {t.common.cancel}
              </Button>
            </div>
            <div className="settings-detail-footer-save-group">
              <Button
                data-testid="model-config-save-button"
                className="btn-save"
                variant="accent"
                disabled={saveBusy}
                onClick={() => void save()}
              >
                {saveBusy ? t.settings.saving : t.common.save}
              </Button>
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

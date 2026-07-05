import { useEffect, useMemo, useState } from 'react';
import type {
  ApiFormat,
  ImageAspectRatio,
  OfficialModelPreset,
  SaveUserModelConfigInput,
  UserModelConfig,
  UserModelOutputExposure,
} from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import { ProviderSettingsPageHeader } from '../components/provider-settings-sections';
import { Icon } from '../components/icons';
import { StatusNotice } from '../components/status-notice';
import { TextSelect } from '../components/text-select';
import { useI18n } from '../i18n/i18n-context';
import { Button, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import {
  buildOutputCapabilityEditorState,
  fullSelectionForModule,
  hasSparseCombinationSet,
  type MatrixDimensionSelection,
  type OutputCapabilityModule,
  validCombinationCount,
} from './model-configuration-page.helpers';

interface ModelConfigurationPageProps {
  readonly onNav: (view: string) => void;
  readonly onSaved?: (result: { readonly apiFormat: ApiFormat; readonly modelId: string }) => void;
  readonly onBack?: () => void;
  readonly initialEditorState?: {
    readonly source?: 'settings-list' | 'profile-add' | 'profile-detail';
    readonly profileId?: string | null;
    readonly apiFormat?: ApiFormat | null;
    readonly modelId?: string | null;
  } | null;
}

type DimensionKind = 'imageSizes' | 'ratios' | 'outputFormats';

function commandMessage(error: { readonly category: string; readonly message: string }): string {
  return `${error.category}: ${error.message}`;
}

function sourceLabel(config: UserModelConfig, presets: readonly OfficialModelPreset[], t: ReturnType<typeof useI18n>['messages']): string {
  const preset = presets.find((item) => item.apiFormat === config.apiFormat && item.modelId === config.baseModelId);
  return preset ? `${t.settings.modelConfigCatalogSource} · ${preset.displayName}` : t.settings.modelConfigUserSource;
}

function toggleOrderedValue<T extends string>(
  current: readonly T[],
  orderedOptions: readonly T[],
  value: T,
  checked: boolean,
): readonly T[] {
  if (checked) {
    return orderedOptions.filter((option) => option === value || current.includes(option));
  }
  return current.filter((item) => item !== value);
}

function operationLabel(operation: OutputCapabilityModule['operations'][number], t: ReturnType<typeof useI18n>['messages']): string {
  return operation === 'text_to_image' ? t.settings.modelConfigOperationTextToImage : t.settings.modelConfigOperationEditImage;
}

function ratioVisualClass(ratio: ImageAspectRatio): string {
  switch (ratio) {
    case 'auto':
    case 'source':
      return 'is-text';
    case '1:1':
      return 'is-square';
    case '16:9':
      return 'is-wide';
    case '9:16':
      return 'is-tall';
    default:
      return 'is-generic';
  }
}

function ratioLabel(ratio: ImageAspectRatio, t: ReturnType<typeof useI18n>['messages']): string {
  if (ratio === 'auto') {
    return t.settings.modelConfigRatioAuto;
  }
  if (ratio === 'source') {
    return t.settings.modelConfigRatioSource;
  }
  return ratio;
}

function selectionSummary(_module: OutputCapabilityModule, selection: MatrixDimensionSelection, t: ReturnType<typeof useI18n>['messages']): string {
  if (_module.archetype === 'size-format') {
    return t.settings.modelConfigSizeFormatSummary(
      selection.outputFormats.length,
      selection.imageSizes.length,
    );
  }
  return t.settings.modelConfigModuleSummary(
    selection.outputFormats.length,
    selection.ratios.length,
    selection.imageSizes.length,
  );
}

function fieldSelectionError(selection: MatrixDimensionSelection, t: ReturnType<typeof useI18n>['messages']): string | null {
  if (selection.outputFormats.length === 0) {
    return t.settings.modelConfigValidationOutputFormat;
  }
  if (selection.ratios.length === 0) {
    return t.settings.modelConfigValidationAspectRatio;
  }
  if (selection.imageSizes.length === 0) {
    return t.settings.modelConfigValidationResolution;
  }
  return null;
}

function exposureFromModules(
  preset: OfficialModelPreset,
  modules: readonly OutputCapabilityModule[],
  selections: Readonly<Record<string, MatrixDimensionSelection>>,
): UserModelOutputExposure {
  if (preset.outputExposure.kind === 'flexible-pixels') {
    const selectedSizes = new Set<string>();
    const selectedFormats = new Set<string>();
    for (const module of modules) {
      const selection = selections[module.id] ?? fullSelectionForModule(module);
      for (const size of selection.imageSizes) {
        selectedSizes.add(size);
      }
      for (const format of selection.outputFormats) {
        selectedFormats.add(format);
      }
    }
    return {
      kind: 'flexible-pixels',
      sizePresetIds: preset.outputExposure.sizePresetIds.filter((id) => selectedSizes.has(id)),
      outputFormats: preset.outputExposure.outputFormats.filter((format) => selectedFormats.has(format)),
      allowInputDerivedExactSize: selectedSizes.has('use-input-size') && preset.outputExposure.allowInputDerivedExactSize,
    };
  }
  const selectedRatios = new Set<string>();
  const selectedResolutions = new Set<string>();
  const selectedFormats = new Set<string>();
  for (const module of modules) {
    const selection = selections[module.id] ?? fullSelectionForModule(module);
    for (const ratio of selection.ratios) {
      if (ratio !== 'auto' && ratio !== 'source') {
        selectedRatios.add(ratio);
      }
    }
    for (const size of selection.imageSizes) {
      if (size !== 'auto' && size !== 'use-input-size') {
        selectedResolutions.add(size);
      }
    }
    for (const format of selection.outputFormats) {
      selectedFormats.add(format);
    }
  }
  return {
    kind: 'ratio-resolution',
    aspectRatios: preset.outputExposure.aspectRatios.filter((ratio) => selectedRatios.has(ratio)),
    resolutions: preset.outputExposure.resolutions.filter((resolution) => selectedResolutions.has(resolution)),
    outputFormats: preset.outputExposure.outputFormats.filter((format) => selectedFormats.has(format)),
  };
}

function CapabilityChipGroup({
  title,
  items,
  selected,
  disabled,
  testIdPrefix,
  onToggle,
}: {
  readonly title: string;
  readonly items: readonly { readonly id: string; readonly label: string }[];
  readonly selected: readonly string[];
  readonly disabled?: boolean;
  readonly testIdPrefix: string;
  readonly onToggle: (id: string, checked: boolean) => void;
}) {
  const firstItemId = items[0]?.id ?? `${testIdPrefix}-empty`;
  return (
    <div className="field">
      <FieldLabel htmlFor={`${testIdPrefix}-${firstItemId}`}>{title}</FieldLabel>
      <div className="model-config-chip-list">
        {items.map((item) => {
          const checked = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              id={`${testIdPrefix}-${item.id}`}
              data-testid={`${testIdPrefix}-${item.id}`}
              className={`model-config-chip${checked ? ' is-selected' : ''}`}
              aria-pressed={checked}
              disabled={disabled}
              onClick={() => onToggle(item.id, !checked)}
            >
              {checked ? <Icon name="check" size={12} /> : null}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RatioTileGroup({
  title,
  items,
  selected,
  disabled,
  testIdPrefix,
  onToggle,
  t,
}: {
  readonly title: string;
  readonly items: readonly { readonly id: ImageAspectRatio; readonly label: string }[];
  readonly selected: readonly ImageAspectRatio[];
  readonly disabled?: boolean;
  readonly testIdPrefix: string;
  readonly onToggle: (id: ImageAspectRatio, checked: boolean) => void;
  readonly t: ReturnType<typeof useI18n>['messages'];
}) {
  const textItems = items.filter((item) => item.id === 'auto' || item.id === 'source');
  const graphicItems = items.filter((item) => item.id !== 'auto' && item.id !== 'source');
  const firstItemId = items[0]?.id ?? 'empty';

  return (
    <div className="field">
      <FieldLabel htmlFor={`${testIdPrefix}-${firstItemId}`}>{title}</FieldLabel>
      {textItems.length > 0 ? (
        <div className="model-config-chip-list model-config-chip-list-ratio-text">
          {textItems.map((item) => {
            const checked = selected.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                id={`${testIdPrefix}-${item.id}`}
                data-testid={`${testIdPrefix}-${item.id}`}
                className={`model-config-chip${checked ? ' is-selected' : ''}`}
                aria-pressed={checked}
                disabled={disabled}
                onClick={() => onToggle(item.id, !checked)}
              >
                {checked ? <Icon name="check" size={12} /> : null}
                <span>{ratioLabel(item.id, t)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="model-config-ratio-grid">
        {graphicItems.map((item) => {
          const checked = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              id={`${testIdPrefix}-${item.id}`}
              data-testid={`${testIdPrefix}-${item.id}`}
              className={`model-config-ratio-tile${checked ? ' is-selected' : ''}`}
              aria-pressed={checked}
              disabled={disabled}
              onClick={() => onToggle(item.id, !checked)}
            >
              <span className={`model-config-ratio-visual ${ratioVisualClass(item.id)}`} aria-hidden="true" />
              <span className="model-config-ratio-label">{item.label}</span>
              {checked ? (
                <span className="model-config-ratio-check" aria-hidden="true">
                  <Icon name="check" size={12} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CapabilitySection({
  module,
  selection,
  disabled,
  validationMessage,
  normalizationRequired,
  t,
  onToggle,
}: {
  readonly module: OutputCapabilityModule;
  readonly selection: MatrixDimensionSelection;
  readonly disabled?: boolean;
  readonly validationMessage: string | null;
  readonly normalizationRequired: boolean;
  readonly t: ReturnType<typeof useI18n>['messages'];
  readonly onToggle: (dimension: DimensionKind, id: string, checked: boolean) => void;
}) {
  const primaryMatrix = module.matrices[0]!;
  const combinationCount = validCombinationCount(primaryMatrix, selection);
  const sparse = hasSparseCombinationSet(primaryMatrix, selection);

  return (
    <section className="section generation-settings-section">
      <div className="model-config-capability-section-header">
        <div className="model-config-capability-section-copy">
          <div className="section-title">{module.shared ? t.settings.modelConfigOutputCapabilities : operationLabel(module.operations[0]!, t)}</div>
          <HelpText className="field-hint">{selectionSummary(module, selection, t)}</HelpText>
        </div>
        {module.shared ? (
          <span className="model-config-capability-badge">{t.settings.modelConfigSharedScope}</span>
        ) : null}
      </div>

      <CapabilityChipGroup
        title={t.settings.modelConfigOutputFormat}
        items={module.outputFormats.map((item) => ({ id: item.id, label: item.label.toUpperCase() }))}
        selected={selection.outputFormats}
        disabled={disabled}
        testIdPrefix={`model-config-${module.id}-format`}
        onToggle={(id, checked) => onToggle('outputFormats', id, checked)}
      />

      {module.archetype === 'size-aspect-ratio-format' ? (
        <RatioTileGroup
          title={t.settings.modelConfigAspectRatio}
          items={module.ratios.map((item) => ({ id: item.id, label: item.label }))}
          selected={selection.ratios}
          disabled={disabled}
          testIdPrefix={`model-config-${module.id}-ratio`}
          onToggle={(id, checked) => onToggle('ratios', id, checked)}
          t={t}
        />
      ) : null}

      <CapabilityChipGroup
        title={t.settings.modelConfigOutputSize}
        items={module.imageSizes.map((item) => ({ id: item.id, label: item.label }))}
        selected={selection.imageSizes}
        disabled={disabled}
        testIdPrefix={`model-config-${module.id}-size`}
        onToggle={(id, checked) => onToggle('imageSizes', id, checked)}
      />

      {normalizationRequired ? (
        <StatusNotice tone="warning" message={t.settings.modelConfigNormalizationWarning} />
      ) : null}
      <HelpText className="field-hint model-config-combination-summary">
        {t.settings.modelConfigValidCombinations(combinationCount)}
      </HelpText>
      {sparse ? (
        <HelpText className="field-hint model-config-combination-summary">{t.settings.modelConfigSparseCombinationHint}</HelpText>
      ) : null}
      {validationMessage ? <StatusNotice tone="warning" message={validationMessage} /> : null}
    </section>
  );
}

export function ModelConfigurationPage({ onNav, onSaved, onBack, initialEditorState = null }: ModelConfigurationPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [configs, setConfigs] = useState<readonly UserModelConfig[]>([]);
  const [presets, setPresets] = useState<readonly OfficialModelPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [apiFormatMenuOpen, setApiFormatMenuOpen] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [apiFormat, setApiFormat] = useState<ApiFormat>('openai-images');
  const [modelId, setModelId] = useState('');
  const [baseModelId, setBaseModelId] = useState('');
  const [requestStrategyId, setRequestStrategyId] = useState('');
  const [moduleSelections, setModuleSelections] = useState<Readonly<Record<string, MatrixDimensionSelection>>>({});
  const [normalizationRequiredModuleIds, setNormalizationRequiredModuleIds] = useState<readonly string[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const loadApiFormatData = async (nextApiFormat: ApiFormat) => {
    const presetResult = await services.commands.listOfficialModelConfigPresets(nextApiFormat);
    if (!presetResult.ok) {
      throw new Error(commandMessage(presetResult.error));
    }
    setPresets(presetResult.value);
    return {
      presets: presetResult.value,
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

  const presetOptions = useMemo(
    () => presets.map((preset) => ({
      id: preset.modelId,
      label: `${preset.displayName} · ${preset.modelId}`,
    })),
    [presets],
  );

  const apiFormatOptions = useMemo(
    () => [
      { id: 'openai-images', label: 'OpenAI Images' },
      { id: 'openai-chat-completions', label: 'OpenAI Chat Completions' },
      { id: 'gemini-generate-content', label: 'Gemini GenerateContent' },
    ],
    [],
  );

  const selectedPreset = presets.find((preset) => preset.modelId === baseModelId);
  const editingExisting = editingKey !== null;
  const capabilityState = useMemo(
    () => (selectedPreset ? buildOutputCapabilityEditorState(selectedPreset) : null),
    [selectedPreset],
  );

  const resetEditorSelections = (preset: OfficialModelPreset | undefined, config?: UserModelConfig | null) => {
    if (!preset) {
      setModuleSelections({});
      setNormalizationRequiredModuleIds([]);
      return;
    }
    const nextState = buildOutputCapabilityEditorState(preset, config);
    setModuleSelections(nextState.selections);
    setNormalizationRequiredModuleIds(nextState.normalizationRequiredModuleIds);
  };

  useEffect(() => {
    const nextApiFormat = initialEditorState?.apiFormat;
    const nextModelId = initialEditorState?.modelId?.trim();
    if (!nextApiFormat && !nextModelId && !initialEditorState?.source) {
      return;
    }
    void (async () => {
      try {
        const resolvedApiFormat = nextApiFormat ?? apiFormat;
        setApiFormat(resolvedApiFormat);
        const { presets: nextPresets } = await loadApiFormatData(resolvedApiFormat);
        const configResult = nextModelId
          ? await services.commands.getUserModelConfig(resolvedApiFormat, nextModelId)
          : { ok: true as const, value: null };
        if (!configResult.ok) {
          throw new Error(commandMessage(configResult.error));
        }
        const config = configResult.value;
        const preset = config
          ? nextPresets.find((item) => item.modelId === config.baseModelId)
          : nextPresets.find((item) => item.modelId === nextModelId) ?? nextPresets[0];
        setModelId(config?.modelId ?? nextModelId ?? '');
        setBaseModelId(preset?.modelId ?? '');
        setRequestStrategyId(preset?.requestStrategyId ?? '');
        resetEditorSelections(preset, config);
        setEditingKey(config ? `${resolvedApiFormat}:${config.modelId}` : null);
        setEditorOpen(true);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    })();
  }, [initialEditorState]);

  const moduleValidationMessages = useMemo(() => {
    if (!selectedPreset) {
      return {};
    }
    return Object.fromEntries(
      (buildOutputCapabilityEditorState(selectedPreset).modules).map((module) => {
        const selection = moduleSelections[module.id] ?? fullSelectionForModule(module);
        return [module.id, fieldSelectionError(selection, t)];
      }),
    ) as Readonly<Record<string, string | null>>;
  }, [moduleSelections, selectedPreset, t]);

  const validationMessage = useMemo(() => {
    if (!apiFormat) {
      return t.settings.modelConfigValidationApiFormat;
    }
    if (modelId.trim().length === 0) {
      return t.settings.modelConfigValidationModelId;
    }
    if (!selectedPreset) {
      return t.settings.modelConfigValidationPreset;
    }
    if (requestStrategyId.trim().length === 0) {
      return t.settings.modelConfigValidationStrategy;
    }
    for (const moduleMessage of Object.values(moduleValidationMessages)) {
      if (moduleMessage) {
        return moduleMessage;
      }
    }
    return null;
  }, [apiFormat, modelId, moduleValidationMessages, requestStrategyId, selectedPreset, t]);

  const applyPreset = (preset: OfficialModelPreset | undefined, nextModelId?: string, config?: UserModelConfig | null) => {
    setBaseModelId(preset?.modelId ?? '');
    setRequestStrategyId(preset?.requestStrategyId ?? '');
    resetEditorSelections(preset, config);
    if (nextModelId !== undefined) {
      setModelId(nextModelId);
    }
  };

  const openCreateEditor = async () => {
    try {
      const nextApiFormat = initialEditorState?.apiFormat ?? 'openai-images';
      setApiFormat(nextApiFormat);
      const { presets: nextPresets } = await loadApiFormatData(nextApiFormat);
      const firstPreset = nextPresets[0];
      applyPreset(firstPreset, firstPreset?.modelId ?? '');
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
      const { presets: nextPresets } = await loadApiFormatData(config.apiFormat);
      const preset = nextPresets.find((item) => item.modelId === config.baseModelId);
      setModelId(config.modelId);
      setBaseModelId(preset?.modelId ?? config.baseModelId);
      setRequestStrategyId(preset?.requestStrategyId ?? config.requestStrategyId);
      resetEditorSelections(preset, config);
      setEditingKey(`${config.apiFormat}:${config.modelId}`);
      setEditorOpen(true);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const toggleModuleSelection = (module: OutputCapabilityModule, dimension: DimensionKind, id: string, checked: boolean) => {
    setModuleSelections((current) => {
      const selection = current[module.id] ?? fullSelectionForModule(module);
      const orderedIds = module[dimension].map((option) => option.id) as readonly string[];
      const nextSelection = {
        ...selection,
        [dimension]: toggleOrderedValue(
          selection[dimension] as readonly string[],
          orderedIds,
          id,
          checked,
        ),
      } satisfies MatrixDimensionSelection;
      return {
        ...current,
        [module.id]: nextSelection,
      };
    });
  };

  const save = async () => {
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    if (!selectedPreset) {
      return;
    }
    const editorState = buildOutputCapabilityEditorState(selectedPreset);
    setSaveBusy(true);
    try {
      const outputExposure = exposureFromModules(selectedPreset, editorState.modules, moduleSelections);

      const result = await services.commands.saveUserModelConfig({
        apiFormat,
        modelId,
        baseModelId: selectedPreset.modelId,
        requestStrategyId: selectedPreset.requestStrategyId,
        outputExposure,
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
    }}>
      <ProviderSettingsPageHeader
        backButtonTestId="model-configuration-back-button"
        title={editorOpen ? (editingExisting ? t.settings.editModelConfiguration : t.settings.createModelConfiguration) : t.settings.modelConfiguration}
        onBack={() => {
          if (editorOpen) {
            setEditorOpen(false);
            setEditingKey(null);
            setError(null);
            return;
          }
          if (onBack) {
            onBack();
            return;
          }
          onNav('settings');
        }}
        rightSlot={!editorOpen ? (
          <IconButton
            data-testid="model-configuration-add-button"
            className="hdr-btn"
            quiet
            icon={<Icon name="add" />}
            tooltip={t.settings.createModelConfiguration}
            onClick={() => void openCreateEditor()}
          />
        ) : undefined}
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
                      {config.apiFormat} · {config.baseModelId} · {config.requestStrategyId}
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
                      const { presets: nextPresets } = await loadApiFormatData(nextApiFormat);
                      const firstPreset = nextPresets[0];
                      applyPreset(firstPreset, modelId.trim() || firstPreset?.modelId || '');
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
                    : t.settings.modelConfigValidationPreset}
                  disabled={saveBusy}
                  open={presetMenuOpen}
                  onOpenChange={setPresetMenuOpen}
                  options={presetOptions}
                  selectedId={selectedPreset?.modelId ?? ''}
                  onSelect={(value) => {
                    const preset = presets.find((item) => item.modelId === value);
                    applyPreset(preset);
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
                <FieldLabel htmlFor="model-config-request-strategy">{t.settings.modelConfigRequestStrategy}</FieldLabel>
                <TextField
                  data-testid="model-config-strategy"
                  id="model-config-request-strategy"
                  className="field-input mono ui-field-control"
                  value={requestStrategyId}
                  disabled
                  onValue={() => undefined}
                />
              </div>
            </section>

            {selectedPreset && capabilityState
              ? capabilityState.modules.map((module) => (
                <CapabilitySection
                  key={module.id}
                  module={module}
                  selection={moduleSelections[module.id] ?? fullSelectionForModule(module)}
                  disabled={saveBusy}
                  validationMessage={moduleValidationMessages[module.id] ?? null}
                  normalizationRequired={normalizationRequiredModuleIds.includes(module.id)}
                  t={t}
                  onToggle={(dimension, id, checked) => toggleModuleSelection(module, dimension, id, checked)}
                />
              ))
              : null}

            <section className="section generation-settings-section generation-settings-secondary-section">
              <HelpText className="field-hint">{t.settings.modelConfigurationSaveHint}</HelpText>
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
            <div className="settings-detail-footer-actions" />
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

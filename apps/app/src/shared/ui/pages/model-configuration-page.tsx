import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { useToast } from '../components/toast-host';
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
  readonly initialEditorState: {
    readonly profileId: string;
    readonly apiFormat: ApiFormat;
    readonly modelId?: string | null;
    readonly wireModelId?: string | null;
  };
}

type DimensionKind = 'imageSizes' | 'ratios' | 'outputFormats';

function commandMessage(error: { readonly category: string; readonly message: string }): string {
  return `${error.category}: ${error.message}`;
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

function parseAspectRatio(ratio: ImageAspectRatio): { readonly width: number; readonly height: number } | null {
  const [rawWidth, rawHeight] = ratio.split(':');
  if (!rawWidth || !rawHeight) {
    return null;
  }
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function ratioPreviewFrame(ratio: ImageAspectRatio): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  const parsed = parseAspectRatio(ratio);
  if (!parsed) {
    return { x: 5, y: 4, width: 14, height: 8 };
  }
  const maxWidth = 20;
  const maxHeight = 12;
  const minWidth = 6;
  const minHeight = 4;
  const aspect = parsed.width / parsed.height;

  let previewWidth = maxWidth;
  let previewHeight = previewWidth / aspect;
  if (previewHeight > maxHeight) {
    previewHeight = maxHeight;
    previewWidth = previewHeight * aspect;
  }
  if (previewHeight < minHeight) {
    previewHeight = minHeight;
    previewWidth = Math.min(maxWidth, previewHeight * aspect);
  }
  if (previewWidth < minWidth) {
    previewWidth = minWidth;
    previewHeight = Math.min(maxHeight, previewWidth / aspect);
  }

  return {
    x: (24 - previewWidth) / 2,
    y: (16 - previewHeight) / 2,
    width: previewWidth,
    height: previewHeight,
  };
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

function RatioPreview({ ratio }: { readonly ratio: ImageAspectRatio }) {
  const frame = ratioPreviewFrame(ratio);
  return (
    <span className="model-config-ratio-preview" aria-hidden="true">
      <svg className="model-config-ratio-preview-svg" viewBox="0 0 24 16">
        <rect
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
          rx="2"
          ry="2"
          className="model-config-ratio-preview-rect"
        />
      </svg>
    </span>
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

function StrategyMetaField({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <div className="field">
      <div className="section-title settings-subsection-heading">{label}</div>
      <div className="model-config-meta-value mono">{value}</div>
      <HelpText className="field-hint">{detail}</HelpText>
    </div>
  );
}

function ModelIdField({
  id,
  testId,
  value,
  disabled,
  suspended,
  onValue,
}: {
  readonly id: string;
  readonly testId: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly suspended: boolean;
  readonly onValue: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      className="field-input-affordance model-config-model-id-shell"
      data-focused={focused ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      data-native-editor-suspended={suspended ? 'true' : undefined}
    >
      <TextField
        data-testid={testId}
        id={id}
        className="field-input mono ui-field-control field-input-embedded"
        value={value}
        disabled={disabled}
        nativeEditorSuspended={suspended}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onValue={onValue}
      />
    </div>
  );
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

function CapabilityOptionGroup({
  title,
  items,
  selected,
  disabled,
  testIdPrefix,
  onToggle,
  renderItem,
}: {
  readonly title: string;
  readonly items: readonly { readonly id: string; readonly label: string }[];
  readonly selected: readonly string[];
  readonly disabled?: boolean;
  readonly testIdPrefix: string;
  readonly onToggle: (id: string, checked: boolean) => void;
  readonly renderItem?: (item: { readonly id: string; readonly label: string }, checked: boolean) => ReactNode;
}) {
  const firstItemId = items[0]?.id ?? `${testIdPrefix}-empty`;
  return (
    <div className="field">
      <FieldLabel htmlFor={`${testIdPrefix}-${firstItemId}`}>{title}</FieldLabel>
      <div className="model-config-option-list">
        {items.map((item) => {
          const checked = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              id={`${testIdPrefix}-${item.id}`}
              data-testid={`${testIdPrefix}-${item.id}`}
              className={`model-config-chip${checked ? ' is-selected' : ''}`}
              role="checkbox"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => onToggle(item.id, !checked)}
            >
              {renderItem ? renderItem(item, checked) : (
                <>
                  {checked ? <span className="model-config-chip-check" aria-hidden="true" /> : null}
                  <span className="model-config-chip-label mono">{item.label}</span>
                </>
              )}
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
  const firstItemId = items[0]?.id ?? 'empty';

  return (
    <div className="field">
      <FieldLabel htmlFor={`${testIdPrefix}-${firstItemId}`}>{title}</FieldLabel>
      <div className="model-config-ratio-grid">
        {items.map((item) => {
          const checked = selected.includes(item.id);
          const textOnly = item.id === 'auto' || item.id === 'source';
          return (
            <button
              key={item.id}
              type="button"
              id={`${testIdPrefix}-${item.id}`}
              data-testid={`${testIdPrefix}-${item.id}`}
              className={`model-config-ratio-tile${checked ? ' is-selected' : ''}`}
              role="checkbox"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => onToggle(item.id, !checked)}
            >
              {textOnly ? (
                <span className="model-config-ratio-tile-text">{ratioLabel(item.id, t)}</span>
              ) : (
                <>
                  <RatioPreview ratio={item.id} />
                  <span className="model-config-ratio-label mono">{item.label}</span>
                </>
              )}
              {checked ? <span className="model-config-ratio-check" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SizeTileGroup({
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
  const firstItemId = items[0]?.id ?? 'empty';

  return (
    <div className="field">
      <FieldLabel htmlFor={`${testIdPrefix}-${firstItemId}`}>{title}</FieldLabel>
      <div className="model-config-size-grid">
        {items.map((item) => {
          const checked = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              id={`${testIdPrefix}-${item.id}`}
              data-testid={`${testIdPrefix}-${item.id}`}
              className={`model-config-size-tile${checked ? ' is-selected' : ''}`}
              role="checkbox"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => onToggle(item.id, !checked)}
            >
              <span className="model-config-size-label mono">{item.label}</span>
              {checked ? <span className="model-config-ratio-check" aria-hidden="true" /> : null}
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
  const showSparseHint = sparse && normalizationRequired;
  const combinationSummary = showSparseHint
    ? `${t.settings.modelConfigValidCombinations(combinationCount)} · ${t.settings.modelConfigSparseCombinationHint}`
    : t.settings.modelConfigValidCombinations(combinationCount);

  return (
    <section className="section generation-settings-section">
      <div className="model-config-capability-section-header">
        <div className="model-config-capability-section-copy">
          <div
            className="section-title"
            data-testid={`model-config-section-title-${module.id}`}
          >
            {module.shared ? t.settings.modelConfigOutputCapabilities : operationLabel(module.operations[0]!, t)}
          </div>
        </div>
        {module.shared ? (
          <span
            className="model-config-capability-meta"
            data-testid={`model-config-shared-scope-${module.id}`}
          >
            {t.settings.modelConfigSharedScope}
          </span>
        ) : null}
      </div>

      <CapabilityOptionGroup
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

      <SizeTileGroup
        title={t.settings.modelConfigOutputSize}
        items={module.imageSizes.map((item) => ({ id: item.id, label: item.label }))}
        selected={selection.imageSizes}
        disabled={disabled}
        testIdPrefix={`model-config-${module.id}-size`}
        onToggle={(id, checked) => onToggle('imageSizes', id, checked)}
      />

      {normalizationRequired ? (
        <div className="status-warning-slot" data-testid={`model-config-normalization-warning-${module.id}`}>
          <StatusNotice tone="warning" message={t.settings.modelConfigNormalizationWarning} />
        </div>
      ) : null}
      <HelpText className="field-hint model-config-combination-summary mono">
        {combinationSummary}
      </HelpText>
      {validationMessage ? (
        <div className="status-warning-slot" data-testid={`model-config-validation-warning-${module.id}`}>
          <StatusNotice tone="warning" message={validationMessage} />
        </div>
      ) : null}
    </section>
  );
}

export function ModelConfigurationPage({ onNav, onSaved, onBack, initialEditorState }: ModelConfigurationPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const { show } = useToast();
  const [presets, setPresets] = useState<readonly OfficialModelPreset[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(true);
  const [apiFormatMenuOpen, setApiFormatMenuOpen] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [apiFormat, setApiFormat] = useState<ApiFormat>('openai-images');
  const [modelId, setModelId] = useState('');
  const [wireModelId, setWireModelId] = useState('');
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

  useEffect(() => {
    void loadApiFormatData(apiFormat).catch((nextError) => {
      setPageError(nextError instanceof Error ? nextError.message : String(nextError));
    });
  }, []);

  const presetOptions = useMemo(
    () => presets.map((preset) => ({
      id: preset.modelId,
      label: preset.displayName,
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
    const nextApiFormat = initialEditorState.apiFormat;
    const nextModelId = initialEditorState?.modelId?.trim();
    const nextWireModelId = initialEditorState?.wireModelId?.trim();
    void (async () => {
      try {
        const resolvedApiFormat = nextApiFormat;
        setApiFormat(resolvedApiFormat);
        const { presets: nextPresets } = await loadApiFormatData(resolvedApiFormat);
        const configResult = nextModelId
          ? await services.commands.getUserModelConfig(initialEditorState.profileId, nextModelId)
          : { ok: true as const, value: null };
        if (!configResult.ok) {
          throw new Error(commandMessage(configResult.error));
        }
        const config = configResult.value;
        const preset = config
          ? nextPresets.find((item) => item.modelId === config.baseModelId)
          : nextPresets.find((item) => item.modelId === nextModelId) ?? nextPresets[0];
        if (config) {
          setModelId(config.modelId);
          setWireModelId(config.wireModelId);
          setBaseModelId(preset?.modelId ?? config.baseModelId);
          setRequestStrategyId(preset?.requestStrategyId ?? config.requestStrategyId);
          resetEditorSelections(preset, config);
        } else {
          applyPreset(preset, 'create');
          if (nextModelId) {
            setModelId(nextModelId);
            setWireModelId(nextWireModelId || nextModelId);
          } else if (nextWireModelId) {
            setWireModelId(nextWireModelId);
          }
        }
        setEditingKey(config ? config.modelId : null);
        setAdvancedOpen(false);
        setEditorOpen(true);
        setPageError(null);
      } catch (nextError) {
        setPageError(nextError instanceof Error ? nextError.message : String(nextError));
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
    if (wireModelId.trim().length === 0) {
      return t.settings.modelConfigValidationModelId;
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
  }, [apiFormat, modelId, moduleValidationMessages, requestStrategyId, selectedPreset, t, wireModelId]);
  const modelIdSuspended = apiFormatMenuOpen || presetMenuOpen;

  const applyPreset = (preset: OfficialModelPreset | undefined, mode: 'create' | 'edit', config?: UserModelConfig | null) => {
    setBaseModelId(preset?.modelId ?? '');
    setRequestStrategyId(preset?.requestStrategyId ?? '');
    resetEditorSelections(preset, config);
    if (mode === 'create') {
      const nextModelId = preset?.modelId ?? '';
      setModelId(nextModelId);
      setWireModelId(nextModelId);
      return;
    }
    setWireModelId(preset?.modelId ?? '');
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
      show(validationMessage, 'warning', { key: 'model-config-validation', durationMs: null });
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
        profileId: initialEditorState.profileId,
        apiFormat,
        modelId,
        baseModelId: selectedPreset.modelId,
        wireModelId,
        requestStrategyId: selectedPreset.requestStrategyId,
        outputExposure,
      } satisfies SaveUserModelConfigInput);
      if (!result.ok) {
        throw new Error(commandMessage(result.error));
      }
      setEditorOpen(false);
      setEditingKey(null);
      onSaved?.({ apiFormat: result.value.apiFormat, modelId: result.value.modelId });
      setPageError(null);
    } catch (nextError) {
      show(nextError instanceof Error ? nextError.message : String(nextError), 'negative', {
        key: 'model-config-save-error',
        durationMs: null,
      });
    } finally {
      setSaveBusy(false);
    }
  };

  const remove = async () => {
    if (!editingKey) {
      return;
    }
    setSaveBusy(true);
    try {
      const result = await services.commands.deleteUserModelConfig(initialEditorState.profileId, editingKey);
      if (!result.ok) {
        throw new Error(commandMessage(result.error));
      }
      setPageError(null);
      setEditorOpen(false);
      setEditingKey(null);
      setAdvancedOpen(false);
      onBack?.();
    } catch (nextError) {
      show(nextError instanceof Error ? nextError.message : String(nextError), 'negative', {
        key: 'model-config-delete-error',
        durationMs: null,
      });
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
        title={(
          <div className="hdr-title" data-testid="model-configuration-title">
            {editorOpen ? (editingExisting ? t.settings.editModelConfiguration : t.settings.createModelConfiguration) : t.settings.modelConfiguration}
          </div>
        )}
        onBack={() => {
          if (onBack) {
            onBack();
            return;
          }
          onNav('settings');
        }}
        rightSlot={editingExisting ? (
          <IconButton
            data-testid="model-configuration-delete-button"
            className="hdr-btn"
            hostClassName="hdr-btn-danger"
            quiet
            icon={<Icon name="trash" />}
            tooltip={t.common.delete}
            disabled={saveBusy}
            onClick={() => void remove()}
          />
        ) : undefined}
      />
      <div className="scroll scroll-footer-pad-detail">
        <div className="settings-detail-layout">
          {pageError ? (
            <section className="section generation-settings-section">
              <div className="status-warning-slot" data-testid="model-config-page-error">
                <StatusNotice tone="negative" message={pageError} copyText={pageError} />
              </div>
            </section>
          ) : null}
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
                disabled={saveBusy || editingExisting}
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
                    applyPreset(firstPreset, editingExisting ? 'edit' : 'create');
                    setPageError(null);
                  })().catch((nextError) => {
                    setPageError(nextError instanceof Error ? nextError.message : String(nextError));
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
                  ? selectedPreset.displayName
                  : t.settings.modelConfigValidationPreset}
                disabled={saveBusy}
                open={presetMenuOpen}
                onOpenChange={setPresetMenuOpen}
                options={presetOptions}
                selectedId={selectedPreset?.modelId ?? ''}
                onSelect={(value) => {
                  const preset = presets.find((item) => item.modelId === value);
                  applyPreset(preset, editingExisting ? 'edit' : 'create');
                  setPresetMenuOpen(false);
                }}
              />
            </div>
            <div className="field">
              <FieldLabel htmlFor="model-config-wire-model-id">{t.settings.modelConfigWireModelId}</FieldLabel>
              <ModelIdField
                id="model-config-wire-model-id"
                testId="model-config-wire-model-id"
                value={wireModelId}
                disabled={saveBusy}
                suspended={modelIdSuspended}
                onValue={setWireModelId}
              />
              <HelpText className="field-hint">{t.settings.modelConfigWireModelIdHint}</HelpText>
            </div>
            <div className={`provider-embedded-section model-config-advanced-section${advancedOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="model-config-advanced-toggle"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((current) => !current)}
              >
                <span className="model-config-advanced-toggle-copy">
                  <span className="section-title settings-section-heading model-config-advanced-toggle-title">
                    {t.settings.advancedSettings}
                  </span>
                </span>
                <Icon
                  name={advancedOpen ? 'chevron-down' : 'chevron-right'}
                  size={12}
                  className="model-config-advanced-toggle-icon"
                />
              </button>
              {advancedOpen ? (
                <>
                  <div className="field">
                    <FieldLabel htmlFor="model-config-model-id">{t.settings.modelConfigModelId}</FieldLabel>
                    <ModelIdField
                      id="model-config-model-id"
                      testId="model-config-model-id"
                      value={modelId}
                      disabled={saveBusy || editingExisting}
                      suspended={modelIdSuspended}
                      onValue={setModelId}
                    />
                  </div>
                  <StrategyMetaField
                    label={t.settings.modelConfigRequestStrategy}
                    value={requestStrategyId}
                    detail={t.settings.modelConfigManagedByPreset}
                  />
                </>
              ) : null}
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
        </div>
      </div>
      <footer className="det-footer">
        <div className="settings-detail-footer-inner">
          <div className="settings-detail-footer-actions">
            <HelpText className="settings-detail-footer-help">{t.settings.modelConfigurationSaveHint}</HelpText>
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
    </div>
  );
}

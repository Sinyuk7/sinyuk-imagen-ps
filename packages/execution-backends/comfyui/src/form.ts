import type {
  BoundedComfyUiApiWorkflow,
  BoundedComfyUiWorkflowDocument,
} from './graph.js';
import { isComfyUiFrontendNodeActive } from './graph.js';
import { deepFreeze, isPlainRecord, utf8ByteLength } from './internal/value.js';

const MAX_FORM_NODES = 2_000;
const MAX_WIDGETS_PER_NODE = 256;
const MAX_LABEL_BYTES = 1_024;
const MAX_STRING_BYTES = 65_536;
const MAX_COMBO_OPTIONS = 512;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Workflow value mutation 可安全携带的 primitive。 */
export type WorkflowPrimitiveValue = string | number | boolean;

/** 稳定定位 API input 或 Frontend widget 的引用。 */
export interface WorkflowInputRef {
  readonly nodeId: string;
  readonly inputName?: string;
  readonly widgetIndex?: number;
}

/** Format-neutral widget 分类。 */
export type WorkflowFormWidgetKind =
  | 'string'
  | 'multiline-string'
  | 'boolean'
  | 'number'
  | 'combo'
  | 'seed'
  | 'upload-image'
  | 'linked'
  | 'unsupported';

/** Format-neutral widget 与其 bounded metadata。 */
export interface WorkflowFormWidgetRef {
  readonly ref: WorkflowInputRef;
  readonly kind: WorkflowFormWidgetKind;
  readonly label: string;
  readonly workflowValue?: WorkflowPrimitiveValue;
  readonly writable: boolean;
  readonly visible: boolean;
  readonly order: number;
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

/** Format-neutral node section。 */
export interface WorkflowFormNode {
  readonly nodeId: string;
  readonly title: string;
  readonly label: string;
  readonly order: number;
  readonly active: boolean;
  readonly visible: boolean;
  readonly widgets: readonly WorkflowFormWidgetRef[];
}

/** Frontend/API converter 共用的 Form model。 */
export interface WorkflowForm {
  readonly nodes: readonly WorkflowFormNode[];
}

/** UI 可直接渲染的安全参数。 */
export interface WorkflowParameter {
  readonly ref: WorkflowInputRef;
  readonly kind: Exclude<WorkflowFormWidgetKind, 'upload-image' | 'linked' | 'unsupported'>;
  readonly label: string;
  readonly sectionLabel: string;
  readonly workflowValue: WorkflowPrimitiveValue;
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

/** Optional Composer input 的唯一 writable candidate。 */
export interface WorkflowInputCandidate {
  readonly ref: WorkflowInputRef;
  readonly kind: 'text' | 'image';
  readonly label: string;
  readonly sectionLabel: string;
  readonly workflowValue?: WorkflowPrimitiveValue;
}

/** Frontend Canvas converter 接受的 bounded source。 */
export interface ComfyUiFrontendFormSource {
  readonly nodes: readonly Readonly<Record<string, unknown>>[];
}

/** API `object_info` 的 bounded snapshot。 */
export type BoundedComfyUiObjectInfo = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/** Final send 时应用的 optional primitive mutation。 */
export interface ComfyUiWorkflowValueMutation {
  readonly ref: WorkflowInputRef;
  readonly value: WorkflowPrimitiveValue;
}

/** Format converter registry 的窄接口。 */
export interface WorkflowFormConverterRegistry {
  fromFrontend(source: ComfyUiFrontendFormSource | unknown): WorkflowForm;
  fromApi(graph: BoundedComfyUiApiWorkflow, objectInfo?: BoundedComfyUiObjectInfo): WorkflowForm;
}

function boundedText(value: unknown, maxBytes = MAX_LABEL_BYTES): value is string {
  return typeof value === 'string'
    && utf8ByteLength(value) <= maxBytes
    && !CONTROL_CHARS.test(value);
}

function boundedNodeId(value: unknown): value is string {
  return boundedText(value, 512) && value.length > 0;
}

function clonePrimitive(value: unknown): WorkflowPrimitiveValue | undefined {
  if (typeof value === 'string' && boundedText(value, MAX_STRING_BYTES)) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function isLink(value: unknown): boolean {
  return Array.isArray(value)
    && value.length === 2
    && (typeof value[0] === 'string' || Number.isSafeInteger(value[0]))
    && Number.isSafeInteger(value[1]);
}

function safeOptions(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_COMBO_OPTIONS) return undefined;
  const options = value.filter((item): item is string => boundedText(item, MAX_LABEL_BYTES));
  if (options.length !== value.length || new Set(options).size !== options.length) return undefined;
  return deepFreeze([...options]);
}

function finiteMetadata(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizedTitle(title: string): string {
  return title.startsWith('#') ? title.slice(1).trim() : title;
}

function exposedTitle(title: string): boolean {
  return title.startsWith('#') && normalizedTitle(title).length > 0;
}

function visibleEditor(kind: WorkflowFormWidgetKind): kind is WorkflowParameter['kind'] {
  return kind === 'string'
    || kind === 'multiline-string'
    || kind === 'boolean'
    || kind === 'number'
    || kind === 'combo'
    || kind === 'seed';
}

function makeWidget(input: {
  readonly ref: WorkflowInputRef;
  readonly kind: WorkflowFormWidgetKind;
  readonly label: string;
  readonly value: unknown;
  readonly writable: boolean;
  readonly exposed: boolean;
  readonly order: number;
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}): WorkflowFormWidgetRef {
  const workflowValue = clonePrimitive(input.value);
  const writable = input.writable
    && input.kind !== 'linked'
    && input.kind !== 'unsupported'
    && workflowValue !== undefined;
  return deepFreeze({
    ref: deepFreeze({ ...input.ref }),
    kind: input.kind,
    label: input.label,
    ...(workflowValue !== undefined ? { workflowValue } : {}),
    writable,
    visible: input.exposed && writable && visibleEditor(input.kind),
    order: input.order,
    ...(input.options !== undefined ? { options: input.options } : {}),
    ...(input.min !== undefined ? { min: input.min } : {}),
    ...(input.max !== undefined ? { max: input.max } : {}),
    ...(input.step !== undefined ? { step: input.step } : {}),
  });
}

function frontendWidgetKind(widget: Record<string, unknown>): WorkflowFormWidgetKind {
  const options = safeOptions(widget.options ?? widget.type);
  if (options !== undefined) return 'combo';
  const type = String(widget.type ?? '').toLowerCase();
  if (widget.imageUpload === true || type === 'image' || type === 'upload') return 'upload-image';
  if (type.includes('multiline') || type === 'customtext') return 'multiline-string';
  if (type === 'boolean' || type === 'toggle') return 'boolean';
  if (type === 'seed' || String(widget.name ?? '').toLowerCase().includes('seed')) return 'seed';
  if (type === 'number' || type === 'int' || type === 'float') return 'number';
  if (type === 'string' || type === 'text') return 'string';
  return 'unsupported';
}

/** Frontend Canvas nodes/widgets 转换为 format-neutral Form。 */
export function convertComfyUiFrontendWorkflowToForm(
  source: ComfyUiFrontendFormSource | unknown,
): WorkflowForm {
  if (!isPlainRecord(source) || !Array.isArray(source.nodes) || source.nodes.length > MAX_FORM_NODES) {
    throw new Error('invalid-frontend-form-source');
  }
  const nodes = source.nodes.map((rawNode, nodeOrder): WorkflowFormNode => {
    if (!isPlainRecord(rawNode)) throw new Error('invalid-frontend-form-source');
    const rawId = typeof rawNode.id === 'number' && Number.isSafeInteger(rawNode.id)
      ? String(rawNode.id)
      : rawNode.id;
    if (!boundedNodeId(rawId)) throw new Error('invalid-frontend-form-source');
    const title = boundedText(rawNode.title) ? rawNode.title : '';
    const active = isComfyUiFrontendNodeActive(rawNode);
    const exposed = active && exposedTitle(title) && !title.startsWith('.');
    const rawWidgets = rawNode.widgets;
    if (rawWidgets !== undefined && (!Array.isArray(rawWidgets) || rawWidgets.length > MAX_WIDGETS_PER_NODE)) {
      throw new Error('invalid-frontend-form-source');
    }
    const widgetsInput = Array.isArray(rawWidgets) ? rawWidgets : [];
    const nameCounts = new Map<string, number>();
    for (const rawWidget of widgetsInput) {
      if (isPlainRecord(rawWidget) && boundedText(rawWidget.name) && rawWidget.name.length > 0) {
        nameCounts.set(rawWidget.name, (nameCounts.get(rawWidget.name) ?? 0) + 1);
      }
    }
    const widgets = widgetsInput.map((rawWidget, widgetIndex) => {
      if (!isPlainRecord(rawWidget)) {
        return makeWidget({
          ref: { nodeId: rawId, widgetIndex },
          kind: 'unsupported',
          label: `Widget ${widgetIndex + 1}`,
          value: undefined,
          writable: false,
          exposed,
          order: widgetIndex,
        });
      }
      const name = boundedText(rawWidget.name) && rawWidget.name.length > 0
        ? rawWidget.name
        : `Widget ${widgetIndex + 1}`;
      const ref: WorkflowInputRef = nameCounts.get(name) === 1
        ? { nodeId: rawId, inputName: name }
        : { nodeId: rawId, widgetIndex };
      const kind = frontendWidgetKind(rawWidget);
      const options = safeOptions(rawWidget.options ?? rawWidget.type);
      return makeWidget({
        ref,
        kind,
        label: boundedText(rawWidget.label) && rawWidget.label.length > 0 ? rawWidget.label : name,
        value: rawWidget.value,
        writable: rawWidget.readOnly !== true && rawWidget.disabled !== true,
        exposed,
        order: widgetIndex,
        ...(options !== undefined ? { options } : {}),
        ...(finiteMetadata(rawWidget.min) !== undefined ? { min: Number(rawWidget.min) } : {}),
        ...(finiteMetadata(rawWidget.max) !== undefined ? { max: Number(rawWidget.max) } : {}),
        ...(finiteMetadata(rawWidget.step) !== undefined ? { step: Number(rawWidget.step) } : {}),
      });
    });
    return deepFreeze({
      nodeId: rawId,
      title,
      label: normalizedTitle(title),
      order: nodeOrder,
      active,
      visible: exposed && widgets.some((widget) => widget.visible),
      widgets,
    });
  });
  return deepFreeze({ nodes });
}

/** Bounded `object_info` snapshot。 */
export function admitComfyUiObjectInfo(value: unknown): BoundedComfyUiObjectInfo {
  if (!isPlainRecord(value) || Object.keys(value).length > MAX_FORM_NODES) {
    throw new Error('invalid-object-info');
  }
  const serialized = JSON.stringify(value);
  if (utf8ByteLength(serialized) > 2_000_000) throw new Error('invalid-object-info');
  for (const [classType, entry] of Object.entries(value)) {
    if (!boundedText(classType, 256) || classType.length === 0 || !isPlainRecord(entry)) {
      throw new Error('invalid-object-info');
    }
  }
  return deepFreeze(JSON.parse(serialized) as BoundedComfyUiObjectInfo);
}

function apiInputMetadata(
  objectInfo: BoundedComfyUiObjectInfo | undefined,
  classType: string,
  inputName: string,
): unknown {
  const entry = objectInfo?.[classType];
  if (!entry || !isPlainRecord(entry.input)) return undefined;
  for (const group of ['required', 'optional']) {
    const inputs = entry.input[group];
    if (isPlainRecord(inputs) && Object.prototype.hasOwnProperty.call(inputs, inputName)) {
      return inputs[inputName];
    }
  }
  return undefined;
}

function apiWidgetMetadata(
  inputName: string,
  value: unknown,
  metadata: unknown,
): {
  readonly kind: WorkflowFormWidgetKind;
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
} {
  if (isLink(value)) return { kind: 'linked' };
  if (!Array.isArray(metadata) || metadata.length === 0) return { kind: 'unsupported' };
  const declared = metadata[0];
  const config = isPlainRecord(metadata[1]) ? metadata[1] : {};
  const combo = safeOptions(declared);
  if (combo !== undefined) return { kind: 'combo', options: combo };
  const type = String(declared ?? '').toUpperCase();
  if (config.image_upload === true || config.imageUpload === true) return { kind: 'upload-image' };
  if (type === 'STRING') return { kind: config.multiline === true ? 'multiline-string' : 'string' };
  if (type === 'BOOLEAN' || type === 'BOOL') return { kind: 'boolean' };
  if (type === 'INT' || type === 'INTEGER' || type === 'FLOAT' || type === 'NUMBER') {
    const kind = inputName.toLowerCase().includes('seed') || config.control_after_generate !== undefined
      ? 'seed' as const
      : 'number' as const;
    return {
      kind,
      ...(finiteMetadata(config.min) !== undefined ? { min: Number(config.min) } : {}),
      ...(finiteMetadata(config.max) !== undefined ? { max: Number(config.max) } : {}),
      ...(finiteMetadata(config.step) !== undefined ? { step: Number(config.step) } : {}),
    };
  }
  return { kind: 'unsupported' };
}

/** API graph literal inputs 与 `object_info` 转换为 format-neutral Form。 */
export function convertComfyUiApiWorkflowToForm(
  graph: BoundedComfyUiApiWorkflow,
  objectInfo?: BoundedComfyUiObjectInfo,
): WorkflowForm {
  const nodes = Object.entries(graph).map(([nodeId, node], nodeOrder): WorkflowFormNode => {
    const meta = isPlainRecord(node._meta) ? node._meta : undefined;
    const title = boundedText(meta?.title) ? meta.title : '';
    const exposed = exposedTitle(title) && !title.startsWith('.');
    const widgets = Object.entries(node.inputs).map(([inputName, value], inputOrder) => {
      const metadata = apiWidgetMetadata(
        inputName,
        value,
        apiInputMetadata(objectInfo, node.class_type, inputName),
      );
      return makeWidget({
        ref: { nodeId, inputName },
        kind: metadata.kind,
        label: inputName,
        value,
        writable: metadata.kind !== 'linked' && metadata.kind !== 'unsupported',
        exposed,
        order: inputOrder,
        ...(metadata.options !== undefined ? { options: metadata.options } : {}),
        ...(metadata.min !== undefined ? { min: metadata.min } : {}),
        ...(metadata.max !== undefined ? { max: metadata.max } : {}),
        ...(metadata.step !== undefined ? { step: metadata.step } : {}),
      });
    });
    return deepFreeze({
      nodeId,
      title,
      label: normalizedTitle(title),
      order: nodeOrder,
      active: true,
      visible: exposed && widgets.some((widget) => widget.visible),
      widgets,
    });
  });
  return deepFreeze({ nodes });
}

/** 创建默认 Frontend/API Form converter registry。 */
export function createWorkflowFormConverterRegistry(): WorkflowFormConverterRegistry {
  return deepFreeze({
    fromFrontend: convertComfyUiFrontendWorkflowToForm,
    fromApi: convertComfyUiApiWorkflowToForm,
  });
}

/** 使用 locale numeric collation 投影可见参数。 */
export function projectWorkflowParameters(
  form: WorkflowForm,
  locale?: string,
): readonly WorkflowParameter[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const nodes = form.nodes
    .filter((node) => node.active && node.visible)
    .slice()
    .sort((left, right) => collator.compare(left.label, right.label) || left.order - right.order);
  const parameters: WorkflowParameter[] = [];
  for (const node of nodes) {
    for (const widget of node.widgets.slice().sort((left, right) => left.order - right.order)) {
      if (!widget.visible || !visibleEditor(widget.kind) || widget.workflowValue === undefined) continue;
      parameters.push(deepFreeze({
        ref: widget.ref,
        kind: widget.kind,
        label: widget.label,
        sectionLabel: node.label,
        workflowValue: widget.workflowValue,
        ...(widget.options !== undefined ? { options: widget.options } : {}),
        ...(widget.min !== undefined ? { min: widget.min } : {}),
        ...(widget.max !== undefined ? { max: widget.max } : {}),
        ...(widget.step !== undefined ? { step: widget.step } : {}),
      }));
    }
  }
  return deepFreeze(parameters);
}

function refKey(ref: WorkflowInputRef): string {
  return `${ref.nodeId}\u0000${ref.inputName ?? ''}\u0000${ref.widgetIndex ?? ''}`;
}

/** 生成唯一 writable text/upload-image candidates。 */
export function collectWorkflowInputCandidates(form: WorkflowForm): {
  readonly textCandidates: readonly WorkflowInputCandidate[];
  readonly imageCandidates: readonly WorkflowInputCandidate[];
} {
  const candidates: WorkflowInputCandidate[] = [];
  const counts = new Map<string, number>();
  for (const node of form.nodes) {
    if (!node.active) continue;
    for (const widget of node.widgets) {
      if (!widget.writable) continue;
      const kind = widget.kind === 'string' || widget.kind === 'multiline-string'
        ? 'text' as const
        : widget.kind === 'upload-image'
          ? 'image' as const
          : undefined;
      if (kind === undefined) continue;
      const key = refKey(widget.ref);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      candidates.push({
        ref: widget.ref,
        kind,
        label: widget.label,
        sectionLabel: node.label || node.title,
        ...(widget.workflowValue !== undefined ? { workflowValue: widget.workflowValue } : {}),
      });
    }
  }
  const unique = candidates.filter((candidate) => counts.get(refKey(candidate.ref)) === 1);
  return deepFreeze({
    textCandidates: unique.filter((candidate) => candidate.kind === 'text'),
    imageCandidates: unique.filter((candidate) => candidate.kind === 'image'),
  });
}

/** 校验 mutation ref 唯一、value primitive 且 target writable。 */
export function validateComfyUiWorkflowValueMutations(
  form: WorkflowForm,
  mutations: readonly ComfyUiWorkflowValueMutation[] | undefined,
): readonly ComfyUiWorkflowValueMutation[] {
  if (mutations === undefined) return deepFreeze([]);
  if (!Array.isArray(mutations) || mutations.length > 256) throw new Error('invalid-workflow-mutations');
  const writable = new Map<string, WorkflowFormWidgetRef[]>();
  for (const node of form.nodes) {
    if (!node.active) continue;
    for (const widget of node.widgets) {
      if (!widget.writable || widget.kind === 'linked' || widget.kind === 'unsupported') continue;
      const key = refKey(widget.ref);
      const current = writable.get(key) ?? [];
      current.push(widget);
      writable.set(key, current);
    }
  }
  const seen = new Set<string>();
  return deepFreeze(mutations.map((mutation) => {
    if (!isPlainRecord(mutation) || !isPlainRecord(mutation.ref)) throw new Error('invalid-workflow-mutations');
    const nodeId = mutation.ref.nodeId;
    const inputName = typeof mutation.ref.inputName === 'string' ? mutation.ref.inputName : undefined;
    const widgetIndex = typeof mutation.ref.widgetIndex === 'number' ? mutation.ref.widgetIndex : undefined;
    if (!boundedNodeId(nodeId) || (inputName !== undefined && !boundedText(inputName, MAX_LABEL_BYTES)) || (widgetIndex !== undefined && (!Number.isInteger(widgetIndex) || widgetIndex < 0))) throw new Error('invalid-workflow-mutations');
    const ref: WorkflowInputRef = { nodeId, ...(inputName !== undefined ? { inputName } : {}), ...(widgetIndex !== undefined ? { widgetIndex } : {}) };
    const key = refKey(ref);
    const target = writable.get(key);
    const value = clonePrimitive(mutation.value);
    if (seen.has(key) || target?.length !== 1 || value === undefined) throw new Error('invalid-workflow-mutations');
    seen.add(key);
    return deepFreeze({ ref: deepFreeze(ref), value });
  }));
}

/** API graph clone 上应用已验证 primitive mutations。 */
export function applyComfyUiApiWorkflowMutations(
  graph: BoundedComfyUiApiWorkflow,
  form: WorkflowForm,
  mutations: readonly ComfyUiWorkflowValueMutation[] | undefined,
): BoundedComfyUiApiWorkflow {
  const checked = validateComfyUiWorkflowValueMutations(form, mutations);
  const clone = JSON.parse(JSON.stringify(graph)) as Record<string, { class_type: string; inputs: Record<string, unknown>; [key: string]: unknown }>;
  for (const mutation of checked) {
    if (mutation.ref.inputName === undefined || mutation.ref.widgetIndex !== undefined) {
      throw new Error('invalid-workflow-mutations');
    }
    const node = clone[mutation.ref.nodeId];
    if (!node || !Object.prototype.hasOwnProperty.call(node.inputs, mutation.ref.inputName)) {
      throw new Error('invalid-workflow-mutations');
    }
    node.inputs[mutation.ref.inputName] = mutation.value;
  }
  return deepFreeze(clone);
}

/** workflow record 对应的默认 format-neutral Form。 */
export function convertComfyUiWorkflowDocumentToForm(
  workflowDocument: BoundedComfyUiWorkflowDocument,
  options: {
    readonly frontendSource?: ComfyUiFrontendFormSource;
    readonly objectInfo?: BoundedComfyUiObjectInfo;
  } = {},
): WorkflowForm {
  if (workflowDocument.kind === 'api') return convertComfyUiApiWorkflowToForm(workflowDocument.graph, options.objectInfo);
  return convertComfyUiFrontendWorkflowToForm(options.frontendSource ?? { nodes: workflowDocument.workflow.nodes });
}

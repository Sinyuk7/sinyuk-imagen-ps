import type {
  WorkflowForm,
  WorkflowInputCandidate,
  WorkflowInputRef,
  WorkflowPrimitiveValue,
  ComfyUiWorkflowValueMutation,
  ComfyUiComposerInputs,
  WorkflowMappingProjection,
  WorkflowMapping,
} from './types.js';

function refKey(ref: WorkflowInputRef): string {
  return `${ref.nodeId}\u0000${ref.inputName ?? ''}\u0000${ref.widgetIndex ?? ''}`;
}

function sameRef(left: WorkflowInputRef | null | undefined, right: WorkflowInputRef): boolean {
  return left !== null && left !== undefined && refKey(left) === refKey(right);
}

/** Candidate counts drive 0/1/many mapping disclosure. */
export function collectWorkflowInputCandidates(form: WorkflowForm): {
  readonly textCandidates: readonly WorkflowInputCandidate[];
  readonly imageCandidates: readonly WorkflowInputCandidate[];
} {
  const result: WorkflowInputCandidate[] = [];
  const seen = new Map<string, number>();
  for (const node of form.nodes) {
    if (!node.active) continue;
    for (const widget of node.widgets) {
      if (!widget.writable) continue;
      const kind = widget.kind === 'string' || widget.kind === 'multiline-string'
        ? 'text' as const
        : widget.kind === 'upload-image' ? 'image' as const : undefined;
      if (!kind) continue;
      const key = refKey(widget.ref); seen.set(key, (seen.get(key) ?? 0) + 1);
      result.push({ ref: widget.ref, kind, label: widget.label, sectionLabel: node.label || node.title, ...(widget.workflowValue === undefined ? {} : { workflowValue: widget.workflowValue }) });
    }
  }
  return {
    textCandidates: result.filter((item) => item.kind === 'text' && seen.get(refKey(item.ref)) === 1),
    imageCandidates: result.filter((item) => item.kind === 'image' && seen.get(refKey(item.ref)) === 1),
  };
}

/** Resolve auto mapping or revision-scoped explicit mapping. */
export function resolveWorkflowMapping(candidates: readonly WorkflowInputCandidate[], stored: WorkflowMapping | undefined): WorkflowMapping {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].ref;
  if (stored !== undefined && stored !== null && candidates.some((item) => sameRef(stored, item.ref))) return stored;
  return null;
}

/** Build user-facing mapping state and exact unused-input notices. */
export function projectWorkflowMapping(
  candidates: { readonly textCandidates: readonly WorkflowInputCandidate[]; readonly imageCandidates: readonly WorkflowInputCandidate[] },
  resolved: { readonly text: WorkflowMapping; readonly image: WorkflowMapping },
  composer: ComfyUiComposerInputs = {},
): WorkflowMappingProjection {
  const textAmbiguous = candidates.textCandidates.length > 1 && resolved.text === null;
  const imageAmbiguous = candidates.imageCandidates.length > 1 && resolved.image === null;
  const textNotice = candidates.textCandidates.length === 0
    ? composer.prompt?.trim() ? '此 Workflow 不使用当前提示词' : '此 Workflow 不接收提示词'
    : undefined;
  const imageNotice = candidates.imageCandidates.length === 0
    ? (composer.attachments?.length ?? 0) > 0 ? '此 Workflow 未识别到图片输入，附件不会发送' : '此 Workflow 不接收图片附件'
    : undefined;
  const manyNotice = candidates.imageCandidates.length > 0 && resolved.image !== null && (composer.attachments?.length ?? 0) > 1
    ? '此 Workflow 仅使用第一张附件' : undefined;
  return {
    ...candidates,
    text: { resolved: resolved.text, ambiguous: textAmbiguous, ...(textNotice === undefined ? {} : { notice: textNotice }) },
    image: {
      resolved: resolved.image,
      ambiguous: imageAmbiguous,
      ...((imageNotice ?? manyNotice) === undefined ? {} : { notice: imageNotice ?? manyNotice }),
    },
    showSection: textAmbiguous || imageAmbiguous || textNotice !== undefined || imageNotice !== undefined || manyNotice !== undefined,
  };
}

/** Apply fixed value precedence: saved < draft < non-empty prompt. */
export function composeWorkflowMutations(args: {
  readonly form: WorkflowForm;
  readonly draft?: Readonly<Record<string, WorkflowPrimitiveValue>>;
  readonly mapping: { readonly text: WorkflowMapping; readonly image: WorkflowMapping };
  readonly composer?: ComfyUiComposerInputs;
  readonly imageValue?: WorkflowPrimitiveValue;
}): readonly ComfyUiWorkflowValueMutation[] {
  const byRef = new Map<string, ComfyUiWorkflowValueMutation>();
  for (const parameter of args.form.nodes.flatMap((node) => node.widgets)) {
    if (!parameter.writable || parameter.workflowValue === undefined) continue;
    const key = refKey(parameter.ref);
    const draftValue = args.draft?.[key];
    byRef.set(key, { ref: parameter.ref, value: draftValue ?? parameter.workflowValue });
  }
  const prompt = args.composer?.prompt?.trim();
  if (prompt && args.mapping.text) byRef.set(refKey(args.mapping.text), { ref: args.mapping.text, value: prompt });
  if (args.mapping.image && args.imageValue !== undefined) byRef.set(refKey(args.mapping.image), { ref: args.mapping.image, value: args.imageValue });
  return [...byRef.values()];
}

/** Validate draft ref/value against current form without mutating source. */
export function applyWorkflowRuntimeDraft(form: WorkflowForm, draft: Readonly<Record<string, WorkflowPrimitiveValue>> | undefined): readonly ComfyUiWorkflowValueMutation[] {
  return composeWorkflowMutations({ form, draft, mapping: { text: null, image: null } });
}

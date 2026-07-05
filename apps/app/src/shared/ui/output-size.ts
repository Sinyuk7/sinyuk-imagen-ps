import { modelSupportsOutputSize, type ComposerOperation } from './composer-readiness';
import type { AppMessages } from './i18n/messages';
import type { AppOutputSizePreset } from '../ports/app-generation-settings';
import type { UiModelInfo } from './model-info';

export const OUTPUT_SIZE_PRESETS: readonly AppOutputSizePreset[] = ['512', '1k', '2k', '4k'];

export type OutputSizeSelectionContext =
  | {
      readonly kind: 'composer';
      readonly model: UiModelInfo | undefined;
      readonly operation: ComposerOperation;
    }
  | {
      readonly kind: 'no-composer-context';
    };

export type OutputSizeSelectionResult =
  | {
      readonly ok: true;
      readonly nextSize: AppOutputSizePreset;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

/** output size 只维护一套 label 规则，避免 main/settings 分叉。 */
export function outputSizeLabel(size: AppOutputSizePreset): string {
  return size === '512' ? '512' : size.toUpperCase();
}

export function canSelectOutputSize(
  context: OutputSizeSelectionContext,
  size: AppOutputSizePreset,
  t: AppMessages,
): OutputSizeSelectionResult {
  if (context.kind === 'no-composer-context') {
    return {
      ok: false,
      reason: t.settings.outputSizeRequiresMainComposerContext,
    };
  }
  if (modelSupportsOutputSize(context.model, context.operation, size) === 'unsupported') {
    return {
      ok: false,
      reason: t.main.modelReasonSizeUnsupported(outputSizeLabel(size)),
    };
  }
  return {
    ok: true,
    nextSize: size,
  };
}

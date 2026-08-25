import type {
  ImageAspectRatio,
  ImageModelCapability,
  ImageOutputCapability,
  ImageOutputMatrix,
  ImageSizePreset,
  UserModelOutputExposure,
} from '../../contract/image-model-capability.js';
import type { ProviderDefaultModelTemplate } from '../../contract/provider.js';
import { GEMINI_EDIT_INPUT_CAPABILITY } from '../../model-catalog/shared/matrix/edit-input-capabilities.js';
import { geminiGenerateContentImageConfigMatrix } from '../../model-catalog/shared/matrix/gemini-generate-content-output.js';
import { GPT_IMAGE_OUTPUT_CAPABILITY, GPT_OUTPUT_EXPOSURE, chatGptImageMatrix } from '../../model-catalog/shared/matrix/openai-gpt-image-2.js';

const GRSAI_OUTPUT_FORMATS = ['png'] as const;
const STANDARD_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'] as const satisfies readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[];
const NANO_BANANA_2_RATIOS = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'] as const satisfies readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[];
const GRSAI_RESOLUTIONS = ['1k', '2k', '4k'] as const satisfies readonly ImageSizePreset[];

function ratioOutputCapability(ratios: readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[]): ImageOutputCapability {
  return {
    geometry: {
      kind: 'ratio-resolution',
      defaultGeometry: { kind: 'provider-default' },
      aspectRatios: ratios,
      resolutions: GRSAI_RESOLUTIONS,
    },
    outputFormats: GRSAI_OUTPUT_FORMATS,
    defaultSelection: { geometry: { kind: 'provider-default' }, outputFormat: 'png' },
  };
}

function ratioExposure(ratios: readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[]): UserModelOutputExposure {
  return { kind: 'ratio-resolution', aspectRatios: ratios, resolutions: GRSAI_RESOLUTIONS, outputFormats: GRSAI_OUTPUT_FORMATS };
}

function ratioMatrices(ratios: readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[]): readonly ImageOutputMatrix[] {
  return [
    geminiGenerateContentImageConfigMatrix({ operation: 'text_to_image', sizes: GRSAI_RESOLUTIONS, ratios }),
    geminiGenerateContentImageConfigMatrix({ operation: 'image_edit', sizes: GRSAI_RESOLUTIONS, ratios }),
  ];
}

function ratioRule(args: { readonly id: string; readonly displayName: string; readonly ratios: readonly Exclude<ImageAspectRatio, 'auto' | 'source'>[]; readonly brand: 'google-gemini' | 'openai' }): ImageModelCapability {
  return {
    ruleId: `grsai-generate-${args.id}`,
    match: { ids: [args.id] },
    displayName: args.displayName,
    brand: args.brand,
    selection: { visibleInPicker: true, allowAsDefault: true },
    appliesToProviders: ['grsai-generate'],
    requestStrategyId: 'grsai-generate-image-config',
    outputCapability: ratioOutputCapability(args.ratios),
    outputExposure: ratioExposure(args.ratios),
    editInput: GEMINI_EDIT_INPUT_CAPABILITY,
    outputMatrix: ratioMatrices(args.ratios),
  };
}

function vipRule(): ImageModelCapability {
  return {
    ruleId: 'grsai-generate-gpt-image-2-vip',
    match: { ids: ['gpt-image-2-vip'] },
    displayName: 'GPT Image 2 VIP',
    brand: 'openai',
    selection: { visibleInPicker: true, allowAsDefault: true },
    appliesToProviders: ['grsai-generate'],
    requestStrategyId: 'grsai-generate-image-config',
    outputCapability: { ...GPT_IMAGE_OUTPUT_CAPABILITY, outputFormats: GRSAI_OUTPUT_FORMATS },
    outputExposure: { ...GPT_OUTPUT_EXPOSURE, outputFormats: GRSAI_OUTPUT_FORMATS, allowInputDerivedExactSize: false },
    editInput: GEMINI_EDIT_INPUT_CAPABILITY,
    outputMatrix: [chatGptImageMatrix('text_to_image'), chatGptImageMatrix('image_edit')].map((matrix) => ({
      ...matrix,
      outputFormats: matrix.outputFormats.filter((format) => format.id === 'png'),
      cells: matrix.cells.filter((cell) => cell.outputFormat === 'png'),
    })),
  };
}

export const GRSAI_GENERATE_MODEL_CAPABILITIES = Object.freeze([
  ratioRule({ id: 'nano-banana-fast', displayName: 'Nano Banana 2 Lite', ratios: NANO_BANANA_2_RATIOS, brand: 'google-gemini' }),
  ratioRule({ id: 'nano-banana-2', displayName: 'Nano Banana 2', ratios: NANO_BANANA_2_RATIOS, brand: 'google-gemini' }),
  ratioRule({ id: 'nano-banana-2-cl', displayName: 'Nano Banana 2 CL', ratios: NANO_BANANA_2_RATIOS, brand: 'google-gemini' }),
  ratioRule({ id: 'nano-banana-2-2k-cl', displayName: 'Nano Banana 2 2K CL', ratios: NANO_BANANA_2_RATIOS, brand: 'google-gemini' }),
  ratioRule({ id: 'nano-banana-2-4k-cl', displayName: 'Nano Banana 2 4K CL', ratios: NANO_BANANA_2_RATIOS, brand: 'google-gemini' }),
  ratioRule({ id: 'nano-banana-pro', displayName: 'Nano Banana Pro', ratios: STANDARD_RATIOS, brand: 'google-gemini' }),
  ratioRule({ id: 'nano-banana-pro-vt', displayName: 'Nano Banana Pro VT', ratios: STANDARD_RATIOS, brand: 'google-gemini' }),
  ratioRule({ id: 'nano-banana-pro-cl', displayName: 'Nano Banana Pro CL', ratios: STANDARD_RATIOS, brand: 'google-gemini' }),
  ratioRule({ id: 'nano-banana-pro-vip', displayName: 'Nano Banana Pro VIP', ratios: STANDARD_RATIOS, brand: 'google-gemini' }),
  ratioRule({ id: 'nano-banana-pro-4k-vip', displayName: 'Nano Banana Pro 4K VIP', ratios: STANDARD_RATIOS, brand: 'google-gemini' }),
  ratioRule({ id: 'gpt-image-2', displayName: 'GPT Image 2', ratios: STANDARD_RATIOS, brand: 'openai' }),
  vipRule(),
] as const satisfies readonly ImageModelCapability[]);

/** GRSAI 新 Profile 的默认模型。 */
export const GRSAI_DEFAULT_MODEL_ID = 'nano-banana-fast';

/** 从 GRSAI capability inventory 派生的完整 Profile 模型模板。 */
export const GRSAI_DEFAULT_MODEL_TEMPLATES = Object.freeze(
  GRSAI_GENERATE_MODEL_CAPABILITIES.map((capability): ProviderDefaultModelTemplate => {
    const modelId = capability.match.ids?.[0];
    if (!modelId) {
      throw new Error(`GRSAI model rule "${capability.ruleId}" requires an exact model id.`);
    }
    return { apiFormat: 'grsai', modelId, wireModelId: modelId, baseModelId: modelId };
  }),
);

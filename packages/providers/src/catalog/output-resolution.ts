import type { ProviderOutputOptions, ProviderResolvedOutput } from '../contract/request.js';
import { getProviderCatalogModel } from '../catalog.js';

/** 根据 JSON catalog 和 canonical output 选项生成 Provider wire 输出。 */
export function resolveCatalogProviderOutput(args: {
  readonly providerId: 'openai' | 'google-gemini' | 'grsai';
  readonly modelId: string;
  readonly operation?: 'text_to_image' | 'image_edit';
  readonly output?: ProviderOutputOptions;
  readonly inputContext?: { readonly primaryEditInput?: { readonly width: number; readonly height: number } };
}): ProviderResolvedOutput {
  const model = getProviderCatalogModel(args.providerId, args.modelId)
    ?? getProviderCatalogModel(args.providerId, args.modelId.replace(/^models\//, ''));
  if (!model) throw new Error(`Unknown catalog model "${args.modelId}" for provider "${args.providerId}".`);
  const output = args.output ?? {};
  const selection = output.selection?.geometry;
  const sizePreset = output.sizePreset ?? (selection?.kind === 'ratio-resolution' ? selection.resolution : undefined);
  const format = output.outputFormat ?? output.selection?.outputFormat;
  if (args.providerId === 'openai') {
    let size: string | undefined;
    if (selection?.kind === 'pixels') size = `${selection.width}x${selection.height}`;
    else if (selection?.kind === 'input-derived' || (sizePreset as string) === 'use-input-size') {
      const input = args.inputContext?.primaryEditInput;
      if (input) size = `${input.width}x${input.height}`;
    } else if (sizePreset && (sizePreset as string) !== 'auto') size = sizePreset;
    return { kind: 'openai', ...(size ? { size } : {}), ...(format ? { outputFormat: format } : {}) };
  }
  if (args.providerId === 'google-gemini') {
    const geometry = selection?.kind === 'ratio-resolution' ? selection : undefined;
    return { kind: 'google-gemini', imageConfig: { ...(geometry?.aspectRatio ? { aspectRatio: geometry.aspectRatio } : {}), ...(geometry?.resolution ? { imageSize: geometry.resolution.toUpperCase() } : sizePreset && (sizePreset as string) !== 'auto' ? { imageSize: sizePreset.toUpperCase() } : {}) } };
  }
  const geometry = selection?.kind === 'ratio-resolution' ? selection : undefined;
  return { kind: 'grsai', ...(geometry?.aspectRatio ? { aspectRatio: geometry.aspectRatio } : output.aspectRatio ? { aspectRatio: output.aspectRatio } : {}), ...(sizePreset && (sizePreset as string) !== 'auto' ? { imageSize: sizePreset.toUpperCase() as '1K' | '2K' | '4K' } : {}) };
}

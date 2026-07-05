import {
  resolveImageModelOutput,
  type ImageAspectRatio,
  type ImageCatalogProviderId,
  type ImageOperation,
  type ImageOutputFormat,
  type ImageOutputImageSize,
} from '../src/contract/index.js';
import type { ProviderOutputOptions, ProviderResolvedOutput } from '../src/contract/request.js';

export function resolvedOutputFor(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly operation: ImageOperation;
  readonly imageSize?: ImageOutputImageSize;
  readonly ratio?: ImageAspectRatio;
  readonly outputFormat?: ImageOutputFormat;
}): ProviderResolvedOutput {
  const resolved = resolveImageModelOutput({
    providerId: args.providerId,
    modelId: args.modelId,
    operation: args.operation,
    output: {
      sizePreset: args.imageSize === 'auto' ? undefined : args.imageSize,
      aspectRatio: args.ratio,
      outputFormat: args.outputFormat,
    },
  });
  if (resolved.requestOutput === undefined) {
    throw new Error(`Missing requestOutput for ${args.providerId}/${args.modelId}/${args.operation}.`);
  }
  return resolved.requestOutput;
}

export function outputWithResolvedRequest(args: {
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly operation: ImageOperation;
  readonly imageSize?: ImageOutputImageSize;
  readonly ratio?: ImageAspectRatio;
  readonly outputFormat?: ImageOutputFormat;
  readonly output?: Omit<ProviderOutputOptions, 'requestOutput' | 'sizePreset' | 'aspectRatio' | 'outputFormat'>;
}): ProviderOutputOptions {
  return {
    ...(args.output ?? {}),
    ...(args.imageSize !== undefined && args.imageSize !== 'auto' ? { sizePreset: args.imageSize } : {}),
    ...(args.ratio !== undefined ? { aspectRatio: args.ratio } : {}),
    ...(args.outputFormat !== undefined ? { outputFormat: args.outputFormat } : {}),
    requestOutput: resolvedOutputFor(args),
  };
}

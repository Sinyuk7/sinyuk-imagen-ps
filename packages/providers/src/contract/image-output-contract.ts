/** 当前阶段支持的 image operation。 */
export type ImageOperation = 'text_to_image' | 'image_edit';

/** 输出格式 canonical contract。 */
export type ImageOutputFormat = 'png' | 'jpeg' | 'webp';

/** UI 暴露的输出尺寸入口标识。 */
export type ImageOutputSizeOptionId = 'auto' | 'use-input-size' | '512' | '1k' | '2k' | '4k';

/** 兼容旧 consumer 的尺寸入口类型名。 */
export type ImageOutputImageSize = ImageOutputSizeOptionId;

/** 原生比例维度。 */
export type ImageAspectRatio =
  | 'auto'
  | 'source'
  | '1:1'
  | '1:4'
  | '1:8'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:1'
  | '4:3'
  | '4:5'
  | '5:4'
  | '8:1'
  | '9:16'
  | '16:9'
  | '21:9';

/** 像素尺寸。 */
export interface PixelDimensions {
  readonly width: number;
  readonly height: number;
}

/** 用户选择的输出几何意图。 */
export type ImageOutputGeometrySelection =
  | { readonly kind: 'provider-default' }
  | ({ readonly kind: 'pixels' } & PixelDimensions)
  | {
      readonly kind: 'ratio-resolution';
      readonly aspectRatio: Exclude<ImageAspectRatio, 'auto' | 'source'>;
      readonly resolution: Exclude<ImageOutputSizeOptionId, 'auto' | 'use-input-size'>;
    }
  | {
      readonly kind: 'input-derived';
      readonly mode: 'exact-size';
    };

/** Canonical 输出选择：几何意图 + 输出格式。 */
export interface ImageOutputSelection {
  readonly geometry: ImageOutputGeometrySelection;
  readonly outputFormat: ImageOutputFormat;
}

/** UI 选项公共 shape。 */
export interface ImageOutputOption<T extends string = string> {
  readonly id: T;
  readonly label: string;
  readonly hint?: string;
  readonly editOnly?: boolean;
}

/** operation 归一化后的输出选择。 */
export interface EffectiveImageOutputSelection {
  readonly storedSelection: ImageOutputSelection;
  readonly effectiveSelection: ImageOutputSelection;
  readonly visibleSizeId: ImageOutputSizeOptionId;
  readonly normalized: boolean;
}

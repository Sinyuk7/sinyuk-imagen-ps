/**
 * Host-agnostic asset 资源类型。
 *
 * 不引用 DOM、UXP 或 Photoshop 专有类型。
 */

/** 支持的 asset 类别。 */
export type AssetType = 'image';

/** engine 产出或消费的 serializable、host-agnostic 资源。
 *
 *  二进制数据可由 Base64 string 或 Uint8Array 表示，
 *  具体取决于 adapter 契约；engine 将其视为 opaque。
 */
export interface Asset {
  /** Asset 类别。 */
  readonly type: AssetType;

  /** 可选的可读标签或文件名。 */
  readonly name?: string;

  /** asset 由外部托管时的 URL 引用。 */
  readonly url?: string;

  /** asset 内联时的二进制或文本数据。
   *
   *  具体表示形式（Base64 string vs. Uint8Array）由 adapter 边界决定，
   *  不由 engine 决定。
   */
  readonly data?: string | Uint8Array;

  /** 可选的 MIME type 提示。 */
  readonly mimeType?: string;
}

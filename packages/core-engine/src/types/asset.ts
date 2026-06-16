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
 *
 *  引用通道（三者互不排斥、可并存）：
 *  - `url`：外部可访问的 URL。
 *  - `data`：内联 base64 string 或 `Uint8Array` 二进制数据。
 *  - `fileId`：上游文件存储（例如 OpenAI File API）返回的 opaque identifier；
 *    其语义、生命周期、鉴权细节由 provider 层解释，engine 仅将其视为字符串。
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

  /** 可选的上游 file storage 引用（opaque identifier）。
   *
   *  仅用于 provider 层识别已上传文件的 id；engine 不解释其内容，
   *  也不负责上传或下载。provider transport 层按上游契约将其
   *  映射为例如 `{ file_id: ... }` 的请求字段。
   */
  readonly fileId?: string;
}

# UXP Interface Notes

> Archived reference: this is historical UXP API research, not current app
> implementation authority. Current app authority lives in `apps/app/SPEC.md`,
> `apps/app/STATUS.md`, `apps/app/AGENTS.md`, and `docs/TESTING.md`.

下面按 **“可直接落到 HostBridge 实现”** 的粒度整理。结论先说：`getPixels` 只读 RGB/灰度像素；**读蒙版不要用 `getPixels`，用 `imaging.getLayerMask()`**；写回“生成好的图片文件”优先走 **UXP File → session token → `batchPlay placeEvent` → `executeAsModal`**，`putPixels` 更适合你已经有 raw buffer / `PhotoshopImageData` 的情况。

---

## **1. `require("photoshop").imaging`**

### **1.1 `getPixels(options)`**

**签名**

```js
const { imaging } = require("photoshop");
const result = await imaging.getPixels(options);
```

**options 字段**

```ts
type GetPixelsOptions = {
  documentID?: number;       // 不传或负数 = active document
  layerID?: number;          // 不传 = document composite；传入 = 指定 layer
  historyStateID?: number;   // 从指定 history state 读取
  sourceBounds?: {
    left: number;
    top: number;
    right?: number;
    bottom?: number;
    width?: number;
    height?: number;
  };
  targetSize?: {
    width?: number;
    height?: number;
  };
  colorSpace?: string;
  colorProfile?: string;
  componentSize?: -1 | 8 | 16 | 32; // -1 / omitted = source depth
  applyAlpha?: boolean;      // true: alpha 合成到白底，返回 RGB，不带 alpha
};
```

**返回结构**

```ts
type GetPixelsResult = {
  imageData: PhotoshopImageData;
  sourceBounds: { left: number; top: number; right: number; bottom: number };
  level: number; // pyramid cache level
};
```

**拿原始 buffer**

```js
const result = await imaging.getPixels({
  documentID: app.activeDocument.id,
  layerID: app.activeDocument.activeLayers[0].id,
  componentSize: 8,
  applyAlpha: false,
});

const typed = await result.imageData.getData({ chunky: true });
// Uint8Array / Uint16Array / Float32Array，取决于 componentSize
const rawArrayBuffer = typed.buffer.slice(
  typed.byteOffset,
  typed.byteOffset + typed.byteLength
);

result.imageData.dispose();
```

官方文档确认：`getPixels` 返回 `{ imageData, sourceBounds, level }`；`documentID/layerID/sourceBounds/targetSize/colorSpace/colorProfile/componentSize/applyAlpha` 均是当前文档列出的 options。`getData()` 返回按 `componentSize` 决定的 typed array。([Adobe Developer][1])

---

### **1.2 `putPixels(options)`**

**签名**

```js
await imaging.putPixels(options);
```

**options 字段**

```ts
type PutPixelsOptions = {
  documentID?: number;             // 不传或负数 = active document
  layerID: number;                 // 必填：目标 pixel layer
  imageData: PhotoshopImageData;   // 必填
  replace?: boolean;               // 默认 true
  targetBounds?: {
    left: number;
    top: number;
    // width / height 会被忽略
  };
  commandName?: string;
};
```

**说明**

* `putPixels` 是“把 `PhotoshopImageData` 写入已有 pixel layer”的 API。
* 它不是“把 PNG/JPEG 文件导入成新图层”的高层 API。
* 如果用于生成图回写，通常要先 `document.createLayer()` / `createPixelLayer()`，再 `putPixels()`。

官方 `putPixels` 文档明确要求 `layerID` 和 `imageData`，`targetBounds` 只使用 `left/top`，`replace` 默认 `true`。([Adobe Developer][1])

---

### **1.3 `encodeImageData(options)`**

**签名**

```js
const encoded = await imaging.encodeImageData(options);
```

**options 字段**

```ts
type EncodeImageDataOptions = {
  imageData: PhotoshopImageData; // 必填；colorSpace 必须是 RGB
  base64?: boolean;              // true 时返回 base64 string
};
```

**返回**

```ts
Promise<number[] | string>
```

**格式能力核实**

* 支持 `base64` 输出。
* 当前官方文档只明确写了 **JPEG / base64** 用途，并示例为：

```js
const jpegData = await imaging.encodeImageData({ imageData, base64: true });
const src = "data:image/jpeg;base64," + jpegData;
```

* 文档没有列出 `format: "png" | "jpeg"` 这样的参数；因此不能把它设计成通用 PNG/JPEG encoder abstraction。更稳妥的命名是 `encodeImageDataToJpegBase64()` 或把格式能力标注为“Adobe docs only document JPEG base64 path”。

来源：Adobe `encodeImageData` 说明当前 UXP image element 需要使用 `jpeg/base64`，并列出 `base64?: Boolean` 和返回 `Number[] | string`。([Adobe Developer][1])

---

### **1.4 `createImageDataFromBuffer(buffer, options)`**

**签名**

```js
const imageData = await imaging.createImageDataFromBuffer(arrayBuffer, options);
```

**options 字段**

```ts
type CreateImageDataFromBufferOptions = {
  width: number;           // 必填
  height: number;          // 必填
  components: number;      // 必填，例如 RGB=3, RGBA=4, mask=1
  chunky?: boolean;        // 默认 true
  colorProfile?: string;
  colorSpace: string;      // 必填，例如 "RGB" / "Grayscale"
  fullRange?: boolean;     // 16-bit 时有效，默认 false
};
```

**说明**

* buffer / typed array 类型决定 `componentSize`：`Uint8Array` → 8-bit，`Uint16Array` → 16-bit，`Float32Array` → 32-bit。
* buffer 元素数量必须等于 `width * height * components`。
* 用完后应 `imageData.dispose()`。

官方文档给出的签名是 `createImageDataFromBuffer(arrayBuffer, options)`，并列出 `width/height/components/chunky/colorProfile/colorSpace/fullRange`。([Adobe Developer][1])

---

### **1.5 `PhotoshopImageData` 对象**

**核心属性**

```ts
type PhotoshopImageData = {
  width: number;
  height: number;
  colorSpace: "RGB" | "Grayscale" | "Lab";
  colorProfile: string;
  hasAlpha: boolean;
  components: number;
  componentSize: 8 | 16 | 32;
  pixelFormat:
    | "RGB"
    | "RGBA"
    | "Grayscale"
    | "GrayscaleAlpha"
    | "LAB"
    | "LABAlpha";
  isChunky: boolean;
  type: "image/uncompressed";

  getData(options?: {
    chunky?: boolean;
    fullRange?: boolean;
  }): Promise<Uint8Array | Uint16Array | Float32Array>;

  dispose(): void;
};
```

**一句话说明**

* `PhotoshopImageData` 是 UXP Imaging 的 raw pixel container；`getData()` 取 typed array，`dispose()` 释放 Photoshop 侧内存，不应长期持有。([Adobe Developer][1])

---

## **2. 读图层蒙版像素**

### **2.1 `getPixels` 不能靠 `type/channel` 读 mask**

当前 `getPixels(options)` 官方 options 中没有 `type`、`channel`、`mask` 之类字段；它面向 document / layer 像素或 composite 像素。读 layer mask 应使用单独 API：`imaging.getLayerMask()`。([Adobe Developer][1])

---

### **2.2 `getLayerMask(options)`**

**签名**

```js
const maskObj = await imaging.getLayerMask(options);
```

**options 字段**

```ts
type GetLayerMaskOptions = {
  documentID?: number;
  layerID: number;
  kind?: "user" | "vector"; // 默认 "user"
  sourceBounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  targetSize?: {
    width?: number;
    height?: number;
  };
};
```

**返回**

```ts
type GetLayerMaskResult = {
  imageData: PhotoshopImageData; // user mask 为 single-channel grayscale
  sourceBounds: { left: number; top: number; right: number; bottom: number };
};
```

**结论**

* pixel layer mask：可读，`kind: "user"`。
* vector mask：`getLayerMask` 的 `kind` 允许 `"vector"`，因此可按 mask 像素结果读取；但这不是读取 vector path geometry。
* 写回 mask：`putLayerMask()` 官方只接受 `kind: "user"`，也就是只能写 pixel mask，不能用它写 vector mask。([Adobe Developer][1])

---

## **3. `Layer` / `Document.layers`**

### **3.1 Layer 关键属性核实**

注意：你列的属性里有些不是只读，Adobe DOM 文档标了 Access。

| 属性                        | Access | 类型 / 说明                            |
| ------------------------- | -----: | ---------------------------------- |
| `layer.name`              |    R/W | 图层名                                |
| `layer.id`                |      R | layer ID，可用于 `batchPlay` / imaging |
| `layer.kind`              |      R | `constants.LayerKind`              |
| `layer.bounds`            |      R | bounds，包含 effects                  |
| `layer.visible`           |    R/W | 是否可见                               |
| `layer.opacity`           |    R/W | 0–100                              |
| `layer.blendMode`         |    R/W | `constants.BlendMode`              |
| `layer.layers`            |      R | group layer 内部 children layers     |
| `layer.layerMaskDensity`  |    R/W | pixel mask density                 |
| `layer.layerMaskFeather`  |    R/W | pixel mask feather                 |
| `layer.vectorMaskDensity` |    R/W | vector mask density                |
| `layer.vectorMaskFeather` |    R/W | vector mask feather                |

来源：Adobe `Layer` class property table。([Adobe Developer][2])

---

### **3.2 `LayerKind` 枚举值**

当前官方 `constants.LayerKind` 包括：

```ts
BLACKANDWHITE
BRIGHTNESSCONTRAST
CHANNELMIXER
CLARITY
COLORBALANCE
COLORLOOKUP
CURVES
EXPOSURE
GRADIENTFILL
GRADIENTMAP
GRAIN
GROUP
HUESATURATION
INVERSION
LAYER3D
LEVELS
NORMAL
PATTERNFILL
PHOTOFILTER
POSTERIZE
SELECTIVECOLOR
SMARTOBJECT
SOLIDFILL
TEXT
THRESHOLD
VIBRANCE
VIDEO
```

其中 `NORMAL` 是 raster pixel layer，`GROUP` 是 group layer，`SMARTOBJECT` 是 smart object layer，`TEXT` 是 text layer；`CLARITY` / `GRAIN` 是文档中标注较新的 adjustment 类型。([Adobe Developer][3])

---

### **3.3 是否有“判断 layer mask 存在”的 DOM 属性？**

官方 `Layer` class 页面没有列出类似 `hasLayerMask` / `hasUserMask` / `hasVectorMask` 的直接布尔属性；可见的是 `layerMaskDensity/layerMaskFeather` 与 `vectorMaskDensity/vectorMaskFeather`。实际 HostBridge 里建议：

```js
async function tryReadUserMask(layerID) {
  try {
    return await imaging.getLayerMask({ layerID, kind: "user" });
  } catch {
    return null;
  }
}
```

如果你需要无副作用 preflight，可以用 `batchPlay` 读取 layer descriptor 判断 mask metadata，但这已经不是 Layer DOM 的 typed property。Layer DOM 文档只暴露 mask density / feather 相关属性。([Adobe Developer][2])

---

### **3.4 `Document.layers` 与嵌套 group 遍历**

`Document.layers` 只返回 document 顶层 layers；group layer 的 children 在 `layer.layers`。递归遍历建议：

```js
function walkLayers(layers, visit) {
  for (const layer of layers) {
    visit(layer);

    if (layer.kind === constants.LayerKind.GROUP && layer.layers) {
      walkLayers(layer.layers, visit);
    }
  }
}

const { app, constants } = require("photoshop");
walkLayers(app.activeDocument.layers, (layer) => {
  console.log(layer.id, layer.name, layer.kind);
});
```

官方文档确认 `Document.layers` 是 layer/group hierarchy 的顶层 layers，group layer 通过 `.layers` 访问内部 layers。([Adobe Developer][4])

---

## **4. `core.executeAsModal()`**

### **4.1 签名**

```js
const { core } = require("photoshop");

await core.executeAsModal(
  async (executionContext, descriptor) => {
    // modal work
  },
  {
    commandName: "Your command name",
    descriptor: { optional: "payload" },
    interactive: false,
    timeOut: 1000,
  }
);
```

**类型**

```ts
executeAsModal(
  targetFunction: (
    executionContext: ExecutionContext,
    descriptor?: object
  ) => Promise<any>,
  options: {
    commandName: string;
    descriptor?: object;
    interactive?: boolean;
    timeOut?: number;
  }
): Promise<void>
```

官方方法页给出的签名是 `executeAsModal(targetFunction, options)`，`targetFunction` 接收 `executionContext` 和可选 descriptor；options 包括 `commandName/descriptor/interactive/timeOut`。([Adobe Developer][5])

---

### **4.2 为什么文档变更必须包在里面？**

Adobe 的说明是：当 plugin 修改 Photoshop state 时必须进入 modal state，否则外部事件、其他插件或用户操作可能同时修改 Photoshop，导致状态不稳定；进入 modal 后该 plugin 获得 Photoshop 控制权。文档还明确写到：任何修改 document 或 application state 的 command 都要使用 `executeAsModal`。([Adobe Developer][6])

---

### **4.3 `commandName` 用法**

`commandName` 会作为 Photoshop progress bar / operation name 显示；长任务中还可以用 `executionContext.reportProgress({ value, commandName })` 更新进度文本。([Adobe Developer][6])

---

## **5. 回写生成图到当前文档：推荐路径**

### **结论**

| 场景                                        | 推荐 API                                                                                     | 原因                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 已经有 PNG/JPEG/WebP 等生成图片文件，要放进当前 PSD 成为新图层 | **`batchPlay placeEvent` + `localFileSystem.createSessionToken(file)` + `executeAsModal`** | 这是“文件资产 → 当前文档 layer stack”的最自然路径；DOM 没有稳定 typed `placeEmbedded()`；Adobe 建议 DOM 不覆盖的能力用 `batchPlay` |
| 已经有 raw RGBA/RGB buffer，要写到指定 pixel layer | `createImageDataFromBuffer()` + `putPixels()`                                              | 不需要落盘/解码文件，但你要自己处理尺寸、色彩、alpha、目标 layer                                                              |
| 想把生成图打开为独立文档                              | `app.open(file)` / document open flow                                                      | 不是“回写当前文档”                                                                                          |

官方依据：`batchPlay` 是 Photoshop action descriptor 级高级 API，用于 DOM 未覆盖能力；`createSessionToken` 用于把 UXP File 传给 host-specific API；修改文档 state 必须包在 `executeAsModal`；`putPixels` 明确是写 `PhotoshopImageData` 到指定 pixel layer。([Adobe Developer][7])

---

### **5.1 推荐代码：生成图片文件 → place embedded 新图层**

```js
const { action, core } = require("photoshop");
const { storage } = require("uxp");
const fs = storage.localFileSystem;
const formats = storage.formats;

async function placeGeneratedPng(arrayBuffer, filename = "generated.png") {
  // 1. 写入 UXP temp file
  const file = await fs.createEntryWithUrl(`plugin-temp:/${filename}`, {
    overwrite: true,
  });

  await file.write(arrayBuffer, { format: formats.binary });

  // 2. 创建 Photoshop host 可用的 session token
  const token = fs.createSessionToken(file);

  // 3. place embedded 必须在 modal 中执行
  await core.executeAsModal(
    async () => {
      await action.batchPlay(
        [
          {
            _obj: "placeEvent",
            null: {
              _path: token,
              _kind: "local",
            },
            linked: false,
            _options: {
              dialogOptions: "dontDisplay",
            },
          },
        ],
        {}
      );
    },
    { commandName: "Place generated image" }
  );
}
```

工程注意：`placeEvent` 的 descriptor 细节最好用 Alchemist / action recording 对目标 Photoshop 版本再校准；但 **File → session token → batchPlay → executeAsModal** 这条链路是官方文档可支撑的实现方向。`createEntryWithUrl()` 可创建 `plugin-temp:/...` entry；`File.write()` 支持 binary；`createSessionToken()` 适合传给 Photoshop host API。([Adobe Developer][8])

---

### **5.2 备选代码：raw buffer → 新 pixel layer → `putPixels`**

```js
const { app, imaging, constants, core } = require("photoshop");

async function writeRawRgbaToNewLayer({
  rgbaUint8,
  width,
  height,
  left = 0,
  top = 0,
  name = "Generated Pixels",
}) {
  await core.executeAsModal(
    async () => {
      const doc = app.activeDocument;

      const layer = await doc.createLayer(constants.LayerKind.NORMAL, {
        name,
      });

      const imageData = await imaging.createImageDataFromBuffer(rgbaUint8, {
        width,
        height,
        components: 4,
        chunky: true,
        colorSpace: "RGB",
        colorProfile: "sRGB IEC61966-2.1",
      });

      try {
        await imaging.putPixels({
          documentID: doc.id,
          layerID: layer.id,
          imageData,
          replace: true,
          targetBounds: { left, top },
          commandName: "Write generated pixels",
        });
      } finally {
        imageData.dispose();
      }
    },
    { commandName: "Create generated pixel layer" }
  );
}
```

这条路径适合核心服务返回的是 raw RGBA buffer；如果核心服务返回的是图片文件或远端 URL 资产，优先不要强行解码成 raw pixel。`Document.createLayer()` 可创建 pixel layer，`createImageDataFromBuffer()` 可从 typed buffer 构造 `PhotoshopImageData`，`putPixels()` 写入指定 layer。([Adobe Developer][4])

---

## **6. `require("uxp").storage.secureStorage`**

### **签名**

```js
const { secureStorage } = require("uxp").storage;

await secureStorage.setItem(key, value);
const value = await secureStorage.getItem(key);
await secureStorage.removeItem(key);
```

**类型**

```ts
secureStorage.setItem(
  key: string,
  value: string | ArrayBuffer | TypedArray
): Promise<void>;

secureStorage.getItem(
  key: string
): Promise<Uint8Array>;

secureStorage.removeItem(
  key: string
): Promise<void>;
```

**是否加密**

* value 会在存储前加密。
* key 不加密。
* Adobe 文档强调它是 per-plugin protected storage，但不是用来对当前操作系统用户绝对保密；数据也可能因为 OS/user/插件状态变化而丢失，因此更像“安全缓存”，不要假设永久可靠。

**用于 provider API key 的建议**

```js
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function saveApiKey(provider, apiKey) {
  await secureStorage.setItem(
    `provider:${provider}:apiKey`,
    encoder.encode(apiKey)
  );
}

async function loadApiKey(provider) {
  const data = await secureStorage.getItem(`provider:${provider}:apiKey`);
  return data ? decoder.decode(data) : null;
}

async function removeApiKey(provider) {
  await secureStorage.removeItem(`provider:${provider}:apiKey`);
}
```

来源：Adobe `secureStorage` 文档明确写 value encrypted before storing，且列出 `setItem/getItem/removeItem` 签名。([Adobe Developer][9])

---

## **7. `require("uxp").storage.localFileSystem`**

### **7.1 `getFileForSaving()`**

**签名**

```js
const file = await fs.getFileForSaving(suggestedName, options);
```

**常用**

```js
const { localFileSystem: fs, formats } = require("uxp").storage;

const file = await fs.getFileForSaving("generated.png", {
  types: ["png"],
});

if (file) {
  await file.write(arrayBuffer, { format: formats.binary });
}
```

`getFileForSaving()` 返回用户选择的 writable `File`，取消时返回 `null`；`File.write()` 支持 `string | ArrayBuffer`，二进制写入用 `formats.binary`。([Adobe Developer][8])

---

### **7.2 `getFileForOpening()`**

**签名**

```js
const fileOrFiles = await fs.getFileForOpening(options);
```

**常用**

```js
const { localFileSystem: fs, fileTypes } = require("uxp").storage;

const file = await fs.getFileForOpening({
  types: fileTypes.images,
  allowMultiple: false,
});
```

options 包括 `types`、`allowMultiple`、`initialDomain`、`initialLocation`；`allowMultiple: true` 时返回 `File[]`，否则返回单个 `File`。([Adobe Developer][8])

---

### **7.3 `createEntryWithUrl()`**

**签名**

```js
const entry = await fs.createEntryWithUrl(url, options);
```

**常用**

```js
const file = await fs.createEntryWithUrl("plugin-temp:/generated.png", {
  overwrite: true,
});

await file.write(arrayBuffer, { format: formats.binary });
```

说明：适合 plugin temp / data folder 下创建临时资产；文档说明 file entry 的真实文件会在 `write()` 时创建。([Adobe Developer][8])

---

### **7.4 session token vs persistent token**

```js
const sessionToken = fs.createSessionToken(file);

const persistentToken = await fs.createPersistentToken(folderOrFile);
const entry = await fs.getEntryForPersistentToken(persistentToken);
```

**区别**

* `createSessionToken(entry)`：当前插件 session 内有效，适合传给 Photoshop host-specific API，例如 `batchPlay` 的 `_path`。
* `createPersistentToken(entry)`：跨 session 保存对 file/folder 的引用；但 Adobe 文档明确说不保证永久有效，文件移动、权限变化、OS 限制都可能导致失效。
* `getEntryForPersistentToken(token)`：恢复 entry；失败时应重新让用户选择 folder/file 并刷新 token。

来源：Adobe FileSystemProvider 文档对 session token / persistent token / restore token 的说明。([Adobe Developer][8])

---

## **8. 可直接放进 `INTEGRATION_DESIGN.md` 的 UXP 映射表**

| HostBridge 阶段 | 能力                          | UXP / Photoshop API                                                       | 设计建议                                                 |
| ------------- | --------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| `read`        | 读当前 layer RGB/RGBA 像素       | `imaging.getPixels()` → `imageData.getData()`                             | 返回 `Asset` 或 raw pixel payload；用完 `dispose()`        |
| `read`        | 读 pixel layer mask          | `imaging.getLayerMask({ kind: "user" })`                                  | 不要伪装成 `getPixels(channel="mask")`                    |
| `read`        | 读 vector mask raster result | `imaging.getLayerMask({ kind: "vector" })`                                | 可读 mask 像素，不等于 vector path geometry                  |
| `execute`     | 所有 PS state mutation        | `core.executeAsModal()`                                                   | `create layer / put pixels / place / batchPlay` 都包进去 |
| `persist`     | 临时图片落盘                      | `localFileSystem.createEntryWithUrl("plugin-temp:/...")` + `File.write()` | 适合 provider 返回二进制图片                                  |
| `persist`     | 用户选择保存位置                    | `getFileForSaving()`                                                      | 用户导出 / debug asset                                   |
| `persist`     | 用户选择输入图片                    | `getFileForOpening()`                                                     | 外部 reference image                                   |
| `persist`     | 保存 provider API key         | `secureStorage.setItem/getItem/removeItem`                                | value 加密；按 provider namespace 存                      |
| `persist`     | 保存用户授权 folder               | `createPersistentToken()` / `getEntryForPersistentToken()`                | token 可能失效，要有 re-pick fallback                       |
| `writeback`   | 文件资产放入当前 PSD 新图层            | `batchPlay(placeEvent)` + `createSessionToken(file)`                      | 推荐主路径                                                |
| `writeback`   | raw buffer 写入 pixel layer   | `createImageDataFromBuffer()` + `putPixels()`                             | 适合本地 raw RGBA，不适合直接消费 PNG/JPEG                       |
| `writeback`   | 另开新文档                       | open / document flow                                                      | 不是当前 PSD 回写主路径                                       |

**架构落点**：你的“PS 是纯 IO 边界、核心不 import UXP”判断是对的。`core` 只产出 `AssetRef | RawPixelBuffer`；`HostBridge` 决定是 `placeEvent` 消费文件资产，还是 `putPixels` 消费 raw buffer。

[1]: https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging "https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging"
[2]: https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/layer "https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/layer"
[3]: https://developer.adobe.com/photoshop/uxp/2022/ps-reference/modules/constants "https://developer.adobe.com/photoshop/uxp/2022/ps-reference/modules/constants"
[4]: https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/document "https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/document"
[5]: https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/photoshopcore "https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/photoshopcore"
[6]: https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/executeasmodal "https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/executeasmodal"
[7]: https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/batchplay "https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/batchplay"
[8]: https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-js/Modules/uxp/Persistent%20File%20Storage/FileSystemProvider/ "https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-js/Modules/uxp/Persistent%20File%20Storage/FileSystemProvider/"
[9]: https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-js/modules/uxp/key-value-storage/secure-storage "https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-js/modules/uxp/key-value-storage/secure-storage"

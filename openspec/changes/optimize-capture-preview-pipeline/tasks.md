## 1. Capture 主路径解耦

- [ ] 1.1 调整 `captureActiveImage()` 返回与 attachment 装配流程，使 `Capture` 主完成只依赖正式 `provider-input` 资产 ready，不再同步等待 preview 真图完成。
- [ ] 1.2 将 placeholder 与 preview failure 保持在 UI-local / session-local state，确保 `providerInput.storedRef` 仍是 attachment ready 的唯一 durable 判据，不为 preview 引入额外 durable truth 扩张。

## 2. 后台 JPEG preview 派生

- [ ] 2.1 在 Photoshop host bridge 中新增后台 preview 派生流程，使用 capture-time `documentID`、`layerID / composite source`、`sourceBounds`、`targetSize` 调用 `imaging.getPixels(... applyAlpha: true)` 与 `imaging.encodeImageData({ imageData, base64: false })` 生成 `image/jpeg` thumbnail。
- [ ] 2.2 明确 `selection preview` 不再走 `getSelection()` mask 合成；若 capture-time source 已不存在，则 preview 失败并保留 placeholder，不得退回读取当前 active document / active layer。
- [ ] 2.3 为后台 preview 增加 attachment existence 与 capture generation/version 检查，丢弃 stale result，避免旧 preview 覆盖新 attachment 或已删除 attachment。
- [ ] 2.4 复用现有 host operation queue 实现 preview best-effort 调度：单 attachment 最多一个 preview task、无自动重试、后台异常吞掉并记录，并确保 foreground `Capture` / `Send` / `placement` 不被 preview 语义性抢占。

## 3. 正式 PNG 编码候选 encoder

- [ ] 3.1 引入 `@jsquash/png` 依赖，并在正式 `provider-input` `PNG` 编码路径中按 `targetWidth * targetHeight * 4 <= 64 * 1024 * 1024` 判断是否尝试阈值内候选 encoder。
- [ ] 3.2 实现双重 fallback：输出超过阈值时直接回退现有自写 encoder + stored deflate；阈值内若 `@jsquash/png` 在 `import`、WASM initialize、或 encode 阶段失败，也必须回退，记录 fallback reason，且不得让 `Capture` 失败。
- [ ] 3.3 为 `PhotoshopImaging.encodeImageData` 的 `base64: false` 返回值补齐类型与字节适配，避免 preview JPEG 路径落入不安全的隐式转换。
- [ ] 3.4 调整 Vite / UXP bundling 配置，确保 `@jsquash/png` `.wasm` 资源可在 production bundle 中被正确加载。

## 4. Correctness tests 与 production smoke

- [ ] 4.1 补充 `captureActiveImage()` / host read contract tests，验证 `Capture` 完成后 `provider-input.storedRef` 已 ready、preview 可以延后 ready。
- [ ] 4.2 补充 preview tests，验证 JPEG 路径使用 `applyAlpha: true`、不调用 `getSelection()`、固定 capture-time source identity，且 source 缺失时保留 placeholder。
- [ ] 4.3 补充正式 `PNG` 编码阈值 tests，验证阈值内尝试 `@jsquash/png`、超阈值回退、运行时失败回退，并锁定最终落盘尺寸等于 `providerInputPlan.targetWidth/targetHeight`。
- [ ] 4.4 增加真实 production UXP smoke：加载正式 bundle、初始化 `@jsquash/png`、编码一个小 RGBA buffer，并验证 `PNG` signature 与 `IHDR` 尺寸，确保 `.wasm` 已被正确打包与加载。
- [ ] 4.5 运行与本变更直接相关的 `apps/app` 测试集，确认 attachment、preview、provider-input resource、placement contract 无回归。

## 5. 性能观测与真实 UXP 对比

- [ ] 5.1 为正式 `provider-input` 路径增加结构化 timing：`providerInput.getPixelsMs`、`providerInput.getDataMs`、`providerInput.transformMs`、`providerInput.encodeMs`、`providerInput.storeMs`、`providerInput.encoder`、`providerInput.rgbaBytes`、`providerInput.pngBytes`。
- [ ] 5.2 为 preview 与 capture ready 路径增加结构化 timing：`preview.getPixelsMs`、`preview.encodeMs`、`capture.readyMs`。
- [ ] 5.3 在真实 UXP harness 中比较 `2048 x 2048`、`4096 x 4096` 与一个超过 `64 MiB RGBA` 的样本，记录 `@jsquash/png` cold encode、warm encode、现有 encoder、`encode + assetStore.put` 总耗时与输出 `PNG` 大小。
- [ ] 5.4 验证 `Capture ready -> 用户立即 Send` 时，后台 preview 是否显著增加 send / placement 延迟；若结果 stale 则直接丢弃，不引入自动重试或额外调度系统。

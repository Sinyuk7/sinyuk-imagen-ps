## 1. assertSerializable 实现

- [x] 1.1 创建 `packages/core-engine/src/invariants.ts`，实现 `assertSerializable` 函数，递归校验值是否可序列化
- [x] 1.2 `assertSerializable` 拒绝 `function` 类型并抛出 `JobError`（`category: 'validation'`）
- [x] 1.3 `assertSerializable` 拒绝 `symbol` 类型并抛出 `JobError`
- [x] 1.4 `assertSerializable` 拒绝对象中的 `undefined` 值并抛出 `JobError`
- [x] 1.5 `assertSerializable` 检测循环引用并抛出 `JobError`

## 2. assertImmutable 实现

- [x] 2.1 在 `invariants.ts` 中实现 `assertImmutable<T>(value: T): Readonly<T>`，对对象/数组执行 `Object.freeze`
- [x] 2.2 `assertImmutable` 对 primitive 值直接透传返回

## 3. safeStringify 实现

- [x] 3.1 在 `invariants.ts` 中实现 `safeStringify`，对循环引用替换为 `"[Circular]"`
- [x] 3.2 `safeStringify` 对 `BigInt` 值转换为字符串表示，不抛错

## 4. 聚合导出与编译验证

- [x] 4.1 更新 `packages/core-engine/src/index.ts`，从 `./invariants.js` 导入并导出 `assertSerializable`、`assertImmutable`、`safeStringify`
- [x] 4.2 运行 TypeScript 编译检查，确保模块无类型错误且可正常编译

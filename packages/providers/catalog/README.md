# Fixed provider catalogs

这些 JSON 是发布物内置的只读 provider catalog。

- `grsai.json`：由 `ComfyUI-Sinyuk-Nodes/sinyuk_nodes/features/image_api/config.example.json` 的模型组、参数预设和 profile 组合归一化生成。
- `runninghub.json`：复制自 `ComfyUI-Sinyuk-Nodes/sinyuk_nodes/features/image_api/runninghub_catalog.json`，并转换为当前 catalog schema。

同步或更新目录后运行：

```bash
pnpm --filter @imagen-ps/providers build
pnpm --filter @imagen-ps/providers test -- catalog.test.ts
```

运行时不得读取兄弟仓库路径或远程模型列表。

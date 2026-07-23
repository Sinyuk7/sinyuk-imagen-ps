# ComfyUI Bridge

Bounded page integration for remote saved-workflow discovery and native Queue execution. The allowlist is `handshake`, `list-workflows`, `open-workflow`, `form-values`, `set-values`, `submit`, `reset`, and `dispose`.

The same identity-pinned envelope runs over a browser iframe or Photoshop UXP WebView. No workflow contract schema, generated validator, imported-workflow store, or raw payload is exposed.

Tests are local and mock-only:

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
```

## Local installation

Install this directory as one ComfyUI custom-node package, then restart ComfyUI.
For a development checkout, keep one source of truth with a symlink:

```sh
ln -s /path/to/sinyuk-imagen-ps/integrations/comfyui-imagen-bridge \
  /path/to/ComfyUI/custom_nodes/comfyui-imagen-bridge
```

Verify the loaded backend and frontend extension after restart:

```sh
curl http://127.0.0.1:8188/imagen-ps/bridge/status
curl http://127.0.0.1:8188/extensions
```

When the App runs on a different local origin, start ComfyUI with that exact
origin allowed. The port must match the App dev server:

```sh
comfy --enable-cors-header http://localhost:4173
```

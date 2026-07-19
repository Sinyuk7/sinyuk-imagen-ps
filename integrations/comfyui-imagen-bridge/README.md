# ComfyUI Bridge

Bounded page integration for remote saved-workflow discovery and native Queue execution. The allowlist is `handshake`, `list-workflows`, `open-workflow`, `form-values`, `set-values`, `submit`, `reset`, and `dispose`.

The same identity-pinned envelope runs over a browser iframe or Photoshop UXP WebView. No workflow contract schema, generated validator, imported-workflow store, or raw payload is exposed.

Tests are local and mock-only:

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
```

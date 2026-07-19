"""Bounded ComfyUI Bridge status endpoint."""
from __future__ import annotations
import importlib
import importlib.metadata
import json
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "bridge-config.json"
STATUS_MAX_BYTES = 8_192

class BridgeStatusError(RuntimeError):
    """Status 构建失败。"""

def _read_json(path: Path):
    data = path.read_bytes()
    if len(data) > 131_072: raise BridgeStatusError("bounded artifact required")
    return json.loads(data)

def _module_version(module_name: str):
    try: module = importlib.import_module(module_name)
    except (ImportError, ModuleNotFoundError): return None
    for name in ("__version__", "VERSION", "version"):
        value = getattr(module, name, None)
        if isinstance(value, str) and 0 < len(value) <= 64: return value
    return None

def detect_runtime_versions():
    try: frontend = importlib.metadata.version("comfyui-frontend-package")
    except importlib.metadata.PackageNotFoundError: frontend = None
    core = _module_version("comfyui_version")
    return {"frontendVersion": frontend, "coreVersion": core}

def build_status_payload(version_resolver: Callable[[], dict[str, str | None]] = detect_runtime_versions):
    config = _read_json(CONFIG_PATH)
    detected = version_resolver()
    payload = {"ok": True, "identity": config.get("identity"), "protocolVersion": 1, "bridgeVersion": "1.0.0", "capabilities": config.get("capabilities", {"nativeQueue": True, "workflowDiscovery": True, "receiptObserver": True}), "limits": config.get("limits", {"maxMessageBytes": 2_000_000, "maxWorkflowPathBytes": 512, "maxWorkflowListEntries": 1_000, "maxMutations": 16, "maxIdChars": 128, "maxConfigureTimeoutMs": 30_000}), "detected": {"frontendVersion": detected.get("frontendVersion"), "coreVersion": detected.get("coreVersion")}, "compatible": True}
    if len(json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode()) > STATUS_MAX_BYTES: raise BridgeStatusError("status response exceeds bound")
    return payload

async def status_handler(_request):
    from aiohttp import web
    try: return web.json_response(build_status_payload(), headers={"Cache-Control": "no-store"})
    except Exception: return web.json_response({"ok": False, "errorCode": "bridge-incompatible"}, status=503, headers={"Cache-Control": "no-store"})

_registered_routes = set()
def register_status_route(prompt_server=None):
    if prompt_server is None:
        try: prompt_server = importlib.import_module("server").PromptServer.instance
        except (AttributeError, ImportError, ModuleNotFoundError): return False
    route_key = (id(prompt_server.routes), "/imagen-ps/bridge/status")
    if route_key in _registered_routes: return True
    prompt_server.routes.get("/imagen-ps/bridge/status")(status_handler); _registered_routes.add(route_key); return True

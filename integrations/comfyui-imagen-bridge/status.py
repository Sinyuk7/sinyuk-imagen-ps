"""提供 bounded ComfyUI Bridge status endpoint。"""

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
from pathlib import Path
from typing import Callable


ROOT = Path(__file__).resolve().parent
GENERATED_DIR = ROOT / "generated"
CONFIG_PATH = ROOT / "bridge-config.json"
STATUS_MAX_BYTES = 8_192


class BridgeStatusError(RuntimeError):
    """标记不可对外展开的 status 构建失败。"""


def _read_json(path: Path, max_bytes: int = 131_072):
    data = path.read_bytes()
    if len(data) > max_bytes:
        raise BridgeStatusError("bounded artifact required")
    try:
        return json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BridgeStatusError("valid artifact required") from error


def _load_contract_evidence():
    manifest = _read_json(GENERATED_DIR / "contract-manifest.json")
    compatibility = _read_json(GENERATED_DIR / "compatibility.json")
    schema_bytes = (GENERATED_DIR / "workflow-contract.schema.json").read_bytes()
    digest = hashlib.sha256(schema_bytes).hexdigest()

    expected_manifest_keys = {
        "schemaVersion",
        "bindingClassId",
        "typeClassId",
        "schemaSha256",
    }
    expected_compatibility_keys = {
        "protocolVersion",
        "bridgeVersion",
        "frontendVersion",
        "coreVersion",
        "contractSchemaVersion",
        "contractSchemaSha256",
    }
    if not isinstance(manifest, dict) or set(manifest) != expected_manifest_keys:
        raise BridgeStatusError("invalid contract manifest")
    if not isinstance(compatibility, dict) or set(compatibility) != expected_compatibility_keys:
        raise BridgeStatusError("invalid compatibility manifest")
    if manifest.get("bindingClassId") != "ImagenWorkflowBindingContract":
        raise BridgeStatusError("invalid binding class identity")
    if manifest.get("typeClassId") != "ImagenWorkflowTypeContract":
        raise BridgeStatusError("invalid type class identity")
    if manifest.get("schemaVersion") != 1:
        raise BridgeStatusError("unsupported contract schema")
    if manifest.get("schemaSha256") != digest:
        raise BridgeStatusError("contract schema digest mismatch")
    if compatibility.get("contractSchemaVersion") != manifest.get("schemaVersion"):
        raise BridgeStatusError("contract schema version mismatch")
    if compatibility.get("contractSchemaSha256") != digest:
        raise BridgeStatusError("compatibility digest mismatch")
    return manifest, compatibility


def _module_version(module_name: str):
    try:
        module = importlib.import_module(module_name)
    except (ImportError, ModuleNotFoundError):
        return None
    for name in ("__version__", "VERSION", "version"):
        value = getattr(module, name, None)
        if isinstance(value, str) and 0 < len(value) <= 64:
            return value
    return None


def detect_runtime_versions():
    """读取本地安装版本；无法证明时返回 null 并 fail closed。"""

    try:
        frontend = importlib.metadata.version("comfyui-frontend-package")
    except importlib.metadata.PackageNotFoundError:
        frontend = None

    core = _module_version("comfyui_version")
    if core is None:
        for distribution in ("comfyui", "comfyui-core"):
            try:
                core = importlib.metadata.version(distribution)
                break
            except importlib.metadata.PackageNotFoundError:
                continue
    return {"frontendVersion": frontend, "coreVersion": core}


def build_status_payload(
    version_resolver: Callable[[], dict[str, str | None]] = detect_runtime_versions,
):
    """构建 bounded status；所有 tuple 与 digest 均来自 canonical artifacts。"""

    config = _read_json(CONFIG_PATH)
    _manifest, compatibility = _load_contract_evidence()
    detected = version_resolver()
    if not isinstance(detected, dict):
        raise BridgeStatusError("invalid runtime version evidence")
    detected = {
        "frontendVersion": detected.get("frontendVersion"),
        "coreVersion": detected.get("coreVersion"),
    }
    compatible = (
        detected["frontendVersion"] == compatibility["frontendVersion"]
        and detected["coreVersion"] == compatibility["coreVersion"]
    )
    payload = {
        "ok": True,
        "identity": config["identity"],
        **compatibility,
        "capabilities": config["capabilities"],
        "limits": config["limits"],
        "detected": detected,
        "compatible": compatible,
    }
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    if len(encoded) > STATUS_MAX_BYTES:
        raise BridgeStatusError("status response exceeds bound")
    return payload


async def status_handler(_request):
    """返回固定 envelope，禁止泄漏 path、payload 或 stack。"""

    from aiohttp import web

    try:
        payload = build_status_payload()
    except Exception:
        return web.json_response(
            {"ok": False, "errorCode": "bridge-incompatible"},
            status=503,
            headers={"Cache-Control": "no-store"},
        )
    return web.json_response(payload, headers={"Cache-Control": "no-store"})


_registered_routes = set()


def register_status_route(prompt_server=None):
    """幂等注册 ComfyUI route；test/import 环境无 server 时保持无副作用。"""

    if prompt_server is None:
        try:
            server_module = importlib.import_module("server")
            prompt_server = server_module.PromptServer.instance
        except (AttributeError, ImportError, ModuleNotFoundError):
            return False

    route_key = (id(prompt_server.routes), "/imagen-ps/bridge/status")
    if route_key in _registered_routes:
        return True
    prompt_server.routes.get("/imagen-ps/bridge/status")(status_handler)
    _registered_routes.add(route_key)
    return True

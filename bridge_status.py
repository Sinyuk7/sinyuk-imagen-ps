"""Server-installed status endpoint for the Imagen Bridge custom node."""

BRIDGE_STATUS_PATH = "/imagen-ps/bridge/status"
BRIDGE_PROTOCOL_VERSION = "1.0"
BRIDGE_VERSION = "1.0.0"
FRONTEND_VERSION = "1.45.20"
COMFY_CORE_VERSION = "0.27.1"
MESSAGE_SCHEMA_VERSION = 1
STATIC_CAPABILITIES = (
    "workflow-list",
    "workflow-open",
    "runtime-readiness",
    "widget-mutation",
    "native-prequeue",
    "compile-api-graph",
    "reset",
    "dispose",
)


def status_payload():
    """返回仅含静态 bridge 安装与兼容性事实的状态数据。"""
    return {
        "installed": True,
        "bridgeProtocolVersion": BRIDGE_PROTOCOL_VERSION,
        "bridgeVersion": BRIDGE_VERSION,
        "frontendVersion": FRONTEND_VERSION,
        "comfyCoreVersion": COMFY_CORE_VERSION,
        "messageSchemaVersion": MESSAGE_SCHEMA_VERSION,
        "capabilities": list(STATIC_CAPABILITIES),
    }


def register_status_route():
    """在 ComfyUI host 可用时注册官方 server route。"""
    try:
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        return False

    @PromptServer.instance.routes.get(BRIDGE_STATUS_PATH)
    async def imagen_bridge_status(_request):
        return web.json_response(status_payload())

    return True

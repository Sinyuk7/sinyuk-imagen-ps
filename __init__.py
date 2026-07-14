from .bridge_status import register_status_route, status_payload

WEB_DIRECTORY = "./web"

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

BRIDGE_STATUS_ROUTE_REGISTERED = register_status_route()

__all__ = [
    "BRIDGE_STATUS_ROUTE_REGISTERED",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]

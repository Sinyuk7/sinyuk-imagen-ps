"""ComfyUI Imagen Bridge integration 的加载入口。"""

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .status import register_status_route


WEB_DIRECTORY = "./web"

register_status_route()

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]

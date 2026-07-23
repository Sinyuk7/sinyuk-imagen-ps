"""ComfyUI Imagen Bridge integration 的加载入口。"""

from .status import register_status_route


WEB_DIRECTORY = "./web"
# 当前 Bridge 只提供前端扩展与状态路由，不注册计算节点。
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

register_status_route()

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]

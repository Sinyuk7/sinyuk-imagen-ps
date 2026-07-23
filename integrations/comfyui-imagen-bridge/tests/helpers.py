"""Bridge 测试 helpers。"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str):
    """从 hyphenated integration 目录加载独立 Python module。"""

    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_package(name: str):
    """以 package 形态加载 Bridge 入口，覆盖 ComfyUI 的真实导入路径。"""

    path = ROOT / "__init__.py"
    spec = importlib.util.spec_from_file_location(
        name,
        path,
        submodule_search_locations=[str(ROOT)],
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load bridge package")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


EXTENSION_DIRECTORY = Path(__file__).resolve().parents[1]
EXTENSION_INIT = EXTENSION_DIRECTORY / "__init__.py"


def import_extension(module_name):
    spec = importlib.util.spec_from_file_location(
        module_name,
        EXTENSION_INIT,
        submodule_search_locations=[str(EXTENSION_DIRECTORY)],
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.modules.pop(module_name, None)
        sys.modules.pop(f"{module_name}.bridge_status", None)


class BridgeStatusTests(unittest.TestCase):
    def test_payload_is_static_and_excludes_runtime_data(self):
        with patch.dict(sys.modules, {"server": None, "aiohttp": None}):
            module = import_extension("imagen_bridge_without_host")

        self.assertFalse(module.BRIDGE_STATUS_ROUTE_REGISTERED)
        self.assertEqual(
            module.status_payload(),
            {
                "installed": True,
                "bridgeProtocolVersion": "1.0",
                "bridgeVersion": "1.0.0",
                "frontendVersion": "1.45.20",
                "comfyCoreVersion": "0.27.1",
                "messageSchemaVersion": 1,
                "capabilities": [
                    "workflow-list",
                    "workflow-open",
                    "runtime-readiness",
                    "widget-mutation",
                    "native-prequeue",
                    "compile-api-graph",
                    "reset",
                    "dispose",
                ],
            },
        )
        self.assertTrue(
            {"canvas", "workflow", "workflows", "credential", "credentials", "secret"}
            .isdisjoint(module.status_payload())
        )

    def test_import_without_comfy_server_or_aiohttp_does_not_crash(self):
        with patch.dict(sys.modules, {"server": None, "aiohttp": None}):
            module = import_extension("imagen_bridge_import_without_dependencies")

        self.assertEqual(module.WEB_DIRECTORY, "./web")
        self.assertFalse(module.BRIDGE_STATUS_ROUTE_REGISTERED)

    def test_registers_official_prompt_server_route_when_host_is_available(self):
        registered = {}

        class Routes:
            def get(self, path):
                registered["path"] = path

                def decorate(handler):
                    registered["handler"] = handler
                    return handler

                return decorate

        def json_response(payload):
            return {"payload": payload}

        server = types.ModuleType("server")
        server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=Routes()))
        aiohttp = types.ModuleType("aiohttp")
        aiohttp.web = types.SimpleNamespace(json_response=json_response)

        with patch.dict(sys.modules, {"server": server, "aiohttp": aiohttp}):
            module = import_extension("imagen_bridge_with_host")

        self.assertTrue(module.BRIDGE_STATUS_ROUTE_REGISTERED)
        self.assertEqual(registered["path"], "/imagen-ps/bridge/status")
        self.assertEqual(asyncio.run(registered["handler"](object())), {"payload": module.status_payload()})


if __name__ == "__main__":
    unittest.main()

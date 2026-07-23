"""Bridge ComfyUI package 入口契约。"""

import unittest

from helpers import load_package


class BridgeEntrypointTests(unittest.TestCase):
    def test_frontend_only_package_loads_without_removed_contract_nodes(self):
        bridge = load_package("imagen_bridge_entrypoint")

        self.assertEqual(bridge.WEB_DIRECTORY, "./web")
        self.assertEqual(bridge.NODE_CLASS_MAPPINGS, {})
        self.assertEqual(bridge.NODE_DISPLAY_NAME_MAPPINGS, {})


if __name__ == "__main__":
    unittest.main()

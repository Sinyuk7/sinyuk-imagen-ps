import unittest

from helpers import load_module


status = load_module("bridge_status", "status.py")


class StatusTests(unittest.TestCase):
    def test_bounded_status_has_fixed_allowlist(self):
        payload = status.build_status_payload(lambda: {"frontendVersion": None, "coreVersion": None})
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["protocolVersion"], 1)
        self.assertEqual(set(payload["capabilities"]), {"nativeQueue", "workflowDiscovery", "receiptObserver"})


if __name__ == "__main__":
    unittest.main()

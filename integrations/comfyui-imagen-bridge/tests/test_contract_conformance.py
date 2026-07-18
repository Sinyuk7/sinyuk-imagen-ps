"""Copied Python validator conformance 测试。"""

import hashlib
import json
import unittest

from helpers import ROOT, load_module


runtime_validator = load_module(
    "imagen_bridge_runtime_validator",
    "generated/runtime_validator.py",
)


class ContractConformanceTests(unittest.TestCase):
    def test_fixture_decisions_and_digest_match(self):
        generated = ROOT / "generated"
        schema_bytes = (generated / "workflow-contract.schema.json").read_bytes()
        schema = json.loads(schema_bytes)
        fixtures = json.loads((generated / "contract-fixtures.json").read_text(encoding="utf-8"))
        manifest = json.loads((generated / "contract-manifest.json").read_text(encoding="utf-8"))
        compatibility = json.loads((generated / "compatibility.json").read_text(encoding="utf-8"))
        digest = hashlib.sha256(schema_bytes).hexdigest()
        self.assertEqual(digest, manifest["schemaSha256"])
        self.assertEqual(digest, compatibility["contractSchemaSha256"])
        for case in fixtures["cases"]:
            result = runtime_validator.validate_workflow_contract_documents(
                case["binding"],
                case["type"],
                schema,
            )
            self.assertEqual(result["ok"], case["valid"], case["id"])


if __name__ == "__main__":
    unittest.main()

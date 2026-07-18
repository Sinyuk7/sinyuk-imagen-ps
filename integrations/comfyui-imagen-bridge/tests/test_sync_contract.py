"""Canonical artifact sync 测试。"""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from helpers import load_module


sync_contract = load_module("imagen_bridge_sync_contract", "scripts/sync_contract.py")


def write_source(source: Path):
    source.mkdir()
    schema = b'{"type":"object"}\n'
    digest = hashlib.sha256(schema).hexdigest()
    (source / "workflow-contract.schema.json").write_bytes(schema)
    (source / "contract-fixtures.json").write_text(
        '{"schemaVersion":1,"cases":[]}\n', encoding="utf-8"
    )
    (source / "contract-manifest.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "bindingClassId": "ImagenWorkflowBindingContract",
                "typeClassId": "ImagenWorkflowTypeContract",
                "schemaSha256": digest,
            }
        ),
        encoding="utf-8",
    )
    (source / "compatibility.json").write_text(
        json.dumps(
            {
                "protocolVersion": 1,
                "bridgeVersion": "1.0.0",
                "frontendVersion": "1.45.20",
                "coreVersion": "0.27.1",
                "contractSchemaVersion": 1,
                "contractSchemaSha256": digest,
            }
        ),
        encoding="utf-8",
    )
    (source / "runtime-validator.mjs").write_text("export {};\n", encoding="utf-8")
    (source / "runtime_validator.py").write_text("# generated\n", encoding="utf-8")


class SyncContractTests(unittest.TestCase):
    def test_missing_source_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(sync_contract.SyncError):
                sync_contract.validate_source(Path(directory))

    def test_copy_and_check_are_byte_exact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            target = root / "generated"
            web_target = root / "web/generated"
            write_source(source)
            sync_contract.sync(source, target, False, web_target)
            sync_contract.sync(source, target, True, web_target)
            for name in sync_contract.ARTIFACTS:
                self.assertEqual((source / name).read_bytes(), (target / name).read_bytes())

            (target / "compatibility.json").write_text("{}", encoding="utf-8")
            with self.assertRaises(sync_contract.SyncError):
                sync_contract.sync(source, target, True, web_target)


if __name__ == "__main__":
    unittest.main()

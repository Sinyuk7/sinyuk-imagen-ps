"""Bounded status 测试。"""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from helpers import load_module


status = load_module("imagen_bridge_status", "status.py")


def write_evidence(root: Path):
    generated = root / "generated"
    generated.mkdir()
    schema_bytes = b'{"type":"object"}\n'
    digest = hashlib.sha256(schema_bytes).hexdigest()
    (generated / "workflow-contract.schema.json").write_bytes(schema_bytes)
    (generated / "contract-manifest.json").write_text(
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
    compatibility = {
        "protocolVersion": 1,
        "bridgeVersion": "1.0.0",
        "frontendVersion": "1.45.20",
        "coreVersion": "0.27.1",
        "contractSchemaVersion": 1,
        "contractSchemaSha256": digest,
    }
    (generated / "compatibility.json").write_text(json.dumps(compatibility), encoding="utf-8")
    config = {
        "identity": "comfyui-imagen-bridge",
        "capabilities": {
            "nativeQueue": True,
            "receiptObserver": True,
            "workflowDiscovery": True,
        },
        "limits": {
            "maxMessageBytes": 2_000_000,
            "maxWorkflowPathBytes": 512,
            "maxWorkflowListEntries": 1_000,
            "maxMutations": 16,
            "maxIdChars": 128,
            "maxConfigureTimeoutMs": 30_000,
        },
    }
    config_path = root / "bridge-config.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    return generated, config_path, compatibility


class StatusTests(unittest.TestCase):
    def test_reports_canonical_tuple_and_exact_runtime_match(self):
        with tempfile.TemporaryDirectory() as directory:
            generated, config_path, compatibility = write_evidence(Path(directory))
            with (
                mock.patch.object(status, "GENERATED_DIR", generated),
                mock.patch.object(status, "CONFIG_PATH", config_path),
            ):
                payload = status.build_status_payload(
                    lambda: {
                        "frontendVersion": "1.45.20",
                        "coreVersion": "0.27.1",
                    }
                )

        for key, value in compatibility.items():
            self.assertEqual(payload[key], value)
        self.assertTrue(payload["compatible"])
        self.assertLessEqual(
            len(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
            status.STATUS_MAX_BYTES,
        )

    def test_runtime_version_mismatch_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            generated, config_path, _compatibility = write_evidence(Path(directory))
            with (
                mock.patch.object(status, "GENERATED_DIR", generated),
                mock.patch.object(status, "CONFIG_PATH", config_path),
            ):
                payload = status.build_status_payload(
                    lambda: {"frontendVersion": "other", "coreVersion": None}
                )
        self.assertFalse(payload["compatible"])

    def test_schema_drift_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            generated, config_path, _compatibility = write_evidence(Path(directory))
            (generated / "workflow-contract.schema.json").write_text("{}", encoding="utf-8")
            with (
                mock.patch.object(status, "GENERATED_DIR", generated),
                mock.patch.object(status, "CONFIG_PATH", config_path),
                self.assertRaises(status.BridgeStatusError),
            ):
                status.build_status_payload(
                    lambda: {
                        "frontendVersion": "1.45.20",
                        "coreVersion": "0.27.1",
                    }
                )


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""把 canonical ComfyUI contract runtime artifacts 复制到 Bridge integration。"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path


INTEGRATION_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = INTEGRATION_ROOT.parents[1]
DEFAULT_SOURCE = REPO_ROOT / "packages/execution-backends/comfyui/contract"
DEFAULT_TARGET = INTEGRATION_ROOT / "generated"
WEB_GENERATED_DIR = INTEGRATION_ROOT / "web/generated"
ARTIFACTS = (
    "workflow-contract.schema.json",
    "contract-fixtures.json",
    "contract-manifest.json",
    "compatibility.json",
    "runtime-validator.mjs",
    "runtime_validator.py",
)


class SyncError(RuntimeError):
    """标记 canonical artifact 缺失或 drift。"""


def _load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SyncError(f"invalid canonical artifact: {path.name}") from error


def validate_source(source: Path):
    missing = [name for name in ARTIFACTS if not (source / name).is_file()]
    if missing:
        raise SyncError(f"missing canonical artifacts: {', '.join(missing)}")

    schema_bytes = (source / "workflow-contract.schema.json").read_bytes()
    digest = hashlib.sha256(schema_bytes).hexdigest()
    manifest = _load_json(source / "contract-manifest.json")
    compatibility = _load_json(source / "compatibility.json")
    if set(manifest) != {
        "schemaVersion",
        "bindingClassId",
        "typeClassId",
        "schemaSha256",
    }:
        raise SyncError("invalid canonical contract manifest shape")
    if set(compatibility) != {
        "protocolVersion",
        "bridgeVersion",
        "frontendVersion",
        "coreVersion",
        "contractSchemaVersion",
        "contractSchemaSha256",
    }:
        raise SyncError("invalid canonical compatibility shape")
    if manifest != {
        "schemaVersion": 1,
        "bindingClassId": "ImagenWorkflowBindingContract",
        "typeClassId": "ImagenWorkflowTypeContract",
        "schemaSha256": digest,
    }:
        raise SyncError("canonical contract manifest does not match schema")
    if compatibility.get("contractSchemaVersion") != 1:
        raise SyncError("unsupported canonical contract schema version")
    if compatibility.get("contractSchemaSha256") != digest:
        raise SyncError("canonical compatibility digest does not match schema")


def sync(
    source: Path,
    target: Path,
    check: bool,
    web_generated_dir: Path = WEB_GENERATED_DIR,
):
    validate_source(source)
    copies = [(source / name, target / name) for name in ARTIFACTS]
    for name in ("workflow-contract.schema.json", "runtime-validator.mjs"):
        copies.append((source / name, web_generated_dir / name))
    if check:
        drift = [str(destination) for origin, destination in copies if not destination.is_file() or destination.read_bytes() != origin.read_bytes()]
        if drift:
            raise SyncError(f"generated contract artifacts drifted: {', '.join(drift)}")
        return

    target.mkdir(parents=True, exist_ok=True)
    web_generated_dir.mkdir(parents=True, exist_ok=True)
    for origin, destination in copies:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origin, destination)


def parse_args(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    parser.add_argument("--check", action="store_true")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    try:
        sync(args.source.resolve(), args.target.resolve(), args.check)
    except SyncError as error:
        print(f"contract sync failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

MAX_DOCUMENT_BYTES = 65_536
ROLE_RANK = {"prompt": 0, "image": 1, "mask": 2, "output-image": 3}


def _failure(code: str) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code, "messageKey": f"contract.{code}"}}


def _exact_keys(value: Any, required: set[str], optional: set[str] | None = None) -> bool:
    if not isinstance(value, dict):
        return False
    optional = optional or set()
    return required.issubset(value.keys()) and set(value.keys()).issubset(required | optional)


def _parse_document(value: Any) -> dict[str, Any]:
    parsed = value
    if isinstance(value, str):
        if len(value.encode("utf-8")) > MAX_DOCUMENT_BYTES:
            return _failure("oversized")
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return _failure("malformed")
    if not isinstance(parsed, dict):
        return _failure("malformed")
    try:
        serialized = json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        return _failure("malformed")
    if len(serialized.encode("utf-8")) > MAX_DOCUMENT_BYTES:
        return _failure("oversized")
    return {"ok": True, "value": parsed}


def _schema_facts(schema: Any) -> dict[str, Any] | None:
    if not isinstance(schema, dict) or not isinstance(schema.get("$defs"), dict):
        return None
    defs = schema["$defs"]
    try:
        version = defs["bindingContract"]["properties"]["schemaVersion"]["const"]
        type_version = defs["typeContract"]["properties"]["schemaVersion"]["const"]
        roles = defs["role"]["enum"]
        data_types = defs["dataType"]["enum"]
        encodings = defs["maskEncoding"]["enum"]
        operations = defs["typeContract"]["properties"]["operation"]["enum"]
        max_entries = defs["bindingContract"]["properties"]["bindings"]["maxItems"]
        max_locator_chars = defs["locator"]["properties"]["nodeId"]["maxLength"]
    except (KeyError, TypeError):
        return None
    if (
        version != 1
        or type_version != version
        or not isinstance(roles, list)
        or not isinstance(data_types, list)
        or not isinstance(encodings, list)
        or not isinstance(operations, list)
        or not isinstance(max_entries, int)
        or not isinstance(max_locator_chars, int)
    ):
        return None
    return {
        "version": version,
        "roles": set(roles),
        "data_types": set(data_types),
        "encodings": set(encodings),
        "operations": set(operations),
        "max_entries": max_entries,
        "max_locator_chars": max_locator_chars,
    }


def _valid_locator(locator: Any, max_chars: int) -> bool:
    if not _exact_keys(locator, {"nodeId", "fieldName"}):
        return False
    node_id = locator["nodeId"]
    field_name = locator["fieldName"]
    return (
        isinstance(node_id, str)
        and isinstance(field_name, str)
        and 0 < len(node_id) <= max_chars
        and 0 < len(field_name) <= max_chars
        and not any(ord(char) < 32 or ord(char) == 127 for char in node_id + field_name)
    )


def _key(entry: dict[str, Any]) -> tuple[str, int]:
    return entry["role"], entry["slot"]


def _continuous(entries: list[dict[str, Any]], role: str) -> bool:
    slots = sorted(entry["slot"] for entry in entries if entry["role"] == role)
    return slots == list(range(len(slots)))


def validate_workflow_contract_documents(binding_input: Any, type_input: Any, schema: Any) -> dict[str, Any]:
    """验证并合并两个 canonical workflow contract 文档。"""

    facts = _schema_facts(schema)
    if facts is None:
        return _failure("malformed-schema")
    parsed_binding = _parse_document(binding_input)
    if not parsed_binding["ok"]:
        return parsed_binding
    parsed_type = _parse_document(type_input)
    if not parsed_type["ok"]:
        return parsed_type
    binding = parsed_binding["value"]
    type_contract = parsed_type["value"]

    if binding.get("schemaVersion") != facts["version"] or type_contract.get("schemaVersion") != facts["version"]:
        return _failure("unsupported-version")
    if not _exact_keys(binding, {"schemaVersion", "bindings"}) or not isinstance(binding["bindings"], list):
        return _failure("malformed")
    if not _exact_keys(type_contract, {"schemaVersion", "operation", "entries"}) or not isinstance(type_contract["entries"], list):
        return _failure("malformed")
    if type_contract["operation"] not in facts["operations"]:
        return _failure("invalid-operation")
    if (
        not binding["bindings"]
        or len(binding["bindings"]) > facts["max_entries"]
        or not type_contract["entries"]
        or len(type_contract["entries"]) > facts["max_entries"]
        or len(binding["bindings"]) != len(type_contract["entries"])
    ):
        return _failure("invalid-cardinality")

    bindings: dict[tuple[str, int], dict[str, Any]] = {}
    locators: set[tuple[str, str]] = set()
    for entry in binding["bindings"]:
        if (
            not _exact_keys(entry, {"role", "slot", "locator"})
            or entry["role"] not in facts["roles"]
            or not isinstance(entry["slot"], int)
            or isinstance(entry["slot"], bool)
            or entry["slot"] < 0
            or entry["slot"] >= facts["max_entries"]
            or not _valid_locator(entry["locator"], facts["max_locator_chars"])
        ):
            return _failure("malformed")
        key = _key(entry)
        locator_key = (entry["locator"]["nodeId"], entry["locator"]["fieldName"])
        if key in bindings or locator_key in locators:
            return _failure("duplicate-key")
        bindings[key] = entry
        locators.add(locator_key)

    types: dict[tuple[str, int], dict[str, Any]] = {}
    for entry in type_contract["entries"]:
        if (
            not _exact_keys(entry, {"role", "slot", "required", "dataType"}, {"maskEncoding"})
            or entry["role"] not in facts["roles"]
            or not isinstance(entry["slot"], int)
            or isinstance(entry["slot"], bool)
            or entry["slot"] < 0
            or entry["slot"] >= facts["max_entries"]
            or not isinstance(entry["required"], bool)
            or entry["dataType"] not in facts["data_types"]
        ):
            return _failure("malformed")
        if entry["role"] == "mask":
            if entry.get("maskEncoding") not in facts["encodings"]:
                return _failure("invalid-encoding")
        elif "maskEncoding" in entry:
            return _failure("invalid-encoding")
        key = _key(entry)
        if key in types:
            return _failure("duplicate-key")
        types[key] = entry

    if set(bindings.keys()) != set(types.keys()):
        return _failure("key-mismatch")

    entries: list[dict[str, Any]] = []
    for key, binding_entry in bindings.items():
        type_entry = types[key]
        expected_type = "text" if binding_entry["role"] == "prompt" else "mask" if binding_entry["role"] == "mask" else "image"
        if type_entry["dataType"] != expected_type:
            return _failure("invalid-type")
        merged = {
            "role": binding_entry["role"],
            "slot": binding_entry["slot"],
            "required": type_entry["required"],
            "dataType": type_entry["dataType"],
            "locator": {
                "nodeId": binding_entry["locator"]["nodeId"],
                "fieldName": binding_entry["locator"]["fieldName"],
            },
        }
        if "maskEncoding" in type_entry:
            merged["maskEncoding"] = type_entry["maskEncoding"]
        entries.append(merged)

    prompts = [entry for entry in entries if entry["role"] == "prompt"]
    masks = [entry for entry in entries if entry["role"] == "mask"]
    outputs = [entry for entry in entries if entry["role"] == "output-image"]
    images = [entry for entry in entries if entry["role"] == "image"]
    if len(prompts) != 1 or prompts[0]["slot"] != 0 or not prompts[0]["required"]:
        return _failure("invalid-cardinality")
    if len(masks) > 1 or (masks and masks[0]["slot"] != 0):
        return _failure("invalid-cardinality")
    if not _continuous(entries, "image") or not _continuous(entries, "output-image"):
        return _failure("invalid-cardinality")
    if not outputs or not any(entry["required"] for entry in outputs):
        return _failure("invalid-cardinality")
    if type_contract["operation"] == "text-to-image" and (images or masks):
        return _failure("invalid-operation")
    if type_contract["operation"] == "image-edit" and not any(entry["required"] for entry in images):
        return _failure("invalid-operation")

    entries.sort(key=lambda entry: (ROLE_RANK[entry["role"]], entry["slot"]))
    return {
        "ok": True,
        "value": {
            "schemaVersion": facts["version"],
            "operation": type_contract["operation"],
            "entries": entries,
        },
    }


def validate_canonical_workflow_contract(value: Any, schema: Any) -> dict[str, Any]:
    """验证跨 runtime 传入的 canonical workflow contract。"""

    if not _exact_keys(value, {"schemaVersion", "operation", "entries"}) or not isinstance(value["entries"], list):
        return _failure("malformed")
    binding: dict[str, Any] = {"schemaVersion": value["schemaVersion"], "bindings": []}
    type_contract: dict[str, Any] = {
        "schemaVersion": value["schemaVersion"],
        "operation": value["operation"],
        "entries": [],
    }
    for entry in value["entries"]:
        if not _exact_keys(entry, {"role", "slot", "required", "dataType", "locator"}, {"maskEncoding"}):
            return _failure("malformed")
        binding["bindings"].append({"role": entry["role"], "slot": entry["slot"], "locator": entry["locator"]})
        type_entry = {
            "role": entry["role"],
            "slot": entry["slot"],
            "required": entry["required"],
            "dataType": entry["dataType"],
        }
        if "maskEncoding" in entry:
            type_entry["maskEncoding"] = entry["maskEncoding"]
        type_contract["entries"].append(type_entry)
    return validate_workflow_contract_documents(binding, type_contract, schema)


def _main() -> int:
    if len(sys.argv) != 3:
        return 2
    schema = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    fixtures = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    results = [
        {
            "id": case["id"],
            "valid": validate_workflow_contract_documents(case["binding"], case["type"], schema)["ok"],
        }
        for case in fixtures["cases"]
    ]
    sys.stdout.write(json.dumps(results, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())

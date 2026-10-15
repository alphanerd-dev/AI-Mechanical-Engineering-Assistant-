#!/usr/bin/env python3
"""Evaluate a rule-based predictive-maintenance candidate on synthetic labelled signals.

This is an evaluation harness, not a diagnostic product and not a provider-promotion tool.
It deliberately uses no external data and no third-party Python dependencies.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_signal(record: dict[str, Any]) -> str | None:
    """Return a concise validation failure; return None only for in-domain features."""
    if not isinstance(record, dict):
        return "record must be an object"
    if not isinstance(record.get("id"), str) or not record["id"].strip():
        return "id must be a non-empty string"
    if record.get("label") not in {"HEALTHY", "FAULT"}:
        return "label must be HEALTHY or FAULT"

    ranges = {
        "rmsVelocity": (0.0, 100.0),
        "kurtosis": (1.0, 30.0),
        "temperatureCelsius": (-40.0, 250.0),
    }
    for key, (minimum, maximum) in ranges.items():
        value = record.get(key)
        if not finite_number(value):
            return f"{key} must be a finite number"
        if value < minimum or value > maximum:
            return f"{key} is outside [{minimum}, {maximum}]"

    sample_rate = record.get("sampleRateHz")
    if not isinstance(sample_rate, int) or isinstance(sample_rate, bool) or not 1000 <= sample_rate <= 100000:
        return "sampleRateHz must be an integer in [1000, 100000]"
    window = record.get("windowSeconds")
    if not finite_number(window) or not 0.25 <= window <= 60:
        return "windowSeconds must be a finite number in [0.25, 60]"
    return None


def predict_fault(record: dict[str, Any], rule: dict[str, Any]) -> bool:
    """A transparent baseline rule used only to exercise evaluation and OOD gates."""
    return (
        record["rmsVelocity"] >= rule["rmsVelocityAlarmAtOrAboveMmPerSecond"]
        or record["kurtosis"] >= rule["kurtosisAlarmAtOrAbove"]
        or record["temperatureCelsius"] >= rule["temperatureAlarmAtOrAboveCelsius"]
    )


def evaluate_dataset(dataset: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(dataset, dict) or dataset.get("schemaVersion") != 1:
        raise ValueError("Unsupported dataset schema version.")
    if dataset.get("provenance", {}).get("kind") != "synthetic" or dataset["provenance"].get("externalDataUsed") is not False:
        raise ValueError("Candidate gate only accepts the declared synthetic fixture.")
    rule = dataset.get("rule")
    gate = dataset.get("acceptanceGate")
    if not isinstance(rule, dict) or not isinstance(gate, dict):
        raise ValueError("The candidate rule and acceptance gate are required.")

    records = dataset.get("knownSignals")
    ood_cases = dataset.get("outOfDomainCases")
    if not isinstance(records, list) or not records or not isinstance(ood_cases, list) or not ood_cases:
        raise ValueError("Known-signal and out-of-domain test cases are required.")

    ids: set[str] = set()
    tp = fp = tn = fn = 0
    sample_results: list[dict[str, Any]] = []
    classes: set[str] = set()
    for record in records:
        reason = validate_signal(record)
        if reason:
            raise ValueError(f"Known signal {record.get('id', '<unknown>')!r} is invalid: {reason}")
        if record["id"] in ids:
            raise ValueError(f"Duplicate signal id: {record['id']}")
        ids.add(record["id"])
        classes.add(record["label"])
        predicted = predict_fault(record, rule)
        actual = record["label"] == "FAULT"
        if predicted and actual:
            tp += 1
        elif predicted and not actual:
            fp += 1
        elif not predicted and not actual:
            tn += 1
        else:
            fn += 1
        sample_results.append({"id": record["id"], "actual": record["label"], "predicted": "FAULT" if predicted else "HEALTHY", "correct": predicted == actual})

    if classes != {"HEALTHY", "FAULT"}:
        raise ValueError("Known-signal fixture must contain both HEALTHY and FAULT labels.")

    ood_results = []
    for case in ood_cases:
        reason = validate_signal(case)
        if reason is None:
            raise ValueError(f"Out-of-domain case {case['id']!r} was accepted.")
        if case.get("id") in ids:
            raise ValueError(f"Signal id is repeated between known and out-of-domain fixtures: {case.get('id')}")
        ood_results.append({"id": case.get("id"), "rejected": True, "reason": reason})

    sensitivity = tp / (tp + fn) if tp + fn else 0.0
    specificity = tn / (tn + fp) if tn + fp else 0.0
    false_alarm_rate = fp / (fp + tn) if fp + tn else 1.0
    balanced_accuracy = (sensitivity + specificity) / 2
    gate_checks = {
        "minimumSensitivity": sensitivity >= float(gate["minimumSensitivity"]),
        "minimumSpecificity": specificity >= float(gate["minimumSpecificity"]),
        "maximumFalseAlarmRate": false_alarm_rate <= float(gate["maximumFalseAlarmRate"]),
        "allOutOfDomainCasesRejected": len(ood_results) == len(ood_cases),
    }
    return {
        "schemaVersion": 1,
        "datasetId": dataset.get("datasetId", "unknown"),
        "candidate": "transparent-rms-kurtosis-temperature-threshold-baseline",
        "scope": "synthetic candidate screening only; not production validation or provider promotion",
        "confusionMatrix": {"truePositive": tp, "falsePositive": fp, "trueNegative": tn, "falseNegative": fn},
        "metrics": {
            "sensitivity": round(sensitivity, 6),
            "specificity": round(specificity, 6),
            "falseAlarmRate": round(false_alarm_rate, 6),
            "balancedAccuracy": round(balanced_accuracy, 6),
            "sampleCount": len(records),
            "healthyCount": sum(record["label"] == "HEALTHY" for record in records),
            "faultCount": sum(record["label"] == "FAULT" for record in records),
        },
        "gateChecks": gate_checks,
        "outOfDomain": {"caseCount": len(ood_results), "allRejected": all(item["rejected"] for item in ood_results), "cases": ood_results},
        "perSample": sample_results,
        "result": "PASS" if all(gate_checks.values()) else "FAIL",
        "limitations": dataset["provenance"]["limitations"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", default="benchmarks/providers/predictive-maintenance-signals-v1.json")
    parser.add_argument("--output", default="predictive-maintenance-candidate-report.json")
    args = parser.parse_args()
    fixture_path = Path(args.fixture)
    raw = fixture_path.read_bytes()
    dataset = json.loads(raw)
    report = evaluate_dataset(dataset)
    report["provenance"] = {
        "fixturePath": str(fixture_path),
        "fixtureSha256": hashlib.sha256(raw).hexdigest(),
        "sourceRevision": os.getenv("GITHUB_SHA", "local-unpinned"),
        "pythonVersion": platform.python_version(),
        "evaluatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "externalDataUsed": False,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"result": report["result"], "metrics": report["metrics"], "gateChecks": report["gateChecks"], "fixtureSha256": report["provenance"]["fixtureSha256"], "output": str(output)}, indent=2))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, json.JSONDecodeError, ValueError, KeyError, TypeError) as exc:
        print(f"predictive-maintenance candidate evaluation failed closed: {exc}", file=sys.stderr)
        sys.exit(2)

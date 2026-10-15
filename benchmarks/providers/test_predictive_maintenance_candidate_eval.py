import copy
import json
from pathlib import Path
import unittest

from predictive_maintenance_candidate_eval import evaluate_dataset, validate_signal


FIXTURE = Path(__file__).with_name("predictive-maintenance-signals-v1.json")


class PredictiveMaintenanceCandidateTests(unittest.TestCase):
    def setUp(self):
        self.dataset = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_synthetic_candidate_passes_declared_screening_gate_with_expected_metrics(self):
        report = evaluate_dataset(self.dataset)
        self.assertEqual(report["result"], "PASS")
        self.assertEqual(report["confusionMatrix"], {
            "truePositive": 9,
            "falsePositive": 1,
            "trueNegative": 9,
            "falseNegative": 1,
        })
        self.assertEqual(report["metrics"]["sensitivity"], 0.9)
        self.assertEqual(report["metrics"]["specificity"], 0.9)
        self.assertEqual(report["metrics"]["falseAlarmRate"], 0.1)
        self.assertTrue(all(report["gateChecks"].values()))

    def test_out_of_domain_cases_are_rejected_not_scored(self):
        report = evaluate_dataset(self.dataset)
        self.assertEqual(report["outOfDomain"]["caseCount"], 3)
        self.assertTrue(report["outOfDomain"]["allRejected"])
        self.assertTrue(all(item["rejected"] and item["reason"] for item in report["outOfDomain"]["cases"]))

    def test_nonfinite_or_missing_features_fail_closed(self):
        self.assertIn("finite number", validate_signal({
            "id": "bad", "label": "FAULT", "rmsVelocity": float("nan"),
            "kurtosis": 9, "temperatureCelsius": 90, "sampleRateHz": 12800, "windowSeconds": 4,
        }))
        broken = copy.deepcopy(self.dataset)
        broken["knownSignals"][0]["rmsVelocity"] = None
        with self.assertRaisesRegex(ValueError, "Known signal"):
            evaluate_dataset(broken)

    def test_duplicate_ids_and_missing_labels_fail_closed(self):
        duplicate = copy.deepcopy(self.dataset)
        duplicate["knownSignals"][1]["id"] = duplicate["knownSignals"][0]["id"]
        with self.assertRaisesRegex(ValueError, "Duplicate signal id"):
            evaluate_dataset(duplicate)

        missing_label = copy.deepcopy(self.dataset)
        missing_label["knownSignals"] = [item for item in missing_label["knownSignals"] if item["label"] != "FAULT"]
        with self.assertRaisesRegex(ValueError, "both HEALTHY and FAULT"):
            evaluate_dataset(missing_label)

    def test_nonsynthetic_or_external_data_fixture_is_rejected(self):
        bad = copy.deepcopy(self.dataset)
        bad["provenance"]["externalDataUsed"] = True
        with self.assertRaisesRegex(ValueError, "only accepts the declared synthetic fixture"):
            evaluate_dataset(bad)


if __name__ == "__main__":
    unittest.main()

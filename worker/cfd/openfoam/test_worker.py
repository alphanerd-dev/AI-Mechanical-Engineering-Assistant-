import tempfile
import unittest
from pathlib import Path

from worker import (
    final_residuals,
    integrate_mass_flux,
    last_probe_values,
    parse_mesh_cell_count,
    validate_request,
    write_case,
)


class OpenFOAMWorkerContractTests(unittest.TestCase):
    def setUp(self):
        self.request = {
            "caseId": "laminar-channel-poiseuille-v1",
            "meanVelocityMps": 0.2,
            "heightM": 0.01,
            "depthM": 0.001,
            "densityKgM3": 1000.0,
            "kinematicViscosityM2PerS": 1e-5,
            "mesh": {"cellsVertical": 20},
            "solver": {
                "maxIterations": 2000,
                "residualTolerance": 1e-7,
                "timeoutSeconds": 120,
            },
        }

    def test_accepts_bounded_laminar_manifest(self):
        self.assertEqual(validate_request(self.request), [])

    def test_rejects_boolean_numeric_and_unknown_fields(self):
        invalid = {**self.request, "meanVelocityMps": True, "arbitraryDictionary": "bad"}
        errors = validate_request(invalid)
        self.assertTrue(any("meanVelocityMps" in error for error in errors))
        self.assertTrue(any("unsupported fields" in error for error in errors))

    def test_rejects_turbulent_reynolds_number_and_excessive_mesh(self):
        invalid = {
            **self.request,
            "meanVelocityMps": 1.0,
            "mesh": {"cellsVertical": 201},
        }
        errors = validate_request(invalid)
        self.assertTrue(any("Reynolds number" in error for error in errors))
        self.assertTrue(any("cellsVertical" in error for error in errors))

    def test_case_generation_uses_bounded_body_force_and_half_channel_mesh(self):
        with tempfile.TemporaryDirectory() as temporary:
            case_dir = Path(temporary) / "case"
            case_dir.mkdir()
            y_samples = write_case(case_dir, self.request)
            self.assertEqual(len(y_samples), 20)
            fv_models = (case_dir / "constant" / "fvModels").read_text()
            self.assertIn("explicit (0.24 0 0)", fv_models)
            self.assertIn("selectionMode all;", fv_models)
            self.assertNotIn("cellZone all;", fv_models)
            block_mesh = (case_dir / "system" / "blockMeshDict").read_text()
            self.assertIn("type cyclic;", block_mesh)
            self.assertIn("transform translational;", block_mesh)
            self.assertIn("type symmetryPlane;", block_mesh)
            self.assertIn("(1 20 1)", block_mesh)

    def test_integrated_mass_flow_matches_plane_poiseuille_reference(self):
        height = self.request["heightM"]
        half_height = height / 2
        count = self.request["mesh"]["cellsVertical"]
        ys = [(index + 0.5) * half_height / count for index in range(count)]
        mean_velocity = self.request["meanVelocityMps"]
        velocities = [
            6 * mean_velocity * (y / height) * (1 - y / height)
            for y in ys
        ]
        mass_flow = integrate_mass_flux(
            ys,
            velocities,
            height,
            self.request["depthM"],
            self.request["densityKgM3"],
        )
        expected = (
            self.request["densityKgM3"]
            * mean_velocity
            * height
            * self.request["depthM"]
        )
        self.assertLessEqual(abs(mass_flow - expected) / expected, 0.005)

    def test_check_mesh_parser_extracts_the_actual_cell_count(self):
        output = "Checking geometry...\n    cells: 20\n    faces: 60\nMesh OK.\n"
        self.assertEqual(parse_mesh_cell_count(output), 20)
        with self.assertRaisesRegex(Exception, "did not contain a cell count"):
            parse_mesh_cell_count("Mesh OK but no count")

    def test_probe_parser_extracts_vector_axial_components(self):
        with tempfile.TemporaryDirectory() as temporary:
            probe_file = Path(temporary) / "U"
            probe_file.write_text(
                "# Probe 0 (0 0.00025 0)\n"
                "# Probe 1 (0 0.00075 0)\n"
                "0 (0.1 0 0) (0.2 0 0)\n"
                "1 (0.11 0 0) (0.21 0 0)\n"
            )
            self.assertEqual(last_probe_values(probe_file, 2), [0.11, 0.21])

    def test_solver_residual_parser_uses_final_pressure_and_velocity_residuals(self):
        log = (
            "Solving for p, Initial residual = 1, Final residual = 1e-8, No Iterations 1\n"
            "Solving for Ux, Initial residual = 1, Final residual = 1e-4, No Iterations 1\n"
            "Solving for Uy, Initial residual = 1, Final residual = 1e-4, No Iterations 1\n"
            "Solving for Ux, Initial residual = 1, Final residual = 2e-8, No Iterations 1\n"
            "Solving for Uy, Initial residual = 1, Final residual = 3e-8, No Iterations 1\n"
        )
        self.assertEqual(final_residuals(log), {"pressure": 1e-8, "velocity": 3e-8})


if __name__ == "__main__":
    unittest.main()

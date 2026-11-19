import pathlib
import tempfile
import unittest

from worker import confined_path, parse_dat, sha256_file, cantilever_box_reference, validate_benchmark_input


def valid_benchmark_input():
    return {
        "analysis": "STATIC_STRUCTURAL",
        "benchmark": "cantilever_box",
        "dimensionsMm": {"length": 100.0, "width": 20.0, "height": 20.0},
        "material": {"youngsModulusMpa": 210000.0, "poissonRatio": 0.3},
        "totalForceN": 1000.0,
        "elementSizeMm": 10.0,
        "timeoutMs": 30000,
    }


def evaluate_cantilever_reference(displacement_mm, reaction_forces):
    return cantilever_box_reference(
        length_mm=100.0, width_mm=20.0, height_mm=20.0,
        youngs_modulus_mpa=210000.0, poisson_ratio=0.3, total_force_n=1000.0,
        measured_max_displacement_mm=displacement_mm,
        reaction_forces_n=reaction_forces,
    )

class WorkerTests(unittest.TestCase):
    def test_confined_path_rejects_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            with self.assertRaises(ValueError):
                confined_path(root,"../outside.dat")

    def test_confined_path_accepts_child(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            target=confined_path(root,"result.dat")
            self.assertEqual(target,root.resolve()/"result.dat")

    def test_sha256_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=pathlib.Path(tmp)/"x"
            path.write_bytes(b"abc")
            self.assertEqual(sha256_file(path),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")


    def test_cantilever_reference_matches_closed_form_and_equilibrium(self):
        reference = evaluate_cantilever_reference(0.122765, [0.0, 1000.0, 0.0])
        self.assertGreater(reference["expectedTipDeflectionMm"], reference["bendingDeflectionMm"])
        self.assertTrue(reference["displacementPassed"])
        self.assertTrue(reference["reactionPassed"])
        self.assertTrue(reference["passed"])

    def test_cantilever_reference_rejects_bad_displacement_and_reaction_balance(self):
        reference = evaluate_cantilever_reference(0.5, [0.0, 980.0, 0.0])
        self.assertFalse(reference["displacementPassed"])
        self.assertFalse(reference["reactionPassed"])
        self.assertFalse(reference["passed"])

    def test_benchmark_request_validation_bounds_dimensions_and_mesh(self):
        request = valid_benchmark_input()
        validated = validate_benchmark_input(request)
        self.assertEqual(validated["timeoutMs"], 30000)
        invalid = dict(request)
        invalid["elementSizeMm"] = 0.1
        with self.assertRaisesRegex(ValueError, "Element size"):
            validate_benchmark_input(invalid)
        invalid = dict(request)
        invalid["totalForceN"] = True
        with self.assertRaisesRegex(ValueError, "Total force"):
            validate_benchmark_input(invalid)
        invalid = dict(request)
        invalid["dimensionsMm"] = {"length": 100.0, "width": 30.0, "height": 30.0}
        with self.assertRaisesRegex(ValueError, "five times"):
            validate_benchmark_input(invalid)

    def test_benchmark_request_validation_limits_mesh_size(self):
        request = valid_benchmark_input()
        request["dimensionsMm"] = {"length": 2000.0, "width": 200.0, "height": 200.0}
        request["elementSizeMm"] = 1.0
        with self.assertRaisesRegex(ValueError, "200000-element"):
            validate_benchmark_input(request)

    def test_parse_dat_extracts_normalized_values(self):
        sample="""displacements (vx,vy,vz) for set NALL and time 1.0

 1 0.0 0.3 0.4

number of equations 570
 2 999999.0 999999.0 999999.0

forces (fx,fy,fz) for set FIXED and time 1.0

 1 0.0 100.0 0.0

stresses (elem, integ.pnt.,sxx,syy,szz,sxy,sxz,syz) for set EALL and time 1.0

 1 1 100.0 0.0 0.0 0.0 0.0 0.0

other report header
 10 123456.0 123456.0 123456.0 123456.0 123456.0 123456.0 123456.0

"""
        with tempfile.TemporaryDirectory() as tmp:
            path=pathlib.Path(tmp)/"result.dat"
            path.write_text(sample)
            displacement,stress,reaction=parse_dat(path)
            self.assertAlmostEqual(displacement,0.5)
            self.assertAlmostEqual(stress,100.0)
            self.assertEqual(reaction,[0.0,100.0,0.0])

if __name__=="__main__":
    unittest.main()

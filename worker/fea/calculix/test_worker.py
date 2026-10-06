import pathlib
import tempfile
import unittest

from worker import confined_path, parse_dat, sha256_file

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

    def test_parse_dat_extracts_normalized_values(self):
        sample="""displacements (vx,vy,vz) for set NALL and time 1.0

 1 0.0 0.3 0.4

reaction forces (fx,fy,fz) for set FIXED and time 1.0

 1 0.0 100.0 0.0

stresses (elem, integ.pnt.,sxx,syy,szz,sxy,sxz,syz) for set EALL and time 1.0

 1 1 100.0 0.0 0.0 0.0 0.0 0.0

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

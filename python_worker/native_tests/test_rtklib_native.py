"""Required native RTKLIB acceptance; no mocks, downloads, app or DB imports.

Run separately from the ordinary pytest suite:
  python -B -m unittest discover -s native_tests -v
Missing rnx2rtkp is a failure, never a skipped native acceptance check.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rtklib_baseline import _parse_rtklib_output, process_rnx2rtkp_baseline


class NativeBaselineAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.executable = shutil.which("rnx2rtkp")
        if not cls.executable:
            raise RuntimeError("Native acceptance requires rnx2rtkp; install the RTKLIB CLI before running this suite.")
        cls.fixture_root = Path(__file__).resolve().parent / "data"
        cls.reference = json.loads((cls.fixture_root / "reference.json").read_text(encoding="utf-8"))
        if cls.reference["revision"] != "71db0ffa0d9735697c6adfd06fdf766d0e5ce807":
            raise AssertionError("Native reference revision changed; review the upstream inputs and numerical expectations.")
        cls.inputs = {}
        names = {"base_rinex": "30400920.05o", "rover_rinex": "07590920.05o", "nav_rinex": "30400920.05n"}
        for key, name in names.items():
            raw = (cls.fixture_root / name).read_bytes()
            expected = cls.reference["files"][name]
            if len(raw) != expected["bytes"] or hashlib.sha256(raw).hexdigest() != expected["sha256"]:
                raise AssertionError(f"Pinned public native fixture changed: {name}")
            cls.inputs[key] = raw.decode("ascii")

    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="metardu-rtklib-native-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.runs = []
        self.inject_invalid_frequency = False

    @staticmethod
    def _limits():
        # CI is Linux; keep each trusted public-reference solve bounded.
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (10, 12))
        resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024, 16 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

    def _native(self, command, **kwargs):
        output = Path(command[command.index("-o") + 1]).resolve()
        self.assertTrue(output.is_relative_to(self.root))
        if self.inject_invalid_frequency:
            config = Path(command[command.index("-k") + 1]).resolve()
            self.assertTrue(config.is_relative_to(self.root))
            text = config.read_text(encoding="ascii")
            self.assertIn("pos1-frequency=2", text)
            config.write_text(text.replace("pos1-frequency=2", "pos1-frequency=unrecognized", 1), encoding="ascii")
        kwargs.update(
            capture_output=True, text=True, timeout=30, check=False, cwd=self.root,
            env={"PATH": os.pathsep.join((str(Path(self.executable).parent), "/usr/bin", "/bin")), "LC_ALL": "C"},
        )
        if os.name == "posix":
            kwargs["preexec_fn"] = self._limits
        result = subprocess.run(command, **kwargs)
        content = output.read_text(encoding="ascii") if output.exists() else ""
        rows = [line.split() for line in content.splitlines() if line.strip() and not line.startswith("%")]
        self.runs.append({"exit": result.returncode, "stderr": result.stderr, "rows": rows, "content": content})
        return result

    def _relative(self, *, ambiguity="continuous", control="upstream-base"):
        return process_rnx2rtkp_baseline({
            **self.inputs,
            "base_position": self.reference["controls"][control]["base_position"],
            "options": {"mode": "static", "frequency": "l1+l2", "elevation_mask": 15, "ambiguity_resolution": ambiguity},
        }, executable=self.executable, runner=self._native, temp_dir=str(self.root))

    def _assert_position(self, result, name):
        expected = self.reference["numericalRegressionOutputs"][name]
        # Regression tolerances across RTKLIB distribution builds, not claimed
        # external positioning accuracy or independently surveyed truth.
        self.assertAlmostEqual(result["rover_latitude"], expected["latitude"], delta=1e-6)
        self.assertAlmostEqual(result["rover_longitude"], expected["longitude"], delta=1e-6)
        self.assertAlmostEqual(result["rover_height"], expected["ellipsoidal_height"], delta=0.2)

    def test_public_reference_produces_fixed_relative_solution(self):
        result = self._relative()
        self.assertEqual(result["quality"], "FIX")
        self.assertGreater(result["ratio"], 0)
        self._assert_position(result, "upstream-base")
        self.assertGreaterEqual(len(self.runs[-1]["rows"]), 100)
        self.assertEqual(self.runs[-1]["rows"][-1][5], "1")
        self.assertNotIn("invalid option", self.runs[-1]["stderr"].lower())

    def test_disabling_ambiguity_resolution_produces_float(self):
        result = self._relative(ambiguity="off")
        self.assertEqual(result["quality"], "FLOAT")
        self.assertEqual(result["ratio"], 0)
        self.assertEqual(self.runs[-1]["rows"][-1][5], "2")
        self._assert_position(result, "upstream-base")

    def test_changing_supplied_base_changes_rover_solution(self):
        nominal = self._relative()
        shifted = self._relative(control="synthetic-base-x-plus-one-metre")
        self.assertEqual(shifted["quality"], "FIX")
        self._assert_position(shifted, "synthetic-base-x-plus-one-metre")
        self.assertGreater(abs(shifted["rover_longitude"] - nominal["rover_longitude"]), 5e-6)
        self.assertGreater(abs(shifted["rover_height"] - nominal["rover_height"]), 0.5)

    def test_real_single_point_rows_are_rejected_as_a_baseline(self):
        rover, nav, output = self.root / "spp.obs", self.root / "spp.nav", self.root / "spp.pos"
        rover.write_text(self.inputs["rover_rinex"], encoding="ascii")
        nav.write_text(self.inputs["nav_rinex"], encoding="ascii")
        completed = self._native([self.executable, "-p", "0", "-t", "-o", str(output), str(rover), str(nav)])
        self.assertEqual(completed.returncode, 0)
        self.assertGreaterEqual(len(self.runs[-1]["rows"]), 100)
        self.assertEqual(self.runs[-1]["rows"][-1][5], "5")
        with self.assertRaisesRegex(RuntimeError, "did not produce a relative baseline"):
            _parse_rtklib_output(self.runs[-1]["content"])

    def test_native_configuration_error_rejects_even_if_fix_rows_exist(self):
        self.inject_invalid_frequency = True
        with self.assertRaisesRegex(RuntimeError, "configuration|RTKLIB error"):
            self._relative()
        native = self.runs[-1]
        self.assertIn("invalid option", native["stderr"].lower())
        if native["exit"] == 0:
            # Current RTKLIB keeps its default frequency, returns FIX and exits0.
            # Reject its settings warning instead of accepting those positions.
            self.assertTrue(native["rows"])
            self.assertEqual(native["rows"][-1][5], "1")


if __name__ == "__main__":
    unittest.main()

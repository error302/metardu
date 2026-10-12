"""Contract tests for the RTKLIB subprocess boundary (no real GNSS claim)."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

import rtklib_baseline
from rtklib_baseline import _parse_rtklib_output, process_rnx2rtkp_baseline


def _row(*, status: int = 1, ratio: float = 4.5, sigma_up: float = 0.012) -> str:
    return (
        "%  GPST          latitude longitude height Q ns sdn sde sdu sdne sdeu sdun age ratio\n"
        f"2024/01/01 00:00:00.000 -1.29210000 36.82190000 1650.3200 {status} 18 "
        f"0.0040 0.0050 {sigma_up:.4f} 0 0 0 0.0 {ratio:.2f}\n"
    )


def _params(**overrides):
    params = {
        "base_rinex": "BASE-CONTENT" * 20,
        "rover_rinex": "ROVER-CONTENT" * 20,
        "nav_rinex": "NAV-CONTENT" * 20,
        "base_position": {"latitude": -1.2921, "longitude": 36.8219, "ellipsoidal_height": 1650.32},
        "options": {
            "mode": "kinematic",
            "frequency": "l1+l2",
            "elevation_mask": 15,
            "ambiguity_resolution": "continuous",
        },
    }
    params.update(overrides)
    return params


def test_process_uses_config_file_rover_then_base_and_known_reference(tmp_path):
    captured = {}

    def fake_runner(command, **kwargs):
        captured["command"] = command
        captured["kwargs"] = kwargs
        config = Path(command[command.index("-k") + 1]).read_text(encoding="ascii")
        captured["config"] = config
        output_path = Path(command[command.index("-o") + 1])
        output_path.write_text(_row(), encoding="utf-8")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    result = process_rnx2rtkp_baseline(_params(), executable="rnx2rtkp", runner=fake_runner, temp_dir=str(tmp_path))

    command = captured["command"]
    assert command[1] == "-k"
    assert command[2].endswith("rtklib.conf")
    assert command[-3].endswith("rover.obs")
    assert command[-2].endswith("base.obs")
    assert command[-1].endswith("navigation.nav")
    assert captured["kwargs"]["timeout"] == 300
    assert "pos1-posmode = kinematic" in captured["config"]
    assert "pos1-frequency = 2" in captured["config"]
    assert "pos2-armode = continuous" in captured["config"]
    assert "ant2-postype = llh" in captured["config"]
    assert "ant2-pos1 = -1.292100000000" in captured["config"]
    assert "ant2-pos2 = 36.821900000000" in captured["config"]
    assert "ant2-pos3 = 1650.3200" in captured["config"]
    assert "pos1-armode" not in captured["config"]
    assert result["quality"] == "FIX"
    assert result["ratio"] == pytest.approx(4.5)
    assert result["sigma_up"] == pytest.approx(0.012)


@pytest.mark.parametrize("status", [3, 4, 5, 6, 0, 9])
def test_parser_refuses_non_relative_or_unknown_quality(status):
    with pytest.raises(RuntimeError, match="did not produce a relative baseline"):
        _parse_rtklib_output(_row(status=status))


def test_parser_uses_ratio_column_and_rejects_negative_sigma():
    parsed = _parse_rtklib_output(_row(ratio=7.25))
    assert parsed["ratio"] == pytest.approx(7.25)
    with pytest.raises(RuntimeError, match="invalid uncertainty"):
        _parse_rtklib_output(_row(sigma_up=-0.012))


def test_known_base_coordinates_and_options_are_required_and_bounded():
    with pytest.raises(ValueError, match="Known base"):
        process_rnx2rtkp_baseline(_params(base_position={}), executable="rnx2rtkp", runner=lambda *_args, **_kwargs: None)
    with pytest.raises(ValueError, match="outside supported"):
        process_rnx2rtkp_baseline(
            _params(base_position={"latitude": 91, "longitude": 0, "ellipsoidal_height": 0}),
            executable="rnx2rtkp",
            runner=lambda *_args, **_kwargs: None,
        )
    with pytest.raises(ValueError, match="Frequency"):
        process_rnx2rtkp_baseline(
            _params(options={"frequency": "l2"}),
            executable="rnx2rtkp",
            runner=lambda *_args, **_kwargs: None,
        )


def test_each_uploaded_rinex_is_size_bounded(monkeypatch):
    monkeypatch.setattr(rtklib_baseline, "MAX_RINEX_CHARS", 128)
    with pytest.raises(ValueError, match="25 MiB or smaller"):
        process_rnx2rtkp_baseline(
            _params(base_rinex="B" * 100, rover_rinex="R" * 129, nav_rinex="N" * 100),
            executable="rnx2rtkp",
            runner=lambda *_args, **_kwargs: pytest.fail("oversized files must be rejected before execution"),
        )
def test_no_solution_row_and_nonzero_exit_are_actionable(tmp_path):
    def no_output_runner(command, **_kwargs):
        Path(command[command.index("-o") + 1]).write_text("% header only\n", encoding="utf-8")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    with pytest.raises(RuntimeError, match="no position rows"):
        process_rnx2rtkp_baseline(_params(), executable="rnx2rtkp", runner=no_output_runner, temp_dir=str(tmp_path))

    with pytest.raises(RuntimeError, match="RTKLIB error 2: invalid RINEX"):
        process_rnx2rtkp_baseline(
            _params(), executable="rnx2rtkp",
            runner=lambda *_args, **_kwargs: SimpleNamespace(returncode=2, stdout="", stderr="invalid RINEX"),
            temp_dir=str(tmp_path),
        )

from __future__ import annotations

import sys
from pathlib import Path

deps_dir = Path(__file__).resolve().parent / ".graphify-pydeps"

if deps_dir.exists():
    deps_path = str(deps_dir)
    if deps_path not in sys.path:
        sys.path.insert(0, deps_path)

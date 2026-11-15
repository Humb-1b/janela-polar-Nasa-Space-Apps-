#!/usr/bin/env python3
"""Live check of one official Horizons table link (format=text), as shown in the app.
Run in CI (GitHub Actions has internet).  Exit 0 when the table parses."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app import horizons  # noqa: E402

now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0, tzinfo=None)
params = horizons.observer_params("10", "301", -85.9872, -0.23676, now, now + timedelta(days=2), "60 m", fmt="text")
url = horizons.text_url(params)
print("GET", url)
r = requests.get(url, timeout=90)
print("HTTP", r.status_code, len(r.text), "bytes")
rows = horizons.parse_table(r.text)
s = horizons.azel_series(rows)
print(f"OK: {len(s)} rows; first: {s[0][0]:%Y-%m-%d %H:%M} az={s[0][1]} el={s[0][2]}")
sys.exit(0 if len(s) >= 40 else 1)

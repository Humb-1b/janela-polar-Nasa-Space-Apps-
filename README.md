# Janela Polar — NASA Space Apps Challenge 2026

Work in progress (stage 1 of 8). Full README with sources and the "AI assistance" section comes in stage 8.

Run tests:
```
pip install -r backend/requirements.txt pytest
cd backend && python -m pytest -q && cd ..
node --test frontend/tests/*.test.mjs
python scripts/horizons_probe.py        # needs internet: real JPL Horizons check
```

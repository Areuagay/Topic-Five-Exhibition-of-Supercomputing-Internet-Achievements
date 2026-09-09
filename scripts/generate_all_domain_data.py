#!/usr/bin/env python3
"""Generate all 12 scenario simulated domain datasets and merge into mock-data run-details."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from generate_domain_data import (  # noqa: E402
    admet,
    dft_band_dos,
    dft_high_throughput,
    drug_screen,
    fatigue,
    geo_plate,
    geo_wave,
    llm_pretrain,
    pinn,
    uav_path,
    uav_swarm,
    vehicle_crash,
)

GENERATORS = [
    ("wave-propagation", geo_wave.generate),
    ("tectonic-evolution", geo_plate.generate),
    ("llm-pretraining", llm_pretrain.generate),
    ("pinn-acceleration", pinn.generate),
    ("vehicle-crash", vehicle_crash.generate),
    ("fatigue-life", fatigue.generate),
    ("swarm-coordination", uav_swarm.generate),
    ("path-planning", uav_path.generate),
    ("virtual-screening", drug_screen.generate),
    ("admet-prediction", admet.generate),
    ("band-dos", dft_band_dos.generate),
    ("high-throughput-screening", dft_high_throughput.generate),
]


def main():
    parser = argparse.ArgumentParser(description="Generate all simulated domain data")
    parser.add_argument("--only", nargs="*", help="Optional scenario keys to generate")
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    selected = set(args.only) if args.only else None
    # allow alias
    if selected and "plate-tectonics" in selected:
        selected.add("tectonic-evolution")

    for key, fn in GENERATORS:
        if selected and key not in selected and not (key == "tectonic-evolution" and selected & {"plate-tectonics"}):
            if key not in selected:
                continue
        print(f"[generate] {key} ...")
        fn(seed=args.seed, force=args.force)
        print(f"[generate] {key} done")
    print("ALL_OK")


if __name__ == "__main__":
    main()

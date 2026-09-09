"""uav / path-planning simulated domain data with A* path."""
from __future__ import annotations

import argparse
import heapq
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np

from .common import (
    REPO_ROOT,
    add_common_cli,
    artifact_dir,
    float_clean,
    make_artifact,
    make_rng,
    merge_domain_into_run,
    resolve_meta,
    save_fig,
    stamp_simulated,
    write_csv,
    write_json,
)


def point_in_obstacle(x, y, obs):
    """Half-open rectangles [x,x+w) x [y,y+h); circles use closed disk."""
    if obs["type"] == "rectangle":
        return obs["x"] <= x < obs["x"] + obs["w"] and obs["y"] <= y < obs["y"] + obs["h"]
    if obs["type"] == "circle":
        return (x - obs["cx"]) ** 2 + (y - obs["cy"]) ** 2 <= obs["r"] ** 2
    return False


def blocked(x, y, obstacles, width, height):
    if x < 0 or y < 0 or x >= width or y >= height:
        return True
    # Treat grid cell as blocked if its center is inside an obstacle.
    return any(point_in_obstacle(x + 0.5, y + 0.5, o) for o in obstacles)


def astar(start, goal, obstacles, width, height):
    sx, sy = start
    gx, gy = goal
    open_heap = [(0, (sx, sy))]
    came = {}
    gscore = {(sx, sy): 0}
    while open_heap:
        _, current = heapq.heappop(open_heap)
        if current == (gx, gy):
            path = [current]
            while current in came:
                current = came[current]
                path.append(current)
            path.reverse()
            return path
        cx, cy = current
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]:
            nx, ny = cx + dx, cy + dy
            if blocked(nx, ny, obstacles, width, height):
                continue
            step = 1.414 if dx and dy else 1.0
            tentative = gscore[current] + step
            neigh = (nx, ny)
            if tentative < gscore.get(neigh, 1e18):
                came[neigh] = current
                gscore[neigh] = tentative
                f = tentative + ((nx - gx) ** 2 + (ny - gy) ** 2) ** 0.5
                heapq.heappush(open_heap, (f, neigh))
    return []


def generate(run_id=None, output_dir=None, seed=None, force=False):
    meta = resolve_meta("path-planning", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    width, height = 100, 100
    start = [5, 5]
    goal = [92, 90]
    obstacles = [
        {"type": "rectangle", "x": 20, "y": 10, "w": 12, "h": 30},
        {"type": "rectangle", "x": 45, "y": 40, "w": 18, "h": 10},
        {"type": "rectangle", "x": 70, "y": 15, "w": 10, "h": 25},
        {"type": "circle", "cx": 35, "cy": 70, "r": 8},
        {"type": "circle", "cx": 60, "cy": 75, "r": 7},
        {"type": "rectangle", "x": 10, "y": 55, "w": 15, "h": 8},
        {"type": "rectangle", "x": 78, "y": 55, "w": 8, "h": 20},
        {"type": "circle", "cx": 50, "cy": 20, "r": 6},
    ]
    assert not any(point_in_obstacle(start[0], start[1], o) for o in obstacles)
    assert not any(point_in_obstacle(goal[0], goal[1], o) for o in obstacles)

    path_cells = astar(tuple(start), tuple(goal), obstacles, width, height)
    if not path_cells:
        # fallback corridor if A* somehow fails
        path_cells = [(x, 5) for x in range(5, 93)] + [(92, y) for y in range(5, 91)]
    best_path = [{"x": float(p[0]), "y": float(p[1])} for p in path_cells]

    n_cost = 40
    best0 = float(len(path_cells)) * 1.2
    cost_series = []
    for i in range(1, n_cost + 1):
        best = best0 * (0.55 + 0.45 * np.exp(-i / 10)) + rng.normal(0, 0.4)
        avg = best + 8 + 4 * np.exp(-i / 12) + abs(rng.normal(0, 0.5))
        cost_series.append(
            {
                "iteration": i,
                "best_cost": float_clean(best, 3),
                "average_cost": float_clean(avg, 3),
            }
        )
    # enforce overall decrease on best_cost endpoints
    if cost_series[-1]["best_cost"] >= cost_series[0]["best_cost"]:
        cost_series[-1]["best_cost"] = float_clean(cost_series[0]["best_cost"] * 0.6, 3)
        cost_series[-1]["average_cost"] = float_clean(cost_series[-1]["best_cost"] + 6, 3)

    environment = {
        "width": width,
        "height": height,
        "start": start,
        "goal": goal,
        "obstacles": obstacles,
    }

    fig, ax = plt.subplots(figsize=(5, 5))
    ax.set_xlim(0, width)
    ax.set_ylim(0, height)
    for o in obstacles:
        if o["type"] == "rectangle":
            ax.add_patch(patches.Rectangle((o["x"], o["y"]), o["w"], o["h"], color="#7f8c8d"))
        else:
            ax.add_patch(patches.Circle((o["cx"], o["cy"]), o["r"], color="#7f8c8d"))
    px = [p["x"] for p in best_path]
    py = [p["y"] for p in best_path]
    ax.plot(px, py, color="#e67e22", lw=2, label="best_path")
    ax.scatter([start[0]], [start[1]], c="green", s=40, zorder=3)
    ax.scatter([goal[0]], [goal[1]], c="red", s=40, zorder=3)
    ax.set_title("UAV Path Planning")
    ax.set_aspect("equal")
    stamp_simulated(ax)
    preview = out / "path_preview.png"
    save_fig(preview, fig)

    write_json(out / "environment.json", {"source_type": "simulated", "environment": environment, "best_path": best_path})
    write_csv(out / "cost_series.csv", cost_series)
    artifacts = [
        make_artifact(
            f"{meta['artifact_prefix']}IMG1",
            "path_preview.png",
            preview.relative_to(REPO_ROOT),
            type_="image",
            format_="png",
        ),
        make_artifact(
            f"{meta['artifact_prefix']}JSON1",
            "environment.json",
            (out / "environment.json").relative_to(REPO_ROOT),
            type_="dataset",
            format_="json",
        ),
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "cost_series.csv",
            (out / "cost_series.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        ),
    ]

    domain_data = {
        "scenario_id": scenario_id,
        "environment": environment,
        "best_path": best_path,
        "cost_series": cost_series,
        "path_preview": artifacts[0]["preview_url"],
    }
    merge_domain_into_run(domain, run_id, domain_data, artifacts)
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("path-planning ok")


if __name__ == "__main__":
    main()

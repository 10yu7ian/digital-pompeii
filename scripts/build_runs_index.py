#!/usr/bin/env python3
"""
Reads all runs/*.jsonl files and outputs src/data/runs_index.json
grouped by contract_address, sorted newest-first.
"""
import json, glob, os, re
from pathlib import Path

RUNS_DIR = Path(__file__).parent.parent / "runs"
OUT_FILE = Path(__file__).parent.parent / "src" / "data" / "runs_index.json"

def parse_run(filepath):
    events = []
    with open(filepath, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return events

def main():
    by_address = {}

    for path in sorted(RUNS_DIR.glob("run_*.jsonl")):
        events = parse_run(path)
        if not events:
            continue
        first = events[0]
        if first.get("type") != "run_start":
            continue
        addr = first.get("contract_address", "").lower()
        if not addr:
            continue

        # Extract timestamp from filename: run_YYYYMMDD_HHMMSS_ADDR.jsonl
        m = re.match(r"run_(\d{8}_\d{6})_", path.name)
        ts = m.group(1) if m else "00000000_000000"

        entry = {
            "file": path.name,
            "timestamp": ts,
            "contract_address": first.get("contract_address"),
            "events": events,
        }

        if addr not in by_address:
            by_address[addr] = []
        by_address[addr].append(entry)

    # Sort each group newest-first
    for addr in by_address:
        by_address[addr].sort(key=lambda x: x["timestamp"], reverse=True)

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(by_address, f, ensure_ascii=False, indent=2)

    total_runs = sum(len(v) for v in by_address.values())
    print(f"Written {total_runs} runs across {len(by_address)} contracts → {OUT_FILE}")

if __name__ == "__main__":
    main()

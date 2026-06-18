# Converts the daily answers to a static JSON for the webapp

import argparse
import json
import shutil
from pathlib import Path
from datetime import date, timedelta

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]  # repo/birdoku
REPO_ROOT = Path(__file__).resolve().parents[2]     # repo


def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert Birdoku answer JSON into static webapp files."
    )

    parser.add_argument(
        "--date",
        help="Puzzle date in YYYYMMDD format. Defaults to today.",
    )

    parser.add_argument(
        "--tomorrow",
        action="store_true",
        help="Build tomorrow's puzzle instead of today's.",
    )

    args = parser.parse_args()

    if args.date and args.tomorrow:
        raise ValueError("Use either --date or --tomorrow, not both.")

    if args.date:
        if len(args.date) != 8 or not args.date.isdigit():
            raise ValueError("--date must be in YYYYMMDD format.")

        return args.date

    if args.tomorrow:
        return (date.today() + timedelta(days=1)).strftime("%Y%m%d")

    return date.today().strftime("%Y%m%d")


PUZZLE_DATE = parse_args()
print(f"Building static Birdoku files for {PUZZLE_DATE}")

answers_src = PROJECT_ROOT / "answers" / f"{PUZZLE_DATE}_answers.json"

if not answers_src.exists():
    raise FileNotFoundError(f"Could not find {answers_src}")

puzzles_dir = REPO_ROOT / "birdoku" / "puzzles"
puzzles_dir.mkdir(parents=True, exist_ok=True)

answers_dest = puzzles_dir / f"{PUZZLE_DATE}.json"
shutil.copyfile(answers_src, answers_dest)

species_csv = PROJECT_ROOT / "data" / "species_lookup.csv"
species_json = REPO_ROOT / "birdoku" / "data" / "species_lookup.json"
species_json.parent.mkdir(parents=True, exist_ok=True)

species_df = pd.read_csv(species_csv)
species = (
    species_df["common_name"]
    .dropna()
    .astype(str)
    .sort_values()
    .tolist()
)

with open(species_json, "w", encoding="utf-8") as f:
    json.dump(species, f, ensure_ascii=False, indent=2)

puzzle_dates = sorted(
    path.stem
    for path in puzzles_dir.glob("*.json")
    if path.stem.isdigit() and len(path.stem) == 8
)

index_path = puzzles_dir / "index.json"

with open(index_path, "w", encoding="utf-8") as f:
    json.dump(puzzle_dates, f, ensure_ascii=False, indent=2)

print(f"Wrote {answers_dest}")
print(f"Wrote {species_json}")
print(f"Wrote {index_path}")
# Converts the daily answers to a static JSON for the webapp
from pathlib import Path
from datetime import date
import json
import shutil
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]  # repo/Birdoku
REPO_ROOT = Path(__file__).resolve().parents[2]     # repo

TODAY = date.today().strftime("%Y%m%d")

answers_src = PROJECT_ROOT / "answers" / f"{TODAY}_answers.json"

puzzles_dir = REPO_ROOT / "birdoku" / "puzzles"
puzzles_dir.mkdir(parents=True, exist_ok=True)

answers_dest = puzzles_dir / f"{TODAY}.json"
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

print(f"Wrote {index_path}")
print(f"Wrote {answers_dest}")
print(f"Wrote {species_json}")
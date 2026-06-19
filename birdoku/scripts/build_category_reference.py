import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]

TRANSLATOR_PATH = ROOT / "data" / "value_translator.csv"
OUT_PATH = ROOT / "data" / "category_reference.json"


df = pd.read_csv(TRANSLATOR_PATH)
df = df[df["use"].astype(str).str.lower() == "yes"].copy()

df["category"] = df["category"].astype(str).str.strip()
df["value_user"] = df["value_user"].astype(str).str.strip()

reference = {}

for category, group in df.groupby("category"):
    values = (
        group["value_user"]
        .dropna()
        .astype(str)
        .str.strip()
        .drop_duplicates()
        .sort_values()
        .tolist()
    )

    reference[category] = values

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(reference, f, ensure_ascii=False, indent=2)

print(f"Wrote {OUT_PATH}")
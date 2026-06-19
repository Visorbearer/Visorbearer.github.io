# Build AviList/BIRDBASE to eBird taxonomy lookup for Birdoku.

import json
from collections import defaultdict
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]

BIRDBASE_PATH = ROOT / "data" / "BIRDBASE v2025.1 Sekercioglu et al. Final.xlsx"
EBIRD_TAXONOMY_PATH = ROOT / "data" / "eBird_taxonomy_v2025-4.csv"

OUT_PATH = ROOT / "data" / "taxonomy_lookup.json"
UNMATCHED_PATH = ROOT / "data" / "taxonomy_unmatched.csv"
DUPLICATE_NAMES_PATH = ROOT / "data" / "taxonomy_duplicate_names.csv"


def clean_text(value):
    if pd.isna(value):
        return ""

    value = str(value).strip()

    if value.lower() == "nan":
        return ""

    return value


def normalize_name(value):
    return clean_text(value).lower()


print("Loading BIRDBASE...", flush=True)

birds = pd.read_excel(BIRDBASE_PATH, sheet_name="Data", header=1)

birds = birds.rename(columns={
    "IOC 15.1": "species_id",
    "English Name (BirdLife > IOC > Clements>AviList)": "avilist_common_name",
    "Latin (BirdLife > IOC > Clements>AviList)": "scientific_name",
})

birds = birds[[
    "species_id",
    "avilist_common_name",
    "scientific_name",
]].copy()

birds["species_id"] = birds["species_id"].apply(clean_text)
birds["avilist_common_name"] = birds["avilist_common_name"].apply(clean_text)
birds["scientific_name"] = birds["scientific_name"].apply(clean_text)

birds = birds[
    (birds["scientific_name"] != "")
    & (birds["avilist_common_name"] != "")
].copy()

print(f"Loaded {len(birds)} BIRDBASE species.", flush=True)


print("Loading eBird taxonomy...", flush=True)

ebird = pd.read_csv(EBIRD_TAXONOMY_PATH)

required_columns = {
    "SPECIES_CODE",
    "PRIMARY_COM_NAME",
    "SCI_NAME",
    "CATEGORY",
}

missing_columns = required_columns - set(ebird.columns)

if missing_columns:
    raise ValueError(
        "Missing expected eBird taxonomy columns: "
        + ", ".join(sorted(missing_columns))
    )

ebird = ebird.rename(columns={
    "SPECIES_CODE": "species_code",
    "PRIMARY_COM_NAME": "ebird_common_name",
    "SCI_NAME": "scientific_name",
    "CATEGORY": "category",
})

ebird["species_code"] = ebird["species_code"].apply(clean_text)
ebird["ebird_common_name"] = ebird["ebird_common_name"].apply(clean_text)
ebird["scientific_name"] = ebird["scientific_name"].apply(clean_text)
ebird["category"] = ebird["category"].apply(clean_text)

# Keep species-level taxa only for now.
# This avoids matching slash taxa, hybrids, spuhs, domestic forms, etc.
ebird_species = ebird[
    ebird["category"].str.lower() == "species"
].copy()

ebird_species = ebird_species[
    (ebird_species["scientific_name"] != "")
    & (ebird_species["ebird_common_name"] != "")
    & (ebird_species["species_code"] != "")
].copy()

print(f"Loaded {len(ebird_species)} eBird species-level taxa.", flush=True)


print("Matching by scientific name...", flush=True)

merged = birds.merge(
    ebird_species[[
        "scientific_name",
        "ebird_common_name",
        "species_code",
    ]],
    on="scientific_name",
    how="left",
)

by_scientific = {}
by_avilist_common = {}
name_candidates = defaultdict(set)

unmatched_rows = []

for _, row in merged.iterrows():
    species_id = clean_text(row["species_id"])
    scientific_name = clean_text(row["scientific_name"])
    avilist_common_name = clean_text(row["avilist_common_name"])
    ebird_common_name = clean_text(row["ebird_common_name"])
    species_code = clean_text(row["species_code"])

    if not scientific_name:
        continue

    names = []

    if avilist_common_name:
        names.append(avilist_common_name)

    if ebird_common_name:
        names.append(ebird_common_name)

    # Remove duplicate names while preserving order.
    names = list(dict.fromkeys(names))

    ebird_url = ""

    if species_code:
        ebird_url = f"https://ebird.org/species/{species_code}"

    record = {
        "species_id": species_id,
        "scientific_name": scientific_name,
        "avilist_common_name": avilist_common_name,
        "ebird_common_name": ebird_common_name,
        "species_code": species_code,
        "ebird_url": ebird_url,
        "names": names,
    }

    by_scientific[scientific_name] = record

    if avilist_common_name:
        by_avilist_common[avilist_common_name] = scientific_name

    for name in names:
        name_candidates[normalize_name(name)].add(scientific_name)

    if not ebird_common_name or not species_code:
        unmatched_rows.append({
            "species_id": species_id,
            "avilist_common_name": avilist_common_name,
            "scientific_name": scientific_name,
        })


print("Building unambiguous common-name lookup...", flush=True)

name_to_scientific = {}
duplicate_name_rows = []

for normalized_name, scientific_names in sorted(name_candidates.items()):
    if len(scientific_names) == 1:
        name_to_scientific[normalized_name] = next(iter(scientific_names))
    else:
        duplicate_name_rows.append({
            "common_name_normalized": normalized_name,
            "scientific_names": " | ".join(sorted(scientific_names)),
        })


output = {
    "byScientific": by_scientific,
    "byAviListCommon": by_avilist_common,
    "nameToScientific": name_to_scientific,
}

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

pd.DataFrame(unmatched_rows).to_csv(UNMATCHED_PATH, index=False)
pd.DataFrame(duplicate_name_rows).to_csv(DUPLICATE_NAMES_PATH, index=False)

matched_count = sum(
    1
    for record in by_scientific.values()
    if record["ebird_common_name"] and record["species_code"]
)

total_count = len(by_scientific)

different_common_names = [
    record
    for record in by_scientific.values()
    if record["avilist_common_name"]
    and record["ebird_common_name"]
    and record["avilist_common_name"] != record["ebird_common_name"]
]

print(f"Wrote {OUT_PATH}", flush=True)
print(f"Wrote {UNMATCHED_PATH}", flush=True)
print(f"Wrote {DUPLICATE_NAMES_PATH}", flush=True)
print(f"Matched {matched_count}/{total_count} BIRDBASE species to eBird species.", flush=True)
print(f"{len(different_common_names)} species have different AviList/eBird common names.", flush=True)
print(f"Ignored {len(duplicate_name_rows)} ambiguous duplicate common names.", flush=True)
# Build species traits for all species as a json for the webapp
import json
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]

BIRDBASE_PATH = PROJECT_ROOT / "data" / "BIRDBASE v2025.1 Sekercioglu et al. Final.xlsx"
TRANSLATOR_PATH = PROJECT_ROOT / "data" / "value_translator.csv"
OUT_PATH = PROJECT_ROOT / "data" / "species_traits.json"

birds = pd.read_excel(BIRDBASE_PATH, sheet_name="Data", header=1)
nest_details = pd.read_excel(BIRDBASE_PATH, sheet_name="Nest Details", header=0)
value_translator = pd.read_csv(TRANSLATOR_PATH)

value_translator = value_translator[value_translator["use"].str.lower() == "yes"].copy()

birds = birds.rename(columns={
    "IOC 15.1": "species_id",
    "English Name (BirdLife > IOC > Clements>AviList)": "common_name",
    "Latin (BirdLife > IOC > Clements>AviList)": "scientific_name",
    "2024 IUCN Red List category": "IUCN Red List Status",
})

nest_details = nest_details.rename(columns={
    "IOC.15.1": "species_id",
    "English.Name": "common_name",
    "Latin.Name": "scientific_name",
})

value_translator["value"] = value_translator["value"].astype(str)
value_translator["pretty_name"] = (
    value_translator["category"].astype(str)
    + ": "
    + value_translator["value_user"].astype(str)
)

grouped_iucn_rows = pd.DataFrame([
    {
        "category": "IUCN Red List Status",
        "subcategory_code": "IUCN Red List Status",
        "value": "EX|EW|CR (PE)|CR (PEW)",
        "value_user": "Extinct",
        "use": "yes",
        "pretty_name": "IUCN Red List Status: Extinct",
    },
    {
        "category": "IUCN Red List Status",
        "subcategory_code": "IUCN Red List Status",
        "value": "CR|EN|VU|NT",
        "value_user": "Endangered/Threatened",
        "use": "yes",
        "pretty_name": "IUCN Red List Status: Endangered/Threatened",
    },
])

value_translator = pd.concat(
    [value_translator, grouped_iucn_rows],
    ignore_index=True,
)

def species_matches_category(species_id, row):
    subcat = row["subcategory_code"]
    value = str(row["value"])

    if subcat == "HABITAT":
        col = value
        if col not in birds.columns:
            return False
        match = birds.loc[birds["species_id"] == species_id, col]
        return not match.empty and pd.notna(match.iloc[0]) and match.iloc[0] != 0

    if subcat == "Nest_Type":
        col = f"NestType_{value}"
        if col not in nest_details.columns:
            return False
        match = nest_details.loc[nest_details["species_id"] == species_id, col]
        return not match.empty and int(match.fillna(0).iloc[0]) == 1

    if subcat == "Nest_Substrate":
        col = f"NestSBS_{value}"
        if col not in nest_details.columns:
            return False
        match = nest_details.loc[nest_details["species_id"] == species_id, col]
        return not match.empty and int(match.fillna(0).iloc[0]) == 1

    if subcat == "DIET":
        col = value
        if col not in birds.columns:
            return False
        match = birds.loc[birds["species_id"] == species_id, col]
        return not match.empty and pd.notna(match.iloc[0]) and match.iloc[0] != 0

    col = subcat
    if col not in birds.columns:
        return False

    raw = birds.loc[birds["species_id"] == species_id, col]
    if raw.empty:
        return False

    allowed_values = [v.strip() for v in value.split("|")]
    return str(raw.iloc[0]).strip() in allowed_values

def actual_values_for_group(species_id, category, subcat):
    """
    For checkbox / one-hot style category groups, return the bird's actual
    pretty values within that same group.
    """

    actual_values = []

    group_rows = value_translator[
        (value_translator["category"].astype(str) == str(category)) &
        (value_translator["subcategory_code"].astype(str) == str(subcat))
    ]

    for _, row in group_rows.iterrows():
        pretty = row["pretty_name"]

        if species_matches_category(species_id, row):
            if ":" in pretty:
                _, value_part = pretty.split(":", 1)
                actual_values.append(value_part.strip())
            else:
                actual_values.append(pretty)

    return actual_values

def actual_label_for_species(species_id, row):
    category = row["category"]
    subcat = row["subcategory_code"]
    pretty = row["pretty_name"]

    if species_matches_category(species_id, row):
        return {
            "matches": True,
            "label": pretty,
        }

    # For direct categorical columns, show actual value, e.g.
    # IUCN Red List Status: Least Concern
    if subcat in birds.columns:
        bird_row = birds.loc[birds["species_id"] == species_id]

        if not bird_row.empty:
            raw_value = bird_row.iloc[0][subcat]

            if pd.notna(raw_value) and str(raw_value).strip():
                return {
                    "matches": False,
                    "label": f"{category}: {str(raw_value).strip()}",
                }

    # For multivariate style traits, show actual values
    actual_values = actual_values_for_group(species_id, category, subcat)

    if actual_values:
        return {
            "matches": False,
            "label": f"{category}: {', '.join(actual_values[:3])}"
        }

    if ":" in pretty:
        category_part, value_part = pretty.split(":", 1)
        return {
            "matches": False,
            "label": f"{category_part}: Unknown/Other"
        }

    return {
        "matches": False,
        "label": f"{category}: Unknown/Other"
    }

    return {
        "matches": False,
        "label": f"Not {pretty}",
    }

traits = {}

for _, bird in birds.iterrows():
    species_id = bird["species_id"]
    common_name = bird["common_name"]

    if pd.isna(common_name):
        continue

    common_name = str(common_name)
    traits[common_name] = {}

    for _, translator_row in value_translator.iterrows():
        pretty = translator_row["pretty_name"]
        traits[common_name][pretty] = actual_label_for_species(
            species_id,
            translator_row
        )

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(traits, f, ensure_ascii=False)

print(f"Wrote {OUT_PATH}")
# Build species traits for all species as a json for the webapp

import json
from pathlib import Path

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]

BIRDBASE_PATH = PROJECT_ROOT / "data" / "BIRDBASE v2025.1 Sekercioglu et al. Final.xlsx"
TRANSLATOR_PATH = PROJECT_ROOT / "data" / "value_translator.csv"
OUT_PATH = PROJECT_ROOT / "data" / "species_traits.json"


print("Loading data...", flush=True)

birds = pd.read_excel(BIRDBASE_PATH, sheet_name="Data", header=1)
nest_details = pd.read_excel(BIRDBASE_PATH, sheet_name="Nest Details", header=0)
value_translator = pd.read_csv(TRANSLATOR_PATH)

value_translator = value_translator[
    value_translator["use"].astype(str).str.lower() == "yes"
].copy()

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

value_translator["category"] = value_translator["category"].astype(str).str.strip()
value_translator["subcategory_code"] = value_translator["subcategory_code"].astype(str).str.strip()
value_translator["value"] = value_translator["value"].astype(str).str.strip()
value_translator["value_user"] = value_translator["value_user"].astype(str).str.strip()

value_translator["pretty_name"] = (
    value_translator["category"]
    + ": "
    + value_translator["value_user"]
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

IUCN_LABELS = {
    "EX": "Extinct",
    "EW": "Extinct in the Wild",
    "CR": "Critically Endangered",
    "CR (PE)": "Critically Endangered, Possibly Extinct",
    "CR (PEW)": "Critically Endangered, Possibly Extinct in the Wild",
    "EN": "Endangered",
    "VU": "Vulnerable",
    "NT": "Near Threatened",
    "LC": "Least Concern",
    "DD": "Data Deficient",
    "NE": "Not Evaluated",
}


def split_allowed_values(value):
    return [v.strip() for v in str(value).split("|")]


def truthy_series(series):
    return (
        series.notna()
        & ~series.astype(str).str.strip().isin(["", "0", "0.0", "False", "false", "nan", "NaN"])
    )

def expanded_category_rows(row):
    category = str(row["category"]).strip()
    subcat = str(row["subcategory_code"]).strip()
    value_user = str(row["value_user"]).strip()
    already_expanded = bool(row.get("_expanded", False))

    # LAT categories are ordered:
    # 1 Tropical
    # 2 Tropical-Temperate
    # 3 Temperate
    # 4 Temperate-Polar
    # 5 Tropical-Polar
    if not already_expanded and category == "Location" and subcat == "LAT":
        if value_user == "Tropical":
            expanded = row.copy()
            expanded["value"] = "1|2|5"
            expanded["_expanded"] = True
            return [expanded]

        if value_user == "Temperate":
            expanded = row.copy()
            expanded["value"] = "2|3|4"
            expanded["_expanded"] = True
            return [expanded]

    # For gameplay, count Single or in Pairs as acceptable for Solitary.
    if not already_expanded and category == "Social Behavior" and value_user == "Solitary":
        row_single_or_pairs = row.copy()
        row_single_or_pairs["subcategory_code"] = "Social_4"
        row_single_or_pairs["value"] = "1"
        row_single_or_pairs["_expanded"] = True

        row_solitary = row.copy()
        row_solitary["subcategory_code"] = "Social_5"
        row_solitary["value"] = "1"
        row_solitary["_expanded"] = True

        return [row_single_or_pairs, row_solitary]

    return [row]

def species_for_category(row):
    expanded_rows = expanded_category_rows(row)

    if len(expanded_rows) > 1:
        species_ids = set()

        for expanded_row in expanded_rows:
            species_ids |= species_for_category(expanded_row)

        return species_ids

    row = expanded_rows[0]

    subcat = str(row["subcategory_code"]).strip()
    value = str(row["value"]).strip()

    if subcat == "HABITAT":
        col = value

        if col not in birds.columns:
            return set()

        matches = truthy_series(birds[col])
        return set(birds.loc[matches, "species_id"])

    if subcat == "DIET":
        col = value

        if col not in birds.columns:
            return set()

        matches = truthy_series(birds[col])
        return set(birds.loc[matches, "species_id"])

    if subcat == "Nest_Type":
        col = f"NestType_{value}"

        if col not in nest_details.columns:
            return set()

        matches = truthy_series(nest_details[col])
        return set(nest_details.loc[matches, "species_id"])

    if subcat == "Nest_Substrate":
        col = f"NestSBS_{value}"

        if col not in nest_details.columns:
            return set()

        matches = truthy_series(nest_details[col])
        return set(nest_details.loc[matches, "species_id"])

    if subcat not in birds.columns:
        return set()

    allowed_values = split_allowed_values(value)
    raw_values = birds[subcat].fillna("").astype(str).str.strip()

    if subcat == "RLM":
        matches = raw_values.apply(
            lambda raw: any(code in raw for code in allowed_values)
        )
    else:
        matches = raw_values.isin(allowed_values)

    return set(birds.loc[matches, "species_id"])


print("Building category membership sets...", flush=True)

category_species = {}

for i, (_, row) in enumerate(value_translator.iterrows(), start=1):
    pretty = row["pretty_name"]
    category_species[pretty] = species_for_category(row)

    if i == 1 or i % 25 == 0:
        print(f"Built {i}/{len(value_translator)} category sets...", flush=True)


print("Building actual value labels by category...", flush=True)

actual_values_by_species_and_category = {}

label_categories = {
    "Social Behavior",
    "Location",
    "Nest Type",
    "Nest Substrate",
    "Habitat",
    "Diet",
}

for category in label_categories:
    group_rows = value_translator[
        value_translator["category"].astype(str).str.strip() == category
    ]

    for _, row in group_rows.iterrows():
        pretty = row["pretty_name"]

        if ":" in pretty:
            _, value_part = pretty.split(":", 1)
            label_value = value_part.strip()
        else:
            label_value = pretty

        for species_id in category_species.get(pretty, set()):
            key = (species_id, category)

            if key not in actual_values_by_species_and_category:
                actual_values_by_species_and_category[key] = []

            actual_values_by_species_and_category[key].append(label_value)


# Remove duplicates while preserving order.
for key, values in actual_values_by_species_and_category.items():
    actual_values_by_species_and_category[key] = list(dict.fromkeys(values))


birds_by_id = birds.set_index("species_id", drop=False)

indicator_categories = {
    "Social Behavior",
    "Habitat",
    "Diet",
    "Nest Type",
    "Nest Substrate",
    "Location",
    "Movement",
    "Nest Parasitism",
    "Volancy",
}


def raw_value_to_user_label(category, subcat, raw_value):
    if pd.isna(raw_value):
        return None

    raw_value = str(raw_value).strip()

    if not raw_value:
        return None

    possible_rows = value_translator[
        (value_translator["category"].astype(str).str.strip() == str(category).strip())
        & (value_translator["subcategory_code"].astype(str).str.strip() == str(subcat).strip())
    ]

    labels = []

    for _, translator_row in possible_rows.iterrows():
        allowed_values = split_allowed_values(translator_row["value"])
        label = str(translator_row["value_user"]).strip()

        if subcat == "RLM":
            if any(code in raw_value for code in allowed_values):
                labels.append(label)
        elif raw_value in allowed_values:
            labels.append(label)

    if labels:
        return ", ".join(dict.fromkeys(labels))

    return None


def get_bird_row(species_id):
    if species_id not in birds_by_id.index:
        return None

    row = birds_by_id.loc[species_id]

    if isinstance(row, pd.DataFrame):
        row = row.iloc[0]

    return row


def actual_label_for_species(species_id, translator_row):
    category = str(translator_row["category"]).strip()
    subcat = str(translator_row["subcategory_code"]).strip()
    pretty = str(translator_row["pretty_name"]).strip()

    bird_row = get_bird_row(species_id)

    if bird_row is None:
        return {
            "matches": False,
            "label": f"{category}: Unknown/Other",
        }

    matches = species_id in category_species.get(pretty, set())

    if category == "IUCN Red List Status":
        raw_iucn = str(bird_row["IUCN Red List Status"]).strip()
        readable_iucn = IUCN_LABELS.get(raw_iucn, raw_iucn)

        return {
            "matches": matches,
            "label": f"IUCN Red List Status: {readable_iucn}",
        }

    if matches:
        return {
            "matches": True,
            "label": pretty,
        }

    if category in label_categories:
        actual_values = actual_values_by_species_and_category.get(
            (species_id, category),
            [],
        )

        if actual_values:
            return {
                "matches": False,
                "label": f"{category}: {', '.join(actual_values[:3])}",
            }

    if subcat in birds.columns and category not in indicator_categories:
        user_value = raw_value_to_user_label(category, subcat, bird_row[subcat])

        if user_value:
            return {
                "matches": False,
                "label": f"{category}: {user_value}",
            }

    if ":" in pretty:
        category_part, _ = pretty.split(":", 1)

        return {
            "matches": False,
            "label": f"{category_part.strip()}: Unknown/Other",
        }

    return {
        "matches": False,
        "label": f"{category}: Unknown/Other",
    }


print("Building species trait lookup...", flush=True)

traits = {}
valid_birds = birds.dropna(subset=["common_name"])
total_birds = len(valid_birds)

for i, (_, bird) in enumerate(valid_birds.iterrows(), start=1):
    species_id = bird["species_id"]
    common_name = str(bird["common_name"])

    traits[common_name] = {}

    for _, translator_row in value_translator.iterrows():
        pretty = translator_row["pretty_name"]
        traits[common_name][pretty] = actual_label_for_species(
            species_id,
            translator_row,
        )

    if i == 1 or i % 250 == 0 or i == total_birds:
        print(f"Processed {i}/{total_birds} species...", flush=True)


print("Writing JSON...", flush=True)

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(traits, f, ensure_ascii=False)

print(f"Wrote {OUT_PATH}", flush=True)
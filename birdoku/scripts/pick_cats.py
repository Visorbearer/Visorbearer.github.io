## Pick 6 categories to use for the grid and internally record all acceptable species for each cat x cat cell
## No cats were harmed in the making of this script.

import os
import sys
import json
import random
import argparse
import pandas as pd
from pathlib import Path
from datetime import date, timedelta

# Basics first

ROOT = Path(__file__).resolve().parent.parent

# Input data
BIRDBASE_PATH = ROOT / "data" / "BIRDBASE v2025.1 Sekercioglu et al. Final.xlsx"
TRANSLATOR_PATH = ROOT / "data" / "value_translator.csv"

MIN_SPECIES_PER_CELL = 150
MIN_SPECIES_PER_EXCEPTION_CELL = 10
N_ROWS = 3
N_COLS = 3

def parse_args():
    parser = argparse.ArgumentParser(description="Generate a daily Birdoku puzzle.")

    parser.add_argument(
        "--date",
        help="Puzzle date in YYYYMMDD format. Defaults to today.",
    )

    parser.add_argument(
        "--tomorrow",
        action="store_true",
        help="Generate tomorrow's puzzle instead of today's.",
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

# Categories that are allowed into the category pool even if they have <100 total species
# Cells involving these categories only need >= MIN_SPECIES_PER_EXCEPTION_CELL valid answers
# Because they're generally going to be more limited but also often more well known and add
# some nice variety
MIN_SPECIES_EXCEPTIONS = {
    "Volancy: Flightless",
    "Nest Parasitism: Nest Parasite",
    "IUCN Red List Status: Extinct",
    "Location: Madagascar & Surrounding Islands",
    "Social Behavior: Lekking",
    "Movement: Non-Migratory",
    "Nest Substrate: Cactus",
}

# For saving the generated answers
PUZZLE_DATE = parse_args()
ANSWERS_DIR = ROOT / "answers"
ANSWERS_DIR.mkdir(exist_ok=True)
print(f"Generating Birdoku puzzle for {PUZZLE_DATE}")
out_path = ANSWERS_DIR / f"{PUZZLE_DATE}_answers.json"

# The nitty gritty

birds = pd.read_excel(BIRDBASE_PATH, sheet_name="Data", header=1)
value_translator = pd.read_csv(TRANSLATOR_PATH)

value_translator = value_translator[value_translator["use"].str.lower() == "yes"].copy()

# Cleanup
value_translator["value"] = value_translator["value"].astype(str)
value_translator["pretty_name"] = (
    value_translator["category"].astype(str)
    + ": "
    + value_translator["value_user"].astype(str)
)

# Add grouped IUCN categories in-script
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
    ignore_index=True
)

pretty_to_group = dict(zip(
    value_translator["pretty_name"],
    value_translator["category"]
))

birds = birds.rename(columns={
    "IOC 15.1": "species_id",
    "English Name (BirdLife > IOC > Clements>AviList)": "common_name",
    "Latin (BirdLife > IOC > Clements>AviList)": "scientific_name",
    "2024 IUCN Red List category": "IUCN Red List Status",
})

# Nest Details are a separate sheet in the Excel file
nest_details = pd.read_excel(BIRDBASE_PATH, sheet_name="Nest Details", header=0)

nest_details = nest_details.rename(columns={
    "IOC.15.1": "species_id",
    "English.Name": "common_name",
    "Latin.Name": "scientific_name",
})

# Pick a category and create a "pretty" title (e.g. "Habitat: Forest" or "Location: Australian")
# using the value_translator.csv key

def species_for_category(row, birds, nest_details):
    """
    Given one row from value_translator, return the set of species_ids
    that qualify for that category.
    """

    subcat = row["subcategory_code"]
    value = str(row["value"])

    # Habitat categories are columns like F, BM, WD, SH, etc.
    # Any non-null / positive value means the bird uses that habitat.
    if subcat == "HABITAT":
        col = value

        if col not in birds.columns:
            return set()

        matches = birds[col].notna() & (birds[col] != 0)
        return set(birds.loc[matches, "species_id"])

    # Nest data comes from Nest Details
    # columns look like NestType_BU, NestType_CP, etc.
    elif subcat == "Nest_Type":
        col = f"NestType_{value}"

        if col not in nest_details.columns:
            return set()

        matches = nest_details[col].fillna(0).astype(int) == 1
        return set(nest_details.loc[matches, "species_id"])

    elif subcat == "Nest_Substrate":
        col = f"NestSBS_{value}"

        if col not in nest_details.columns:
            return set()

        matches = nest_details[col].fillna(0).astype(int) == 1
        return set(nest_details.loc[matches, "species_id"])

    elif subcat == "DIET":
        col = value

        if col not in birds.columns:
            return set()

        matches = birds[col].notna() & (birds[col] != 0)
        return set(birds.loc[matches, "species_id"])

    # For the non-classed stuff, BirdBase column equals translator value.
    # Allows grouped values with |, e.g. "EX|EW|CR (PE)|CR (PEW)"
    else:
        col = subcat

        if col not in birds.columns:
            return set()

        allowed_values = [v.strip() for v in value.split("|")]
        matches = birds[col].astype(str).str.strip().isin(allowed_values)
        return set(birds.loc[matches, "species_id"])


category_species = {}


# Build all valid species sets for each category
for _, row in value_translator.iterrows():
    pretty = row["pretty_name"]
    species_set = species_for_category(row, birds, nest_details)

    # Keep only categories that have enough species overall,
    # except for selected rare/fun categories.
    if len(species_set) >= MIN_SPECIES_PER_CELL or pretty in MIN_SPECIES_EXCEPTIONS:
        category_species[pretty] = species_set

print(f"{len(category_species)} usable categories found with minimum {MIN_SPECIES_PER_CELL} species per category, except selected rare categories.")


# Make the birdoku grid, ensuring all cells have at least the minimum number of species as valid answers
def cell_species(row_cat, col_cat):
    return category_species[row_cat] & category_species[col_cat]


def required_species_for_cell(row_cat, col_cat):
    if row_cat in MIN_SPECIES_EXCEPTIONS or col_cat in MIN_SPECIES_EXCEPTIONS:
        return MIN_SPECIES_PER_EXCEPTION_CELL

    return MIN_SPECIES_PER_CELL

def grid_is_valid(row_cats, col_cats):
    for r in row_cats:
        for c in col_cats:
            required = required_species_for_cell(r, c)

            if len(cell_species(r, c)) < required:
                return False

    return True

# Want to make sure cateogries don't end up duplicated like habitat x habitat
# cause that's not as fun
def has_unique_groups(chosen):
    groups = [pretty_to_group[c] for c in chosen]
    return len(groups) == len(set(groups))


def generate_grid(max_attempts=10000):
    category_names = list(category_species.keys())

    for attempt in range(max_attempts):
        chosen = random.sample(category_names, N_ROWS + N_COLS)

        if not has_unique_groups(chosen):
            continue

        row_cats = chosen[:N_ROWS]
        col_cats = chosen[N_ROWS:]

        if grid_is_valid(row_cats, col_cats):
            return row_cats, col_cats

    raise RuntimeError("Could not generate a valid grid.")

# Generate a grid

row_cats, col_cats = generate_grid()

print("ROWS")
for r in row_cats:
    print("-", r)

print("\nCOLS")
for c in col_cats:
    print("-", c)

# Record acceptable species for each cell

cell_answers = {}

for r in row_cats:
    for c in col_cats:
        ids = cell_species(r, c)

        answers = birds.loc[
            birds["species_id"].isin(ids),
            ["species_id", "common_name", "scientific_name"]
        ].sort_values("common_name")

        cell_answers[(r, c)] = answers

        print(f"\n{r} × {c}: {len(answers)} species")
        print(answers.head(10).to_string(index=False))

# Save the generated answers to a JSON file
output = {
    "date": PUZZLE_DATE,
    "rows": row_cats,
    "cols": col_cats,
    "cells": {}
}

for r in row_cats:
    for c in col_cats:
        key = f"{r} × {c}"

        output["cells"][key] = cell_answers[(r, c)].to_dict(orient="records")

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
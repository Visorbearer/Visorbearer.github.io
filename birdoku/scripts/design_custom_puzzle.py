# Interactively design a custom Birdoku puzzle.
# Writes both answers/YYYYMMDD_answers.json and puzzles/YYYYMMDD.json.
# Optional designer and designer_url fields are included in the puzzle JSON.

import json
import shutil
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]

BIRDBASE_PATH = ROOT / "data" / "BIRDBASE v2025.1 Sekercioglu et al. Final.xlsx"
TRANSLATOR_PATH = ROOT / "data" / "value_translator.csv"
SPECIES_LOOKUP_CSV = ROOT / "data" / "species_lookup.csv"
SPECIES_LOOKUP_JSON = ROOT / "data" / "species_lookup.json"

ANSWERS_DIR = ROOT / "answers"
PUZZLES_DIR = ROOT / "puzzles"

MIN_SPECIES_PER_CELL = 150
MIN_SPECIES_PER_EXCEPTION_CELL = 10

MIN_SPECIES_EXCEPTIONS = {
    "Volancy: Flightless",
    "Nest Parasitism: Nest Parasite",
    "IUCN Red List Status: Extinct",
    "Location: Madagascar & Surrounding Islands",
    "Social Behavior: Lekking",
    "Movement: Non-Migratory",
    "Nest Substrate: Cactus",
}


def yes_no(prompt):
    while True:
        response = input(f"{prompt} [y/n]: ").strip().lower()

        if response in {"y", "yes"}:
            return True

        if response in {"n", "no"}:
            return False

        print("Please type y or n.")


def choose_number(prompt, min_value, max_value):
    while True:
        raw = input(prompt).strip()

        if raw.isdigit():
            value = int(raw)

            if min_value <= value <= max_value:
                return value

        print(f"Please enter a number from {min_value} to {max_value}.")


def split_allowed_values(value):
    return [v.strip() for v in str(value).split("|")]


def truthy_series(series):
    return (
        series.notna()
        & ~series.astype(str).str.strip().isin(
            ["", "0", "0.0", "False", "false", "nan", "NaN"]
        )
    )

def values_match_allowed(raw_values, allowed_values):

    raw_values = raw_values.fillna("").astype(str).str.strip()

    raw_values_numeric = pd.to_numeric(raw_values, errors="coerce")
    allowed_values_numeric = pd.to_numeric(pd.Series(allowed_values), errors="coerce")

    if allowed_values_numeric.notna().all():
        return raw_values_numeric.isin(allowed_values_numeric)

    return raw_values.isin(allowed_values)

def expanded_category_rows(row):
    category = str(row["category"]).strip()
    subcat = str(row["subcategory_code"]).strip()
    value_user = str(row["value_user"]).strip()
    already_expanded = bool(row.get("_expanded", False))

    # LAT categories:
    # 1 Tropical
    # 2 Tropical-Temperate
    # 3 Temperate
    # 4 Temperate-Polar
    # 5 Tropical-Polar
    #
    # Gameplay interpretation:
    # Tropical accepts Tropical, Tropical-Temperate, Tropical-Polar.
    # Temperate accepts Tropical-Temperate, Temperate, Temperate-Polar.
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

    # Gameplay interpretation:
    # Count Single or in Pairs as acceptable for Solitary.
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


def load_data():
    print("Loading Birdoku data...")

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

    # If a grouped category has the same visible name as a simple category,
    # keep the grouped version.
    value_translator = value_translator.drop_duplicates(
        subset=["pretty_name"],
        keep="last",
    ).reset_index(drop=True)

    return birds, nest_details, value_translator


def species_for_category(row, birds, nest_details):
    expanded_rows = expanded_category_rows(row)

    if len(expanded_rows) > 1:
        species_ids = set()

        for expanded_row in expanded_rows:
            species_ids |= species_for_category(expanded_row, birds, nest_details)

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

    # Realm values can be combinations.
    # Example: AZNP should match A, Z, N, and P.
    if subcat == "RLM":
        matches = raw_values.apply(
            lambda raw: any(code in raw for code in allowed_values)
        )
    else:
        matches = values_match_allowed(birds[subcat], allowed_values)

    return set(birds.loc[matches, "species_id"])


def build_category_species(birds, nest_details, value_translator):
    print("Building category species counts...")

    category_species = {}

    for _, row in value_translator.iterrows():
        pretty = row["pretty_name"]
        category_species[pretty] = species_for_category(row, birds, nest_details)

    return category_species


def short_label(category):
    if ":" in category:
        _, value = category.split(":", 1)
        return value.strip()

    return category


def truncate_label(label, width):
    label = str(label)

    if len(label) <= width:
        return label

    return label[: width - 1] + "…"


def cell_species(row_cat, col_cat, category_species):
    return category_species[row_cat] & category_species[col_cat]


def required_species_for_cell(row_cat, col_cat):
    if row_cat in MIN_SPECIES_EXCEPTIONS or col_cat in MIN_SPECIES_EXCEPTIONS:
        return MIN_SPECIES_PER_EXCEPTION_CELL

    return MIN_SPECIES_PER_CELL


def print_count_grid(row_cats, col_cats, category_species):
    row_label_width = 24
    cell_width = 14

    top = (
        "┌"
        + "─" * row_label_width
        + "┬"
        + "┬".join("─" * cell_width for _ in col_cats)
        + "┐"
    )

    divider = (
        "├"
        + "─" * row_label_width
        + "┼"
        + "┼".join("─" * cell_width for _ in col_cats)
        + "┤"
    )

    bottom = (
        "└"
        + "─" * row_label_width
        + "┴"
        + "┴".join("─" * cell_width for _ in col_cats)
        + "┘"
    )

    header_cells = [
        truncate_label(short_label(col), cell_width).center(cell_width)
        for col in col_cats
    ]

    print()
    print("Possible species count grid:")
    print(top)
    print(
        "│"
        + " " * row_label_width
        + "│"
        + "│".join(header_cells)
        + "│"
    )
    print(divider)

    for index, row_cat in enumerate(row_cats):
        row_label = truncate_label(short_label(row_cat), row_label_width).ljust(row_label_width)

        count_cells = []

        for col_cat in col_cats:
            count = len(cell_species(row_cat, col_cat, category_species))
            required = required_species_for_cell(row_cat, col_cat)

            label = str(count)

            if count < required:
                label = f"{count}!"

            count_cells.append(label.center(cell_width))

        print(
            "│"
            + row_label
            + "│"
            + "│".join(count_cells)
            + "│"
        )

        if index < len(row_cats) - 1:
            print(divider)

    print(bottom)
    print("! means the cell is below the configured minimum answer count.")


def summarize_grid(row_cats, col_cats, category_species):
    all_ok = True

    for row_cat in row_cats:
        for col_cat in col_cats:
            count = len(cell_species(row_cat, col_cat, category_species))
            required = required_species_for_cell(row_cat, col_cat)

            if count < required:
                all_ok = False

    return all_ok


def print_chosen(chosen):
    print("\nCurrent custom Birdoku:")
    labels = ["Row 1", "Row 2", "Row 3", "Col 1", "Col 2", "Col 3"]

    for i, category in enumerate(chosen):
        print(f"{i + 1}. {labels[i]}: {category}")


def choose_category(value_translator, category_species, chosen):
    category_names = sorted(value_translator["category"].dropna().unique())

    while True:
        print("\nChoose a category group:")

        for i, category in enumerate(category_names, start=1):
            print(f"{i}. {category}")

        category_choice = choose_number(
            "\nCategory group number: ",
            1,
            len(category_names),
        )

        selected_category = category_names[category_choice - 1]

        options = value_translator[
            value_translator["category"] == selected_category
        ].copy()

        options = options.sort_values(["value_user", "subcategory_code"]).reset_index(drop=True)

        print(f"\n=== {selected_category} ===")
        print("Choose a specific category:")

        for i, row in options.iterrows():
            pretty = row["pretty_name"]
            count = len(category_species.get(pretty, set()))
            already_selected = " [already selected]" if pretty in chosen else ""
            exception_note = " [exception]" if pretty in MIN_SPECIES_EXCEPTIONS else ""

            print(
                f"{i + 1}. {row['value_user']} — "
                f"{count} species{exception_note}{already_selected}"
            )

        option_choice = choose_number(
            "\nSpecific category number: ",
            1,
            len(options),
        )

        selected_row = options.iloc[option_choice - 1]
        pretty = selected_row["pretty_name"]
        count = len(category_species.get(pretty, set()))

        print(f"\nSelected: {pretty}")
        print(f"Species fitting this category: {count}")

        if pretty in chosen:
            print("You already selected this exact category.")
            if not yes_no("Use it anyway?"):
                continue

        if yes_no("Is this category okay?"):
            return pretty


def confirm_or_edit_categories(chosen, value_translator, category_species):
    while True:
        print_chosen(chosen)

        row_cats = chosen[:3]
        col_cats = chosen[3:]

        print_count_grid(row_cats, col_cats, category_species)
        grid_ok = summarize_grid(row_cats, col_cats, category_species)

        if not grid_ok:
            print("\nWarning: at least one cell has fewer answers than the configured target.")

        print("\nOptions:")
        print("1. Confirm this custom puzzle")
        print("2. Redo one category")
        print("3. Cancel")

        choice = choose_number("\nChoose 1, 2, or 3: ", 1, 3)

        if choice == 1:
            if grid_ok or yes_no("Proceed even though some cells are low?"):
                return chosen

        elif choice == 2:
            slot = choose_number("Which slot do you want to redo? 1-6: ", 1, 6)
            chosen[slot - 1] = choose_category(value_translator, category_species, chosen)

        else:
            raise SystemExit("Cancelled custom puzzle design.")


def ask_for_date():
    while True:
        date_key = input("\nPuzzle date YYYYMMDD: ").strip()

        if len(date_key) == 8 and date_key.isdigit():
            print(f"You entered date: {date_key}")

            if yes_no("Is this date correct?"):
                return date_key

        else:
            print("Date must be in YYYYMMDD format.")


def ask_for_designer():
    designer = input("\nDesigner name, or press Enter for none: ").strip()

    if not designer:
        return "", ""

    print(f"Designer will be: {designer}")

    if not yes_no("Is this designer name correct?"):
        return ask_for_designer()

    designer_url = input("\nDesigner URL, or press Enter for none: ").strip()

    if designer_url:
        print(f"Designer URL will be: {designer_url}")

        if not yes_no("Is this designer URL correct?"):
            return ask_for_designer()

    return designer, designer_url


def write_species_lookup():
    if not SPECIES_LOOKUP_CSV.exists():
        print(f"Skipping species lookup; could not find {SPECIES_LOOKUP_CSV}")
        return

    species_df = pd.read_csv(SPECIES_LOOKUP_CSV)
    species = (
        species_df["common_name"]
        .dropna()
        .astype(str)
        .sort_values()
        .tolist()
    )

    SPECIES_LOOKUP_JSON.parent.mkdir(parents=True, exist_ok=True)

    with open(SPECIES_LOOKUP_JSON, "w", encoding="utf-8") as f:
        json.dump(species, f, ensure_ascii=False, indent=2)

    print(f"Wrote {SPECIES_LOOKUP_JSON}")


def update_puzzle_index():
    puzzle_dates = sorted(
        path.stem
        for path in PUZZLES_DIR.glob("*.json")
        if path.stem.isdigit() and len(path.stem) == 8
    )

    index_path = PUZZLES_DIR / "index.json"

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(puzzle_dates, f, ensure_ascii=False, indent=2)

    print(f"Wrote {index_path}")


def write_puzzle(
    date_key,
    designer,
    designer_url,
    row_cats,
    col_cats,
    birds,
    category_species,
):
    answers_path = ANSWERS_DIR / f"{date_key}_answers.json"
    puzzle_path = PUZZLES_DIR / f"{date_key}.json"

    if answers_path.exists() or puzzle_path.exists():
        print("\nA puzzle or answer file already exists for this date:")
        print(f"- {answers_path}")
        print(f"- {puzzle_path}")

        if not yes_no("Overwrite existing files?"):
            raise SystemExit("Cancelled without overwriting.")

    output = {
        "date": date_key,
        "rows": row_cats,
        "cols": col_cats,
        "cells": {},
    }

    if designer:
        output["designer"] = designer

    if designer_url:
        output["designer_url"] = designer_url

    for row_cat in row_cats:
        for col_cat in col_cats:
            key = f"{row_cat} × {col_cat}"
            ids = cell_species(row_cat, col_cat, category_species)

            answers = birds.loc[
                birds["species_id"].isin(ids),
                ["species_id", "common_name", "scientific_name"],
            ].sort_values("common_name")

            output["cells"][key] = answers.to_dict(orient="records")

    ANSWERS_DIR.mkdir(parents=True, exist_ok=True)
    PUZZLES_DIR.mkdir(parents=True, exist_ok=True)

    with open(answers_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    shutil.copyfile(answers_path, puzzle_path)

    print(f"Wrote {answers_path}")
    print(f"Wrote {puzzle_path}")

    update_puzzle_index()
    write_species_lookup()


def main():
    birds, nest_details, value_translator = load_data()
    category_species = build_category_species(birds, nest_details, value_translator)

    chosen = []
    slot_names = ["Row 1", "Row 2", "Row 3", "Column 1", "Column 2", "Column 3"]

    for slot_name in slot_names:
        print(f"\nSelecting {slot_name}")
        chosen.append(choose_category(value_translator, category_species, chosen))

    chosen = confirm_or_edit_categories(chosen, value_translator, category_species)

    row_cats = chosen[:3]
    col_cats = chosen[3:]

    date_key = ask_for_date()
    designer, designer_url = ask_for_designer()

    print("\nFinal confirmation:")
    print_chosen(chosen)
    print_count_grid(row_cats, col_cats, category_species)
    print(f"Date: {date_key}")
    print(f"Designer: {designer or '(none)'}")
    print(f"Designer URL: {designer_url or '(none)'}")

    if not yes_no("Create this custom Birdoku?"):
        raise SystemExit("Cancelled custom puzzle design.")

    write_puzzle(
        date_key=date_key,
        designer=designer,
        designer_url=designer_url,
        row_cats=row_cats,
        col_cats=col_cats,
        birds=birds,
        category_species=category_species,
    )

    print("\nDone.")


if __name__ == "__main__":
    main()
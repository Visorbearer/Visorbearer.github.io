# Build eBird species page Open Graph image lookup for Birdoku
#  This only records the image embed URL in eBird species page metadata

import json
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]

TAXONOMY_LOOKUP_PATH = ROOT / "data" / "taxonomy_lookup.json"
OUT_PATH = ROOT / "data" / "ebird_image_lookup.json"

REQUEST_DELAY_SECONDS = 0.5
TIMEOUT_SECONDS = 20

HEADERS = {
    "User-Agent": (
        "Birdoku/0.0.4 "
        "(personal non-commercial project; https://masonmaron.com/birdoku/)"
    )
}


def load_json(path):
    if not path.exists():
        return {}

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_meta_content(soup, property_name):
    tag = soup.find("meta", attrs={"property": property_name})

    if tag and tag.get("content"):
        return tag["content"].strip()

    tag = soup.find("meta", attrs={"name": property_name})

    if tag and tag.get("content"):
        return tag["content"].strip()

    return ""


def fetch_ebird_image(species_code):
    url = f"https://ebird.org/species/{species_code}"

    response = requests.get(
        url,
        headers=HEADERS,
        timeout=TIMEOUT_SECONDS,
    )

    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    image_url = (
        get_meta_content(soup, "og:image")
        or get_meta_content(soup, "twitter:image")
    )

    title = (
        get_meta_content(soup, "og:title")
        or get_meta_content(soup, "twitter:title")
    )

    return {
        "species_code": species_code,
        "ebird_url": url,
        "image_url": image_url,
        "page_title": title,
    }


def main():
    taxonomy_lookup = load_json(TAXONOMY_LOOKUP_PATH)
    existing_lookup = load_json(OUT_PATH)

    by_scientific = taxonomy_lookup.get("byScientific", {})

    if not by_scientific:
        raise RuntimeError(f"No byScientific data found in {TAXONOMY_LOOKUP_PATH}")

    output = existing_lookup.copy()

    records = list(by_scientific.values())
    records_with_codes = [
        record for record in records
        if record.get("species_code")
    ]

    total = len(records_with_codes)

    print(f"Found {total} species with eBird species codes.", flush=True)

    for index, record in enumerate(records_with_codes, start=1):
        scientific_name = record.get("scientific_name", "").strip()
        species_code = record.get("species_code", "").strip()

        if not scientific_name or not species_code:
            continue

        existing = output.get(scientific_name, {})

        if existing.get("image_url"):
            print(f"[{index}/{total}] Skipping {scientific_name}; already has image.", flush=True)
            continue

        print(f"[{index}/{total}] Fetching {scientific_name} ({species_code})...", flush=True)

        try:
            image_data = fetch_ebird_image(species_code)

            output[scientific_name] = {
                "scientific_name": scientific_name,
                "avilist_common_name": record.get("avilist_common_name", ""),
                "ebird_common_name": record.get("ebird_common_name", ""),
                "species_code": species_code,
                "ebird_url": image_data["ebird_url"],
                "image_url": image_data["image_url"],
                "page_title": image_data["page_title"],
            }

            if image_data["image_url"]:
                print(f"  Image: {image_data['image_url']}", flush=True)
            else:
                print("  No image found.", flush=True)

            # Save after every species so Ctrl+C does not lose progress.
            save_json(OUT_PATH, output)

        except Exception as error:
            print(f"  Failed: {error}", flush=True)

            output[scientific_name] = {
                "scientific_name": scientific_name,
                "avilist_common_name": record.get("avilist_common_name", ""),
                "ebird_common_name": record.get("ebird_common_name", ""),
                "species_code": species_code,
                "ebird_url": f"https://ebird.org/species/{species_code}",
                "image_url": "",
                "page_title": "",
                "error": str(error),
            }

            save_json(OUT_PATH, output)

        time.sleep(REQUEST_DELAY_SECONDS)

    save_json(OUT_PATH, output)

    with_images = sum(
        1 for item in output.values()
        if item.get("image_url")
    )

    print(f"\nWrote {OUT_PATH}", flush=True)
    print(f"{with_images}/{len(output)} records have image URLs.", flush=True)


if __name__ == "__main__":
    main()
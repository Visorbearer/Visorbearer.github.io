## Introduction

Hello! My name is Mason Maron. As of writing this (6/16/2026), I'm a graduate student in the Migration Biology Lab at the University of Illinois Urbana-Champaign. As both a bird researcher and avid birder, I often try my luck at daily web-based and bird themed games like [birdiegame](https://birdiegame.net/) and [Find-a-Flock](https://find-a-flock.com/) (two other great games I recommend checking out!). I'm also a pokemon fan, and similarly will occassionally enjoy a round of [Pokedoku](https://pokedoku.com/). Inspired by those sources, I created this game, **Birdoku**.

The way it works is simple. Using data from BIRDBASE *([Şekercioğlu et al. 2025](https://doi.org/10.1038/s41597-025-05615-3))*, a new 3 × 3 grid of bird traits is generated each day. Each row and column contain a trait, crossing over such that each cell represents the combination of those traits. For example, if column 1 is "Habitat: Forest" and row 1 is "Diet: Scavenger", then cell 1 is looking for a forest-dwelling scavenger, such as American Crow. By entering American Crow into that cell, you'd be answering what you believe falls under the trait pairing.

## Folder Structure

The directory looks like this:

```
birdoku/
│
├── index.html                                               # Static Birdoku game base page
├── styles.css                                               # Game styling
├── app.js                                                   # Browser game logic
│
├── data/
│   ├── BIRDBASE v2025.1 Sekercioglu et al. Final.xlsx       # The BIRDBASE dataset
│   ├── category_reference.json                              # The category/subcat reference
│   ├── species_lookup.csv                                   # Source lookup of all possible common names
│   ├── species_lookup.json                                  # Common-name lookup for autocomplete
│   ├── species_traits.json                                  # Trait lookup for post-game hover tooltips
│   └── value_translator.csv                                 # BIRDBASE lookup for categories used in Birdoku
│
├── answers/                                                 # Each day's answers
│   ├── 20260616_answers.json
│   ├── 20260617_answers.json
│   └── ...
│
├── puzzles/                                                 # Daily puzzle files
│   ├── 20260616.json
│   ├── 20260617.json
│   └── ...
│
├── assets/  
│   ├── CERW_large.png  
│   └── CERW_small.png
│
├── scripts/
│   ├── pick_cats.py                                         # Generates the daily grid + valid answers
│   ├── build_category_reference.py                          # Generates the category/subcat reference JSON
│   ├── build_static.py                                      # Converts generated files for the static site
│   ├── build_species_traits.py                              # Builds tooltip trait data from BIRDBASE
│   └── play_game.py                                         # Old rudimentary local Streamlit version
│
├── README.md                                                # This!
├── requirements.txt                                         # Python env requirements
└── .gitignore
```

## Release Log

**0.0.1.** Jun 17 2026. Initial release.

**0.0.2.** Jun 17 2026. QOL updates for the UI!
- Added tooltips after submission to show user why their answer was incorrect. 
- Added "how to play" button and pop-up. 
- Added difficulty score and increased minimum number of species needed for an acceptable cell to 150.
- Added social links, non-commercial use disclaimer, and link to BIRDBASE Explorer.
- Added a light/dark mode toggle button.
- Improved mobile display of the Birdoku grid.

**0.0.3.** Jun 17 2026. A few more gameplay updates.
- Added a local streak tracker.
- Added a playable archive of past games that does not affect your streak stats.
- Bug fixes.
- Added a logo.

**0.0.4.** Jun 19 2026. Improvements based on user feedback!
- Changed streaks to be based on "wins" (9/9) instead of just playing.
- Shifted the difficulty rating frame down and added penalties for special categories.
- Added clickable/tappable categories to see all options within the category and updated How to Play accordingly.
- Embedded the README/Changelog into the webpage.
- Added a warning popup if the user tries to submit an incomplete Birdoku.
- Added a script to allow for the creation of custom daily games and relevant updates in other scripts.

## Future Improvements

These are the things I'd like to add or update in the future to improve the game. I'll be removing them as they are accomplished.

- Allow players to log in and save stats
- Score rarity for each correct bird after submitting based on eBird observation count
- Set images/illustrations to appear in the boxes after the answer is submitted
- Add an "endless mode" which endlessly generates new sets for users to play, though they don't affect score (but maybe can add an "endless mode streak" of how many endless mode games you've gotten 9/9 on in a row)
- Add scientific name-based translator from current AviList common names to eBird common names
- Add a randomly-chosen "bird of the day" which is guaranteed to fit in the puzzle and, if it used in the puzzle that day, give an extra score point or something depending on how stats/points work long term-- also make the bird of the day link to the ebird page for it

## Contact

Found a bug or error? Have an interesting feature suggestion? Want to let me know you love or hate this game? Feel free to shoot me an email at mwmaron2@illinois.edu (but please don't be mean if you do hate it!).
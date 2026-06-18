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
├── scripts/
│   ├── pick_cats.py                                         # Generates the daily grid + valid answers
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

**0.0.2.** Jun 17 2026. Added tooltips after submission to show user why their answer was incorrect.

## Future Improvements

These are the things I'd like to add or update in the future to improve the game. I'll be removing them as they are accomplished.

- Allow players to log in and save past scores and view stats + streaks (once there are stats)
- Score rarity for each correct bird after submitting based on eBird observation count
- Allow players to replay past games they missed, though they won't contribute to user score
- Add a link within my site to this and a link for BMAC
- Add a question mark in circle icon to the top right which can be clicked on to bring up a brief "How to Play" overlay while graying out the background
- Set images/illustrations to appear in the boxes after the answer is submitted
- Create and add a logo to replace the bird emoji
- Add an "endless mode" which endlessly generates new sets for users to play, though they don't effect score (but maybe can add an "endless mode streak" of how many endless mode games you've gotten 9/9 on in a row)
- Add script to override daily game with custom one which if manually run and add a "Today's Birdoku Designed by: " that prints on the page, where the name is pulled from the puzzle JSON and that text does not appear if there is no name listed
- Add "Today's Difficulty" text where difficulty is classed based on average number of possible answers across cells

## Contact

Found a bug or error? Have an interesting feature suggestion? Want to let me know you love or hate this game? Feel free to shoot me an email at mwmaron2@illinois.edu (but please don't be mean if you do hate it!).
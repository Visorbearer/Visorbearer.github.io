## Introduction

Hello! My name is Mason Maron. As of writing this (6/16/2026), I'm a graduate student in the Migration Biology Lab at the University of Illinois Urbana-Champaign. As both a bird researcher and avid birder, I often try my luck at daily web-based and bird themed games like [birdiegame](https://birdiegame.net/) and [Find-a-Flock](https://find-a-flock.com/) (two other great games I recommend checking out!). I'm also a pokemon fan, and similarly will occassionally enjoy a round of [Pokedoku](https://pokedoku.com/). Inspired by those sources, I created this game, **Birdoku**.

The way it works is simple. Using data from BIRDBASE *([Şekercioğlu et al. 2025](https://doi.org/10.1038/s41597-025-05615-3))*, a new 3 × 3 grid of bird traits is generated each day. Each row and column contain a trait, crossing over such that each cell represents the combination of those traits. For example, if column 1 is "Habitat: Forest" and row 1 is "Diet: Scavenger", then cell 1 is looking for a forest-dwelling scavenger, such as American Crow. By entering American Crow into that cell, you'd be answering what you believe falls under the trait pairing.

## Folder Structure

The directory looks like this:

```
Birdoku/
│
├── data/
│   ├── BIRDBASE v2025.1 Sekercioglu et al. Final.xlsx      # The BIRDBASE dataset
│   ├── species_lookup.csv                                  # A lookup of all possible common names
│   └── value_translator.csv                                # A BIRDBASE lookup for categories in Birdoku 
│
├── answers/                                                # Each day's answers!
│   ├── 20260616_answers.json
│   ├── 20260617_answers.json
│   └── ...
│
├── scripts/                                        
│   ├── pick_cats.py                                        # Generates the daily grid + valid answers
│   └── play_game.py                                        # Rudimentary local Streamlit game
│
├── README.md                                               # This!
│
├── requirements.txt                                        # Python env requirements
└── .gitignore
```

## Release Log

It's not out yet! Just you wait... whoever you are who is reading my GitHub commit history :)

## Future Improvements

These are the things I'd like to add or update in the future to improve the game. I'll be removing them as they are accomplished.

- Allow players to log in and save past scores and view stats (once there are stats)
- Score rarity for each correct bird after submitting based on eBird observation count
- Allow players to replay past games they missed, though they won't contribute to user score
- Add a link within my site to this and a link for BMAC
- Add a question mark in circle icon to the top right which can be clicked on to bring up a brief "How to Play" overlay while graying out the background
- Set images/illustrations to appear in the boxes after the answer is submitted
- Create and add a logo to replace the bird emoji
- Add an "endless mode" which endlessly generates new sets for users to play, though they don't effect score (but maybe can add an "endless mode streak" of how many endless mode games you've gotten 9/9 on in a row)

## Contact

Found a bug or error? Have an interesting feature suggestion? Want to let me know you love or hate this game? Feel free to shoot me an email at mwmaron2@illinois.edu (but please don't be mean if you do hate it!).
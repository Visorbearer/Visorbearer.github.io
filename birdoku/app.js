const STORAGE_KEY = "birdoku_scores_v1";
const ENDLESS_STATS_STORAGE_KEY = "birdoku_endless_stats_v1";
const THEME_STORAGE_KEY = "birdoku_theme";
const TAXONOMY_STORAGE_KEY = "birdoku_taxonomy";

const DIFFICULTY_EXCEPTION_CATEGORIES = new Set([
  "Volancy: Flightless",
  "Nest Parasitism: Nest Parasite",
  "IUCN Red List Status: Extinct",
  "Location: Madagascar & Surrounding Islands",
  "Social Behavior: Lekking",
  "Movement: Non-Migratory",
  "Nest Substrate: Cactus",
]);

const ENDLESS_MIN_SPECIES_PER_CELL = 150;
const ENDLESS_MIN_SPECIES_PER_EXCEPTION_CELL = 10;
const ENDLESS_MAX_ATTEMPTS = 5000;

let puzzle = null;
let species = [];
let speciesTraits = {};
let taxonomyLookup = {
  byScientific: {},
  byAviListCommon: {},
  nameToScientific: {},
};
let ebirdImageLookup = {};
let categoryReference = {};
let puzzleDateKey = null;
let archiveMode = false;

let endlessMode = false;
let endlessCategorySpeciesCache = null;

function getTodayKey() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function getRequestedArchiveDateKey() {
  const params = new URLSearchParams(window.location.search);
  const requestedDate = params.get("date");
  const todayKey = getTodayKey();

  if (
    requestedDate &&
    /^\d{8}$/.test(requestedDate) &&
    requestedDate < todayKey
  ) {
    return requestedDate;
  }

  return null;
}

function getPuzzleDateKey() {
  return getRequestedArchiveDateKey() || getTodayKey();
}

function isArchiveMode() {
  return getPuzzleDateKey() !== getTodayKey();
}

function displayDateFromKey(dateKey) {
  const year = dateKey.slice(0, 4);
  const month = dateKey.slice(4, 6);
  const day = dateKey.slice(6, 8);

  return `${month}/${day}/${year}`;
}

function addPreferredBreaks(value) {
  return escapeHtml(value)
    .replaceAll(", ", ",<wbr> ")
    .replaceAll("/", "/<wbr>");
}

function shortCategoryName(category) {
  const replacements = {
    "IUCN Red List Status": "IUCN Red List Status",
    "Social Behavior": "Social Behavior",
    "Nest Substrate": "Nest Substrate",
    "Nest Type": "Nest Type",
    "Nest Parasitism": "Nest Parasitism",
    "Movement": "Movement",
    "Location": "Location",
    "Habitat": "Habitat",
    "Diet": "Diet",
    "Volancy": "Volancy"
  };

  return replacements[category] || category;
}

function formatCategoryLabel(label) {
  if (!label.includes(":")) {
    return addPreferredBreaks(label);
  }

  const [first, ...restParts] = label.split(":");
  const rest = restParts.join(":").trim();

  return `
    <span class="category-full">
      <strong>${escapeHtml(first)}:</strong>&nbsp;${addPreferredBreaks(rest)}
    </span>
    <span class="category-short">
      <strong>${escapeHtml(shortCategoryName(first))}:</strong> ${addPreferredBreaks(rest)}
    </span>
  `;
}

function closeCategoryInfoPopovers() {
  document.querySelectorAll(".category-info-popover").forEach((popover) => {
    popover.classList.remove("is-open");
    popover.setAttribute("aria-hidden", "true");
  });
}

function getCategoryGroup(label) {
  if (!label.includes(":")) {
    return label.trim();
  }

  return label.split(":")[0].trim();
}

function buildCategoryInfoPopover(categoryLabel) {
  const group = getCategoryGroup(categoryLabel);
  const values = categoryReference[group] || [];

  if (values.length === 0) {
    return null;
  }

  const popover = document.createElement("div");
  popover.className = "category-info-popover";
  popover.setAttribute("aria-hidden", "true");

  const title = document.createElement("div");
  title.className = "category-info-title";
  title.textContent = `${group} Options`;

  const list = document.createElement("ul");
  list.className = "category-info-list";

  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    list.appendChild(item);
  }

  popover.appendChild(title);
  popover.appendChild(list);

  return popover;
}

function makeCategoryHeaderClickable(header, categoryLabel) {
  const popover = buildCategoryInfoPopover(categoryLabel);

  if (!popover) {
    return;
  }

  header.classList.add("clickable-category");
  header.title = "Click to see other options in this category";
  header.appendChild(popover);

  header.addEventListener("click", (event) => {
    event.stopPropagation();

    const alreadyOpen = popover.classList.contains("is-open");

    closeCategoryInfoPopovers();

    if (!alreadyOpen) {
      popover.classList.add("is-open");
      popover.setAttribute("aria-hidden", "false");
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadScores() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveScores(scores) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
}

function getSavedScore(dateKey) {
  return loadScores()[dateKey] || null;
}

function saveScore(dateKey, scoreData) {
  const scores = loadScores();
  scores[dateKey] = scoreData;
  saveScores(scores);
}

function loadEndlessStats() {
  try {
    return JSON.parse(localStorage.getItem(ENDLESS_STATS_STORAGE_KEY)) || {
      currentStreak: 0,
      bestStreak: 0,
      lastScoredPuzzleId: null,
    };
  } catch {
    return {
      currentStreak: 0,
      bestStreak: 0,
      lastScoredPuzzleId: null,
    };
  }
}

function saveEndlessStats(stats) {
  localStorage.setItem(ENDLESS_STATS_STORAGE_KEY, JSON.stringify(stats));
}

function updateEndlessStats(scoreData) {
  const stats = loadEndlessStats();

  // Prevent replaying the same endless puzzle from changing the streak again.
  if (stats.lastScoredPuzzleId === scoreData.date) {
    return stats;
  }

  if (Number(scoreData.score) === 9) {
    stats.currentStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }

  stats.lastScoredPuzzleId = scoreData.date;
  saveEndlessStats(stats);

  return stats;
}

function parseDateKey(dateKey) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6)) - 1;
  const day = Number(dateKey.slice(6, 8));

  return new Date(year, month, day);
}

function dateKeyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isPerfectScore(scoreData) {
  return scoreData && Number(scoreData.score) === 9;
}

function getCompletedDateKeys() {
  return Object.keys(loadScores())
    .filter((dateKey) => /^\d{8}$/.test(dateKey))
    .sort();
}

function getPerfectDateKeys() {
  const scores = loadScores();

  return Object.keys(scores)
    .filter((dateKey) => /^\d{8}$/.test(dateKey))
    .filter((dateKey) => isPerfectScore(scores[dateKey]))
    .sort();
}

function calculateCurrentStreak(todayKey) {
  const scores = loadScores();
  let streak = 0;

  let cursor = parseDateKey(todayKey);

  while (true) {
    const cursorKey = dateKeyFromDate(cursor);

    if (!isPerfectScore(scores[cursorKey])) {
      break;
    }

    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function calculateBestStreak() {
  const perfectKeys = getPerfectDateKeys();

  if (perfectKeys.length === 0) {
    return 0;
  }

  let best = 1;
  let current = 1;

  for (let i = 1; i < perfectKeys.length; i++) {
    const previousDate = parseDateKey(perfectKeys[i - 1]);
    const expectedNextKey = dateKeyFromDate(addDays(previousDate, 1));

    if (perfectKeys[i] === expectedNextKey) {
      current += 1;
    } else {
      current = 1;
    }

    best = Math.max(best, current);
  }

  return best;
}

function calculatePlayedCount() {
  return getCompletedDateKeys().length;
}

function calculateAverageScore() {
  const scores = loadScores();
  const completedKeys = getCompletedDateKeys();

  if (completedKeys.length === 0) {
    return null;
  }

  const total = completedKeys.reduce((sum, dateKey) => {
    return sum + Number(scores[dateKey].score || 0);
  }, 0);

  return total / completedKeys.length;
}

function getStatsSummary(todayKey) {
  return {
    currentStreak: calculateCurrentStreak(todayKey),
    bestStreak: calculateBestStreak(),
    played: calculatePlayedCount(),
    averageScore: calculateAverageScore(),
  };
}

async function loadGameData() {
  puzzleDateKey = getPuzzleDateKey();
  archiveMode = isArchiveMode();

  const puzzleResponse = await fetch(`./puzzles/${puzzleDateKey}.json`, {
    cache: "no-store",
  });

  if (!puzzleResponse.ok) {
    throw new Error(`No puzzle found for ${puzzleDateKey}.`);
  }

  const speciesResponse = await fetch("./data/species_lookup.json", {
    cache: "no-store",
  });

  if (!speciesResponse.ok) {
    throw new Error("Could not load species list.");
  }

  const taxonomyResponse = await fetch("./data/taxonomy_lookup.json", {
    cache: "no-store",
  });

  if (taxonomyResponse.ok) {
    taxonomyLookup = await taxonomyResponse.json();
  }

  const ebirdImageResponse = await fetch("./data/ebird_image_lookup.json", {
    cache: "no-store",
  });

  if (ebirdImageResponse.ok) {
    ebirdImageLookup = await ebirdImageResponse.json();
  }

  const traitsResponse = await fetch("./data/species_traits.json", {
    cache: "no-store",
  });

  if (!traitsResponse.ok) {
    throw new Error("Could not load species traits.");
  }

  const categoryReferenceResponse = await fetch("./data/category_reference.json", {
    cache: "no-store",
  });

  if (categoryReferenceResponse.ok) {
    categoryReference = await categoryReferenceResponse.json();
  }

  puzzle = await puzzleResponse.json();
  species = await speciesResponse.json();
  speciesTraits = await traitsResponse.json();
}

function getCurrentGuesses() {
  const guesses = {};

  for (const row of puzzle.rows) {
    for (const col of puzzle.cols) {
      const cellId = `${row} × ${col}`;
      const input = document.querySelector(`[data-cell-id="${CSS.escape(cellId)}"]`);

      guesses[cellId] = input ? input.value.trim() : "";
    }
  }

  return guesses;
}

function normalizeSearch(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getPreferredTaxonomy() {
  const savedTaxonomy = localStorage.getItem(TAXONOMY_STORAGE_KEY);

  if (savedTaxonomy === "ebird" || savedTaxonomy === "avilist") {
    return savedTaxonomy;
  }

  return "ebird";
}

function setPreferredTaxonomy(taxonomy) {
  localStorage.setItem(TAXONOMY_STORAGE_KEY, taxonomy);
}

function normalizeCommonNameKey(value) {
  return String(value).trim().toLowerCase();
}

function getScientificNameForGuess(commonName) {
  const normalized = normalizeCommonNameKey(commonName);

  return taxonomyLookup.nameToScientific[normalized] || null;
}

function getDisplayNameForScientific(scientificName) {
  const record = taxonomyLookup.byScientific[scientificName];

  if (!record) {
    return null;
  }

  const taxonomy = getPreferredTaxonomy();

  if (taxonomy === "ebird" && record.ebird_common_name) {
    return record.ebird_common_name;
  }

  return record.avilist_common_name || record.ebird_common_name || scientificName;
}

function getDisplayNameForBirdRecord(bird) {
  return getDisplayNameForScientific(bird.scientific_name) || bird.common_name;
}

function speciesCode(name) {
  const words = String(name)
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "";
  }

  if (words.length === 1) {
    return words[0].slice(0, 4);
  }

  return words
    .slice(0, 2)
    .map((word) => word.slice(0, 2))
    .join("");
}

function getBlockedSpecies(currentCellId) {
  const blocked = new Set();

  document.querySelectorAll("input[data-cell-id]").forEach((input) => {
    const cellId = input.dataset.cellId;
    const value = input.value.trim();

    if (cellId !== currentCellId && value) {
      blocked.add(value);
    }
  });

  return blocked;
}

function getSearchableSpeciesOptions() {
  const options = [];

  for (const [scientificName, record] of Object.entries(taxonomyLookup.byScientific)) {
    const displayName = getDisplayNameForScientific(scientificName);

    if (!displayName) {
      continue;
    }

    const aliases = record.names || [displayName];

    options.push({
      displayName,
      scientificName,
      aliases,
    });
  }

  return options;
}

function getSpeciesMatches(query, currentCellId, limit = 12) {
  const q = normalizeSearch(query);
  const blocked = getBlockedSpecies(currentCellId);
  const matches = [];

  if (!q) {
    return [];
  }

  const options =
    Object.keys(taxonomyLookup.byScientific).length > 0
      ? getSearchableSpeciesOptions()
      : species.map((name) => ({
          displayName: name,
          scientificName: null,
          aliases: [name],
        }));

  for (const option of options) {
    if (blocked.has(option.displayName)) {
      continue;
    }

    let bestScore = null;

    for (const alias of option.aliases) {
      const normalizedAlias = normalizeSearch(alias);
      const code = speciesCode(alias);

      let score = null;

      if (code === q) {
        score = 0;
      } else if (code.startsWith(q)) {
        score = 1;
      } else if (normalizedAlias.startsWith(q)) {
        score = 2;
      } else if (normalizedAlias.includes(q)) {
        score = 3;
      }

      if (score !== null && (bestScore === null || score < bestScore)) {
        bestScore = score;
      }
    }

    if (bestScore !== null) {
      matches.push({
        name: option.displayName,
        score: bestScore,
      });
    }
  }

  matches.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }

    return a.name.localeCompare(b.name);
  });

  return matches.slice(0, limit).map((match) => match.name);
}

function closeSuggestions() {
  document.querySelectorAll(".suggestions").forEach((box) => {
    box.remove();
  });
}

function showSuggestions(input) {
  closeSuggestions();

  const query = input.value.trim();
  const cellId = input.dataset.cellId;
  const matches = getSpeciesMatches(query, cellId);

  if (matches.length === 0) {
    return;
  }

  const box = document.createElement("div");
  box.className = "suggestions";

  for (const name of matches) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "suggestion-option";
    option.textContent = name;

    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
      input.value = name;
      closeSuggestions();
    });

    box.appendChild(option);
  }

  input.parentElement.appendChild(box);
}

function handleAutocompleteInput(event) {
  showSuggestions(event.target);
}

function isDuplicateGuess(currentCellId, commonName, guesses) {
  if (!commonName || !guesses) {
    return false;
  }

  const currentScientificName =
    getScientificNameForGuess(commonName) || normalizeCommonNameKey(commonName);

  for (const [cellId, guess] of Object.entries(guesses)) {
    if (cellId === currentCellId || !guess.trim()) {
      continue;
    }

    const guessedScientificName =
      getScientificNameForGuess(guess) || normalizeCommonNameKey(guess);

    if (guessedScientificName === currentScientificName) {
      return true;
    }
  }

  return false;
}

function isCorrect(rowCat, colCat, commonName, guesses = null) {
  if (!commonName) {
    return false;
  }

  const cellId = `${rowCat} × ${colCat}`;

  if (isDuplicateGuess(cellId, commonName, guesses)) {
    return false;
  }

  const guessedScientificName = getScientificNameForGuess(commonName);
  const key = `${rowCat} × ${colCat}`;

  return puzzle.cells[key].some((bird) => {
    if (guessedScientificName) {
      return bird.scientific_name === guessedScientificName;
    }

    return bird.common_name === commonName;
  });
}

function getScoreGrid(guesses) {
  const lines = [];

  for (const row of puzzle.rows) {
    let line = "";

    for (const col of puzzle.cols) {
      const cellId = `${row} × ${col}`;
      const guess = guesses[cellId] || "";

      line += isCorrect(row, col, guess, guesses) ? "🟩" : "🟥";
    }

    lines.push(line);
  }

  return lines.join("\n");
}

function getCorrectCount(guesses) {
  let correctCount = 0;

  for (const row of puzzle.rows) {
    for (const col of puzzle.cols) {
      const cellId = `${row} × ${col}`;
      const guess = guesses[cellId] || "";

      if (isCorrect(row, col, guess, guesses)) {
        correctCount += 1;
      }
    }
  }

  return correctCount;
}

function buildShareText(scoreData) {
  const title =
    scoreData.mode === "archive"
      ? `Birdoku Archive ${scoreData.displayDate}`
      : `Birdoku ${scoreData.displayDate}`;

  const playUrl =
    scoreData.mode === "archive"
      ? `https://masonmaron.com/birdoku/?date=${scoreData.date}`
      : "https://masonmaron.com/birdoku/";

  return (
    `${title}\n` +
    `Score: ${scoreData.score}/9\n\n` +
    `${scoreData.scoreGrid}\n\n` +
    `Play: ${playUrl}`
  );
}

function buildResultTooltip(guess, rowCat, colCat) {
  const speciesStatus = getSpeciesStatusForGuess(guess);

  if (!speciesStatus) {
    return null;
  }

  const rowStatus = speciesStatus[rowCat];
  const colStatus = speciesStatus[colCat];

  if (!rowStatus || !colStatus) {
    return null;
  }

  const tooltip = document.createElement("div");
  tooltip.className = "result-tooltip";

  const rowLine = document.createElement("div");
  rowLine.className = `tooltip-pill ${rowStatus.matches ? "tooltip-good" : "tooltip-bad"}`;
  rowLine.textContent = rowStatus.label;

  const colLine = document.createElement("div");
  colLine.className = `tooltip-pill ${colStatus.matches ? "tooltip-good" : "tooltip-bad"}`;
  colLine.textContent = colStatus.label;

  tooltip.appendChild(rowLine);
  tooltip.appendChild(colLine);

  const hint = document.createElement("div");
  hint.className = "tooltip-hint";
  hint.textContent = "Click tile for more...";

  tooltip.appendChild(hint);

  return tooltip;
}

function getSpeciesStatusForGuess(guess) {
  if (speciesTraits[guess]) {
    return speciesTraits[guess];
  }

  const scientificName = getScientificNameForGuess(guess);

  if (!scientificName) {
    return null;
  }

  const record = taxonomyLookup.byScientific[scientificName];

  if (!record) {
    return null;
  }

  if (record.avilist_common_name && speciesTraits[record.avilist_common_name]) {
    return speciesTraits[record.avilist_common_name];
  }

  if (record.ebird_common_name && speciesTraits[record.ebird_common_name]) {
    return speciesTraits[record.ebird_common_name];
  }

  return null;
}

function findBirdRecordForCell(rowCat, colCat, guess) {
  const key = `${rowCat} × ${colCat}`;
  const guessedScientificName = getScientificNameForGuess(guess);

  if (!puzzle.cells[key]) {
    return null;
  }

  return puzzle.cells[key].find((bird) => {
    if (guessedScientificName) {
      return bird.scientific_name === guessedScientificName;
    }

    return bird.common_name === guess;
  }) || null;
}

function getTaxonomyRecordForBird(guess, birdRecord = null) {
  const scientificName =
    birdRecord?.scientific_name || getScientificNameForGuess(guess);

  if (!scientificName) {
    return null;
  }

  return taxonomyLookup.byScientific[scientificName] || null;
}

function getImageRecordForBird(taxonomyRecord) {
  if (!taxonomyRecord || !taxonomyRecord.scientific_name) {
    return null;
  }

  return ebirdImageLookup[taxonomyRecord.scientific_name] || null;
}

function getAveragePossibleAnswers() {
  const counts = [];

  for (const row of puzzle.rows) {
    for (const col of puzzle.cols) {
      const key = `${row} × ${col}`;
      counts.push(puzzle.cells[key].length);
    }
  }

  const total = counts.reduce((sum, count) => sum + count, 0);
  return total / counts.length;
}

function getEndlessCategorySpecies() {
  if (endlessCategorySpeciesCache) {
    return endlessCategorySpeciesCache;
  }

  const categorySpecies = {};

  for (const [commonName, traitMap] of Object.entries(speciesTraits)) {
    const scientificName =
      taxonomyLookup.byAviListCommon?.[commonName] ||
      getScientificNameForGuess(commonName) ||
      "";

    const birdRecord = {
      common_name: commonName,
      scientific_name: scientificName,
    };

    for (const [category, status] of Object.entries(traitMap)) {
      if (!status || !status.matches) {
        continue;
      }

      if (!categorySpecies[category]) {
        categorySpecies[category] = [];
      }

      categorySpecies[category].push(birdRecord);
    }
  }

  endlessCategorySpeciesCache = categorySpecies;
  return endlessCategorySpeciesCache;
}

function requiredEndlessSpeciesForCell(rowCat, colCat) {
  if (
    DIFFICULTY_EXCEPTION_CATEGORIES.has(rowCat) ||
    DIFFICULTY_EXCEPTION_CATEGORIES.has(colCat)
  ) {
    return ENDLESS_MIN_SPECIES_PER_EXCEPTION_CELL;
  }

  return ENDLESS_MIN_SPECIES_PER_CELL;
}

function endlessCellSpecies(rowCat, colCat, categorySpecies) {
  const rowSpecies = categorySpecies[rowCat] || [];
  const colSpecies = categorySpecies[colCat] || [];

  const colScientific = new Set(
    colSpecies.map((bird) => bird.scientific_name || bird.common_name)
  );

  return rowSpecies.filter((bird) =>
    colScientific.has(bird.scientific_name || bird.common_name)
  );
}

function hasUniqueCategoryGroups(categories) {
  const groups = categories.map((category) => getCategoryGroup(category));
  return groups.length === new Set(groups).size;
}

function getDifficultyExceptionCount() {
  return [...puzzle.rows, ...puzzle.cols].filter((category) =>
    DIFFICULTY_EXCEPTION_CATEGORIES.has(category)
  ).length;
}

function getDifficultyScore(avgAnswers, exceptionCount) {
  const exceptionPenalty = 175;
  return avgAnswers - exceptionCount * exceptionPenalty;
}

function classifyDifficulty(difficultyScore) {
  if (difficultyScore >= 800) {
    return "Easy";
  }

  if (difficultyScore >= 400) {
    return "Medium";
  }

  if (difficultyScore >= 100) {
    return "Hard";
  }

  return "Extreme";
}

function renderPuzzleMeta() {
  const sectionTitle = document.querySelector(".section-title");

  if (!sectionTitle) {
    return;
  }

  const existing = document.getElementById("puzzle-meta");

  if (existing) {
    existing.remove();
  }

  const avgAnswers = getAveragePossibleAnswers();
  const exceptionCount = getDifficultyExceptionCount();
  const difficultyScore = getDifficultyScore(avgAnswers, exceptionCount);
  const difficulty = classifyDifficulty(difficultyScore);

  const meta = document.createElement("div");
  meta.id = "puzzle-meta";
  meta.className = "puzzle-meta";
  meta.title =
    `Average possible answers per cell: ${avgAnswers.toFixed(1)}. ` +
    `Exception categories: ${exceptionCount}. ` +
    `Difficulty score: ${difficultyScore.toFixed(1)}.`;

  const label = document.createElement("span");
  label.textContent = "Difficulty: ";

  const value = document.createElement("span");
  value.className = `difficulty-value difficulty-${difficulty.toLowerCase()}`;
  value.textContent = difficulty;

  meta.appendChild(label);
  meta.appendChild(value);

  sectionTitle.insertAdjacentElement("afterend", meta);
}

function renderLocalStats() {
  document.getElementById("endless-stats")?.remove();

  if (endlessMode) {
    document.getElementById("local-stats")?.remove();
    return;
  }
  const existing = document.getElementById("local-stats");

  if (existing) {
    existing.remove();
  }

  const puzzleMeta = document.getElementById("puzzle-meta");
  const insertAfter = puzzleMeta || document.querySelector(".section-title");

  if (!insertAfter || !puzzle) {
    return;
  }

  const stats = getStatsSummary(getTodayKey());

  const statsEl = document.createElement("div");
  statsEl.id = "local-stats";
  statsEl.className = "local-stats";

  const average =
    stats.averageScore === null ? "-" : stats.averageScore.toFixed(1);

  statsEl.innerHTML = `
    <span title="Current Streak"> Current Streak:  ${stats.currentStreak}</span>
    <span title="Best Streak"> Best Streak: ${stats.bestStreak}</span>
    <span title="Total Birdoku Completed">Played: ${stats.played}</span>
  `;

  insertAfter.insertAdjacentElement("afterend", statsEl);
}

function renderEndlessStats() {
  const existing = document.getElementById("endless-stats");

  if (existing) {
    existing.remove();
  }

  if (!endlessMode) {
    return;
  }

  const insertAfter =
    document.getElementById("puzzle-meta") ||
    document.querySelector(".section-title");

  if (!insertAfter) {
    return;
  }

  const stats = loadEndlessStats();

  const statsEl = document.createElement("div");
  statsEl.id = "endless-stats";
  statsEl.className = "local-stats endless-stats";

  statsEl.innerHTML = `
    <span title="Current Endless Streak">Current Endless Streak: ${stats.currentStreak}</span>
    <span title="Best Endless Streak">Best Endless Streak: ${stats.bestStreak}</span>
  `;

  insertAfter.insertAdjacentElement("afterend", statsEl);
}

function regenerateEndlessPuzzle() {
  if (!endlessMode) {
    return;
  }

  startEndlessMode(false);
}

function hasAnyGuesses() {
  return Object.values(getCurrentGuesses()).some((guess) => guess.trim());
}

function regenerateEndlessPuzzle() {
  if (!endlessMode) {
    return;
  }

  if (hasAnyGuesses()) {
    const ok = window.confirm("Regenerate this endless puzzle? Your current guesses will be lost.");

    if (!ok) {
      return;
    }
  }

  startEndlessMode(false);
}

function renderDesignerCredit() {
  const existing = document.getElementById("designer-credit");

  if (existing) {
    existing.remove();
  }

  if (!puzzle || !puzzle.designer) {
    return;
  }

  const insertAfter =
    document.getElementById("puzzle-meta") ||
    document.querySelector(".section-title");

  if (!insertAfter) {
    return;
  }

  const credit = document.createElement("div");
  credit.id = "designer-credit";
  credit.className = "designer-credit";

  const label = document.createElement("span");
  label.textContent = "Today's Birdoku designed by: ";
  credit.appendChild(label);

  if (puzzle.designer_url) {
    const link = document.createElement("a");
    link.href = puzzle.designer_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = puzzle.designer;
    credit.appendChild(link);
  } else {
    const name = document.createElement("span");
    name.textContent = puzzle.designer;
    credit.appendChild(name);
  }

  insertAfter.insertAdjacentElement("afterend", credit);
}

function renderArchiveNotice() {
  const existing = document.getElementById("archive-notice");

  if (existing) {
    existing.remove();
  }

  if (!archiveMode && !endlessMode) {
    return;
  }

  const insertAfter =
    document.getElementById("local-stats") ||
    document.getElementById("puzzle-meta") ||
    document.querySelector(".section-title");

  if (!insertAfter) {
    return;
  }

  const notice = document.createElement("div");
  notice.id = "archive-notice";
  notice.className = "archive-notice";

  notice.innerHTML = `
    <strong>Archive Mode:</strong>
    ${displayDateFromKey(puzzleDateKey)}.
    This Birdoku will not affect your streak.
    <a href="./">Play today's Birdoku</a>
  `;

  insertAfter.insertAdjacentElement("afterend", notice);
}

function renderPlayableGame() {
  const game = document.getElementById("game");
  const actions = document.getElementById("actions");
  const result = document.getElementById("result");

  result.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "grid";

  const emptyCorner = document.createElement("div");
  emptyCorner.className = "empty-corner";
  grid.appendChild(emptyCorner);

  for (const col of puzzle.cols) {
    const colHeader = document.createElement("div");
    colHeader.className = "cat-box";
    colHeader.innerHTML = formatCategoryLabel(col);
    makeCategoryHeaderClickable(colHeader, col);
    grid.appendChild(colHeader);
  }

  for (let rowIndex = 0; rowIndex < puzzle.rows.length; rowIndex++) {
    const row = puzzle.rows[rowIndex];

    const rowHeader = document.createElement("div");
    rowHeader.className = "cat-box row-cat-box";
    rowHeader.innerHTML = formatCategoryLabel(row);
    grid.appendChild(rowHeader);
    makeCategoryHeaderClickable(rowHeader, row);
    for (let colIndex = 0; colIndex < puzzle.cols.length; colIndex++) {
      const col = puzzle.cols[colIndex];
      const cellId = `${row} × ${col}`;

      const cell = document.createElement("div");
      cell.className = "cell";

      const input = document.createElement("input");
      input.type = "text";
      input.dataset.cellId = cellId;
      input.setAttribute("aria-label", cellId);
      input.setAttribute("autocomplete", "off");
      input.placeholder = "Type bird...";

      input.addEventListener("input", handleAutocompleteInput);
      input.addEventListener("focus", handleAutocompleteInput);
      input.addEventListener("blur", () => {
        setTimeout(closeSuggestions, 120);
      });

      cell.appendChild(input);
      grid.appendChild(cell);
    }
  }

  game.innerHTML = "";
  game.appendChild(grid);

  actions.innerHTML = "";
  actions.className = "actions";

  const submitButton = document.createElement("button");
  submitButton.textContent = "Submit";
  submitButton.addEventListener("click", submitGame);
  actions.appendChild(submitButton);

  if (endlessMode) {
    actions.classList.add("endless-actions");

    const regenerateButton = document.createElement("button");
    regenerateButton.type = "button";
    regenerateButton.className = "regenerate-button";
    regenerateButton.title = "Generate a different Birdoku puzzle";
    regenerateButton.setAttribute("aria-label", "Generate a different Birdoku puzzle");

    const icon = document.createElement("img");
    icon.src = "./assets/redo.png";
    icon.alt = "";
    icon.className = "regenerate-icon";
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = "Regenerate";

    regenerateButton.appendChild(icon);
    regenerateButton.appendChild(label);

    regenerateButton.addEventListener("click", regenerateEndlessPuzzle);

    actions.appendChild(regenerateButton);
  }
}

function renderCompletedGame(scoreData) {
  const game = document.getElementById("game");
  const actions = document.getElementById("actions");
  const result = document.getElementById("result");

  const grid = document.createElement("div");
  grid.className = "grid";

  const emptyCorner = document.createElement("div");
  emptyCorner.className = "empty-corner";
  grid.appendChild(emptyCorner);

  for (const col of puzzle.cols) {
    const colHeader = document.createElement("div");
    colHeader.className = "cat-box";
    colHeader.innerHTML = formatCategoryLabel(col);
    makeCategoryHeaderClickable(colHeader, col);
    grid.appendChild(colHeader);
  }

  for (const row of puzzle.rows) {
    const rowHeader = document.createElement("div");
    rowHeader.className = "cat-box row-cat-box";
    rowHeader.innerHTML = formatCategoryLabel(row);
    makeCategoryHeaderClickable(rowHeader, row);
    grid.appendChild(rowHeader);

    for (const col of puzzle.cols) {
      const cellId = `${row} × ${col}`;
      const guess = scoreData.guesses[cellId] || "";
      const correct = isCorrect(row, col, guess, scoreData.guesses);

      const box = document.createElement("div");
      box.className = `result-box ${correct ? "correct-box" : "wrong-box"}`;

      if (guess) {
        box.title = "Click tile for more";
        box.addEventListener("click", () => {
          openBirdDetailModal(guess, row, col, correct);
        });
      }

      const label = document.createElement("div");
      label.className = "result-label";
      label.textContent = guess || "-";
      box.appendChild(label);

      if (guess) {
        const tooltip = buildResultTooltip(guess, row, col);

        if (tooltip) {
          box.appendChild(tooltip);
        }
      }

      grid.appendChild(box);
    }
  }

  game.innerHTML = "";
  game.appendChild(grid);

  actions.innerHTML = "";
  actions.className = "actions";

  if (endlessMode) {
    actions.classList.add("endless-actions");

    const playAgainButton = document.createElement("button");
    playAgainButton.textContent = "Play Again";
    playAgainButton.addEventListener("click", () => {
      document.getElementById("result").innerHTML = "";
      renderPlayableGame();
    });

    const playAnotherButton = document.createElement("button");
    playAnotherButton.textContent = "Play Another";
    playAnotherButton.addEventListener("click", () => {
      startEndlessMode(false);
    });

    actions.appendChild(playAgainButton);
    actions.appendChild(playAnotherButton);
  } else {
    const copyButton = document.createElement("button");
    copyButton.textContent = "Share Results! 🔗";
    copyButton.addEventListener("click", async () => {
      const status = document.getElementById("copy-status");

      try {
        await navigator.clipboard.writeText(scoreData.shareText);
        status.textContent = "Results copied!";
      } catch {
        status.textContent = "Could not copy automatically. Please copy manually.";
      }
    });

    actions.appendChild(copyButton);
  }

  const resultCaption = endlessMode
    ? "Endless Mode puzzles do not affect your daily streak."
    : "Thanks for playing today’s Birdoku!";

  result.innerHTML = `
    <div class="result-panel">
      <div class="success">Score: ${scoreData.score}/9</div>
      <div class="caption">${resultCaption}</div>
      <div id="copy-status" class="copy-status"></div>
    </div>
  `;
}

function getRandomItems(values, count) {
  const copy = [...values];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy.slice(0, count);
}

function getPossibleAnswerExamples(rowCat, colCat, submittedGuess, count = 3) {
  const key = `${rowCat} × ${colCat}`;
  const answers = puzzle.cells[key] || [];
  const submittedScientificName = getScientificNameForGuess(submittedGuess);

  const filtered = answers.filter((bird) => {
    if (submittedScientificName) {
      return bird.scientific_name !== submittedScientificName;
    }

    return bird.common_name !== submittedGuess;
  });

  return getRandomItems(filtered, count);
}

function submitGame() {
  closeSuggestions();

  const guesses = getCurrentGuesses();

  if (hasEmptyGuesses(guesses)) {
    openIncompleteSubmitModal(() => {
      finalizeSubmitGame(guesses);
    });

    return;
  }

  finalizeSubmitGame(guesses);
}

function finalizeSubmitGame(guesses) {
  const score = getCorrectCount(guesses);
  const scoreGrid = getScoreGrid(guesses);
  const displayDate = displayDateFromKey(puzzle.date);

  const scoreData = {
    date: puzzle.date,
    displayDate,
    score,
    scoreGrid,
    guesses,
    mode: endlessMode ? "endless" : archiveMode ? "archive" : "daily",
    submittedAt: new Date().toISOString(),
  };

  scoreData.shareText = buildShareText(scoreData);

  if (endlessMode) {
    updateEndlessStats(scoreData);
    renderEndlessStats();
  } else if (!archiveMode) {
    saveScore(puzzle.date, scoreData);
    renderLocalStats();
  }

  renderCompletedGame(scoreData);
}

async function init() {
  const loading = document.getElementById("loading");

  try {
    await loadGameData();

    loading.style.display = "none";

    renderPuzzleMeta();

    renderDesignerCredit();

    renderLocalStats();

    renderArchiveNotice();

    // This version would let you replay dates in the archive that
    // you already played live
    // const saved = archiveMode ? null : getSavedScore(puzzle.date);

    // This version instead prevents you from replaying dates in the archive
    // if you played them live
    const saved = getSavedScore(puzzle.date);

    if (saved) {
      renderCompletedGame(saved);
    } else {
      renderPlayableGame();
    }
  } catch (error) {
    loading.id = "error";
    loading.textContent = error.message;
  }
}

function shuffleArray(values) {
  const copy = [...values];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

// Endless mode!

function generateEndlessPuzzle() {
  const categorySpecies = getEndlessCategorySpecies();

  const usableCategories = Object.keys(categorySpecies).filter((category) => {
    const count = categorySpecies[category].length;

    return (
      count >= ENDLESS_MIN_SPECIES_PER_CELL ||
      DIFFICULTY_EXCEPTION_CATEGORIES.has(category)
    );
  });

  for (let attempt = 0; attempt < ENDLESS_MAX_ATTEMPTS; attempt++) {
    const chosen = shuffleArray(usableCategories).slice(0, 6);

    if (!hasUniqueCategoryGroups(chosen)) {
      continue;
    }

    const rowCats = chosen.slice(0, 3);
    const colCats = chosen.slice(3);

    const cells = {};
    let valid = true;

    for (const rowCat of rowCats) {
      for (const colCat of colCats) {
        const key = `${rowCat} × ${colCat}`;
        const answers = endlessCellSpecies(rowCat, colCat, categorySpecies);
        const required = requiredEndlessSpeciesForCell(rowCat, colCat);

        if (answers.length < required) {
          valid = false;
          break;
        }

        cells[key] = answers.sort((a, b) =>
          a.common_name.localeCompare(b.common_name)
        );
      }

      if (!valid) {
        break;
      }
    }

    if (valid) {
      return {
        date: `endless-${Date.now()}`,
        mode: "endless",
        rows: rowCats,
        cols: colCats,
        cells,
      };
    }
  }

  throw new Error("Could not generate a new Birdoku puzzle. Something went wrong!");
}

function setSectionTitle(text) {
  const sectionTitle = document.querySelector(".section-title");

  if (sectionTitle) {
    sectionTitle.textContent = text;
  }
}

function updateEndlessButton() {
  const button = document.getElementById("endless-button");

  if (!button) {
    return;
  }

  button.textContent = endlessMode ? "Daily" : "Endless";
  button.setAttribute(
    "aria-label",
    endlessMode ? "Return to daily Birdoku" : "Play endless mode"
  );
}

function clearModeNotices() {
  document.getElementById("archive-notice")?.remove();
  document.getElementById("endless-notice")?.remove();
}

function renderEndlessNotice() {
  const existing = document.getElementById("endless-notice");

  if (existing) {
    existing.remove();
  }

  if (!endlessMode) {
    return;
  }

  const insertAfter =
    document.getElementById("endless-stats") ||
    document.getElementById("puzzle-meta") ||
    document.querySelector(".section-title");

  if (!insertAfter) {
    return;
  }

  const notice = document.createElement("div");
  notice.id = "endless-notice";
  notice.className = "endless-notice";
  notice.innerHTML = `
    <strong>Playing in Endless Mode.</strong>
    Puzzles are randomly generated.
  `;

  insertAfter.insertAdjacentElement("afterend", notice);
}

function startEndlessMode(showWelcome = true) {
  endlessMode = true;
  archiveMode = false;

  puzzle = generateEndlessPuzzle();
  puzzleDateKey = puzzle.date;

  setSectionTitle("Endless Mode");
  updateEndlessButton();

  document.getElementById("result").innerHTML = "";

  renderPuzzleMeta();
  renderEndlessStats();
  renderEndlessNotice();

  document.getElementById("local-stats")?.remove();
  document.getElementById("archive-notice")?.remove();
  document.getElementById("designer-credit")?.remove();

  renderPlayableGame();

  if (showWelcome) {
    openEndlessWelcomeModal();
  }
}

function returnToDailyMode() {
  window.location.href = "./";
}

// How to Play popup stuff
function openHowToPlay() {
  const modal = document.getElementById("how-to-play-modal");

  if (!modal) {
    return;
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeHowToPlay() {
  const modal = document.getElementById("how-to-play-modal");

  if (!modal) {
    return;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function openHowToPlayModal() {
  const modal = document.getElementById("how-to-play-modal");

  if (!modal) {
    return;
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeHowToPlayModal() {
  const modal = document.getElementById("how-to-play-modal");

  if (!modal) {
    return;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function setupHowToPlayModal() {
  const button = document.getElementById("how-to-play-button");
  const closeButton = document.getElementById("how-to-play-close");
  const modal = document.getElementById("how-to-play-modal");

  if (button) {
    button.addEventListener("click", openHowToPlayModal);
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeHowToPlayModal);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeHowToPlayModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeHowToPlayModal();
    }
  });
}

function hasEmptyGuesses(guesses) {
  return Object.values(guesses).some((guess) => !guess.trim());
}

function openIncompleteSubmitModal(onConfirm) {
  const modal = document.getElementById("incomplete-submit-modal");
  const yesButton = document.getElementById("incomplete-submit-yes");
  const noButton = document.getElementById("incomplete-submit-no");

  if (!modal || !yesButton || !noButton) {
    onConfirm();
    return;
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");

    yesButton.removeEventListener("click", handleYes);
    noButton.removeEventListener("click", handleNo);
    modal.removeEventListener("click", handleBackdrop);
  }

  function handleYes() {
    closeModal();
    onConfirm();
  }

  function handleNo() {
    closeModal();
  }

  function handleBackdrop(event) {
    if (event.target === modal) {
      closeModal();
    }
  }

  yesButton.addEventListener("click", handleYes);
  noButton.addEventListener("click", handleNo);
  modal.addEventListener("click", handleBackdrop);

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function openBirdDetailModal(guess, rowCat, colCat, correct) {
  const modal = document.getElementById("bird-detail-modal");
  const content = document.getElementById("bird-detail-content");

  if (!modal || !content || !guess) {
    return;
  }

  const birdRecord = findBirdRecordForCell(rowCat, colCat, guess);
  const taxonomyRecord = getTaxonomyRecordForBird(guess, birdRecord);
  const imageRecord = getImageRecordForBird(taxonomyRecord);

  const scientificName =
    birdRecord?.scientific_name ||
    taxonomyRecord?.scientific_name ||
    "";

  const displayName =
    scientificName
      ? getDisplayNameForScientific(scientificName) || guess
      : guess;

  const speciesStatus = getSpeciesStatusForGuess(guess);
  const rowStatus = speciesStatus ? speciesStatus[rowCat] : null;
  const colStatus = speciesStatus ? speciesStatus[colCat] : null;

  content.innerHTML = "";

  const header = document.createElement("div");
  header.className = "bird-detail-header";

  const title = document.createElement("h2");
  title.id = "bird-detail-title";
  title.className = "bird-detail-title";

  if (taxonomyRecord && taxonomyRecord.ebird_url) {
    const link = document.createElement("a");
    link.href = taxonomyRecord.ebird_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = displayName;
    title.appendChild(link);
  } else {
    title.textContent = displayName;
  }

  header.appendChild(title);

  if (scientificName) {
    const scientific = document.createElement("div");
    scientific.className = "bird-detail-scientific";
    scientific.textContent = scientificName;
    header.appendChild(scientific);
  }

  content.appendChild(header);

  const imageWrap = document.createElement("div");
  imageWrap.className = "bird-detail-image-wrap";

  const image = document.createElement("img");
  image.className = "bird-detail-image";
  image.src = imageRecord.image_url;
  image.alt = displayName;
  image.loading = "lazy";

  imageWrap.appendChild(image);
  content.appendChild(imageWrap);

  const traits = document.createElement("div");
  traits.className = "bird-detail-traits";

  for (const status of [rowStatus, colStatus]) {
    if (!status) {
      continue;
    }

    const line = document.createElement("div");
    line.className = `tooltip-pill ${status.matches ? "tooltip-good" : "tooltip-bad"}`;
    line.textContent = status.label;
    traits.appendChild(line);
  }

  if (!rowStatus && !colStatus) {
    const fallback = document.createElement("p");
    fallback.className = "bird-detail-fallback";
    fallback.textContent = correct
      ? "This bird is valid for this cell."
      : "This bird is not valid for this cell.";
    traits.appendChild(fallback);
  }

  if (!correct) {
    const examples = getPossibleAnswerExamples(rowCat, colCat, guess, 3);

    if (examples.length > 0) {
      const examplesBlock = document.createElement("div");
      examplesBlock.className = "possible-answers-block";

      const examplesTitle = document.createElement("div");
      examplesTitle.className = "possible-answers-title";
      examplesTitle.textContent = "Possible Answers Include:";

      const examplesList = document.createElement("ul");
      examplesList.className = "possible-answers-list";

      for (const bird of examples) {
        const item = document.createElement("li");
        item.textContent = getDisplayNameForBirdRecord(bird);
        examplesList.appendChild(item);
      }

      examplesBlock.appendChild(examplesTitle);
      examplesBlock.appendChild(examplesList);
      traits.appendChild(examplesBlock);
    }
  }

  content.appendChild(traits);

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeBirdDetailModal() {
  const modal = document.getElementById("bird-detail-modal");

  if (!modal) {
    return;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function setupBirdDetailModal() {
  const closeButton = document.getElementById("bird-detail-close");
  const modal = document.getElementById("bird-detail-modal");

  if (closeButton) {
    closeButton.addEventListener("click", closeBirdDetailModal);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeBirdDetailModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeBirdDetailModal();
    }
  });
}

function openEndlessWelcomeModal() {
  const modal = document.getElementById("endless-welcome-modal");

  if (!modal) {
    return;
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeEndlessWelcomeModal() {
  const modal = document.getElementById("endless-welcome-modal");

  if (!modal) {
    return;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function setupEndlessMode() {
  const button = document.getElementById("endless-button");
  const closeButton = document.getElementById("endless-welcome-close");
  const modal = document.getElementById("endless-welcome-modal");

  if (button) {
    button.addEventListener("click", () => {
      if (endlessMode) {
        returnToDailyMode();
      } else {
        startEndlessMode(true);
      }
    });
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeEndlessWelcomeModal);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeEndlessWelcomeModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeEndlessWelcomeModal();
    }
  });

  updateEndlessButton();
}

function getPreferredTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

// Apply light/dark mode
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);

  const button = document.getElementById("theme-toggle-button");

  if (button) {
    button.textContent = theme === "dark" ? "☀️" : "🌙";
    button.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
  }
}

// Toggle between light an dark mode
function toggleTheme() {
  const currentTheme =
    document.documentElement.getAttribute("data-theme") || getPreferredTheme();

  const nextTheme = currentTheme === "dark" ? "light" : "dark";

  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
}

function setupSettingsModal() {
  const button = document.getElementById("settings-button");
  const closeButton = document.getElementById("settings-close");
  const modal = document.getElementById("settings-modal");
  const themeSelect = document.getElementById("theme-setting");
  const taxonomySelect = document.getElementById("taxonomy-setting");

  function openSettingsModal() {
    if (!modal) {
      return;
    }

    if (themeSelect) {
      themeSelect.value = getPreferredTheme();
    }

    if (taxonomySelect) {
      taxonomySelect.value = getPreferredTaxonomy();
    }

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeSettingsModal() {
    if (!modal) {
      return;
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  if (button) {
    button.addEventListener("click", openSettingsModal);
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeSettingsModal);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeSettingsModal();
      }
    });
  }

  if (themeSelect) {
    themeSelect.addEventListener("change", () => {
      localStorage.setItem(THEME_STORAGE_KEY, themeSelect.value);
      applyTheme(themeSelect.value);
    });
  }

  if (taxonomySelect) {
    taxonomySelect.addEventListener("change", () => {
      setPreferredTaxonomy(taxonomySelect.value);
      location.reload();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettingsModal();
    }
  });
}

// Archive mode dropdown stuff
function formatArchiveDateLabel(dateKey) {
  const year = dateKey.slice(0, 4);
  const month = dateKey.slice(4, 6);
  const day = dateKey.slice(6, 8);

  return `${month}/${day}/${year}`;
}

async function loadArchiveDates() {
  const response = await fetch("./puzzles/index.json", {
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const dates = await response.json();

  return dates
    .filter((dateKey) => /^\d{8}$/.test(dateKey))
    .sort()
    .reverse();
}

function closeArchiveDropdown() {
  const dropdown = document.getElementById("archive-dropdown");

  if (!dropdown) {
    return;
  }

  dropdown.classList.remove("is-open");
  dropdown.setAttribute("aria-hidden", "true");
}

async function toggleArchiveDropdown() {
  const dropdown = document.getElementById("archive-dropdown");

  if (!dropdown) {
    return;
  }

  if (dropdown.classList.contains("is-open")) {
    closeArchiveDropdown();
    return;
  }

  dropdown.innerHTML = `<div class="archive-empty">Loading...</div>`;
  dropdown.classList.add("is-open");
  dropdown.setAttribute("aria-hidden", "false");

  const dates = await loadArchiveDates();
  const todayKey = getTodayKey();

  const archiveDates = dates.filter((dateKey) => dateKey < todayKey);

  dropdown.innerHTML = "";

  if (archiveDates.length === 0) {
    dropdown.innerHTML = `<div class="archive-empty">No archive yet</div>`;
    return;
  }

  for (const dateKey of archiveDates) {
    const link = document.createElement("a");
    link.className = "archive-link";
    link.href = `./?date=${dateKey}`;
    link.textContent = formatArchiveDateLabel(dateKey);

    dropdown.appendChild(link);
  }
}

function setupArchiveDropdown() {
  const button = document.getElementById("archive-button");
  const dropdown = document.getElementById("archive-dropdown");

  if (button) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleArchiveDropdown();
    });
  }

  if (dropdown) {
    dropdown.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  document.addEventListener("click", closeArchiveDropdown);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeArchiveDropdown();
    }
  });
}

document.addEventListener("click", closeCategoryInfoPopovers);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCategoryInfoPopovers();
  }
});

setupHowToPlayModal();
applyTheme(getPreferredTheme());
setupSettingsModal();
setupArchiveDropdown();
setupBirdDetailModal();
setupEndlessMode();

init().then(() => {
  openHowToPlayModal();
  updateEndlessButton();
});
const STORAGE_KEY = "birdoku_scores_v1";
const THEME_STORAGE_KEY = "birdoku_theme";

let puzzle = null;
let species = [];
let speciesTraits = {};
let puzzleDateKey = null;
let archiveMode = false;

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

function getCompletedDateKeys() {
  return Object.keys(loadScores())
    .filter((dateKey) => /^\d{8}$/.test(dateKey))
    .sort();
}

function calculateCurrentStreak(todayKey) {
  const scores = loadScores();
  let streak = 0;

  let cursor = parseDateKey(todayKey);

  while (true) {
    const cursorKey = dateKeyFromDate(cursor);

    if (!scores[cursorKey]) {
      break;
    }

    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function calculateBestStreak() {
  const completedKeys = getCompletedDateKeys();

  if (completedKeys.length === 0) {
    return 0;
  }

  let best = 1;
  let current = 1;

  for (let i = 1; i < completedKeys.length; i++) {
    const previousDate = parseDateKey(completedKeys[i - 1]);
    const currentDate = parseDateKey(completedKeys[i]);

    const expectedNextKey = dateKeyFromDate(addDays(previousDate, 1));

    if (completedKeys[i] === expectedNextKey) {
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

  const traitsResponse = await fetch("./data/species_traits.json", {
    cache: "no-store",
  });

  if (!traitsResponse.ok) {
    throw new Error("Could not load species traits.");
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

// Bird-code-ish matching:
// Song Sparrow -> sosp
// American Robin -> amro
// Bald Eagle -> baea
// Northern Cardinal -> noca
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

function getSpeciesMatches(query, currentCellId, limit = 12) {
  const q = normalizeSearch(query);
  const blocked = getBlockedSpecies(currentCellId);
  const matches = [];

  if (!q) {
    return [];
  }

  for (const name of species) {
    if (blocked.has(name)) {
      continue;
    }

    const normalizedName = normalizeSearch(name);
    const code = speciesCode(name);

    let score = null;

    if (code === q) {
      score = 0;
    } else if (code.startsWith(q)) {
      score = 1;
    } else if (normalizedName.startsWith(q)) {
      score = 2;
    } else if (normalizedName.includes(q)) {
      score = 3;
    }

    if (score !== null) {
      matches.push({ name, score });
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

  for (const [cellId, guess] of Object.entries(guesses)) {
    if (cellId !== currentCellId && guess.trim() === commonName.trim()) {
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

  const key = `${rowCat} × ${colCat}`;
  const validNames = new Set(
    puzzle.cells[key].map((bird) => bird.common_name)
  );

  return validNames.has(commonName);
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
  const speciesStatus = speciesTraits[guess];

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

  return tooltip;
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

function classifyDifficulty(avgAnswers) {
  if (avgAnswers >= 750) {
    return "Easy";
  }

  if (avgAnswers >= 250) {
    return "Medium";
  }

  if (avgAnswers >= 100) {
    return "Hard";
  }

  return "Extreme";
}

function renderPuzzleMeta() {
  const sectionTitle = document.querySelector(".section-title");

  if (!sectionTitle || document.getElementById("puzzle-meta")) {
    return;
  }

  const avgAnswers = getAveragePossibleAnswers();
  const difficulty = classifyDifficulty(avgAnswers);

  const meta = document.createElement("div");
  meta.id = "puzzle-meta";
  meta.className = "puzzle-meta";
  meta.title = `Average possible answers per cell: ${avgAnswers.toFixed(1)}`;

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

function renderArchiveNotice() {
  const existing = document.getElementById("archive-notice");

  if (existing) {
    existing.remove();
  }

  if (!archiveMode) {
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
    grid.appendChild(colHeader);
  }

  for (let rowIndex = 0; rowIndex < puzzle.rows.length; rowIndex++) {
    const row = puzzle.rows[rowIndex];

    const rowHeader = document.createElement("div");
    rowHeader.className = "cat-box row-cat-box";
    rowHeader.innerHTML = formatCategoryLabel(row);
    grid.appendChild(rowHeader);

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
    grid.appendChild(colHeader);
  }

  for (const row of puzzle.rows) {
    const rowHeader = document.createElement("div");
    rowHeader.className = "cat-box row-cat-box";
    rowHeader.innerHTML = formatCategoryLabel(row);
    grid.appendChild(rowHeader);

    for (const col of puzzle.cols) {
      const cellId = `${row} × ${col}`;
      const guess = scoreData.guesses[cellId] || "";
      const correct = isCorrect(row, col, guess, scoreData.guesses);

      const box = document.createElement("div");
      box.className = `result-box ${correct ? "correct-box" : "wrong-box"}`;

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

  result.innerHTML = `
    <div class="result-panel">
      <div class="success">Score: ${scoreData.score}/9</div>
      <div class="caption">Thanks for playing today’s Birdoku!</div>
      <div id="copy-status" class="copy-status"></div>
    </div>
  `;
}

function submitGame() {
  closeSuggestions();

  const guesses = getCurrentGuesses();
  const score = getCorrectCount(guesses);
  const scoreGrid = getScoreGrid(guesses);
  const displayDate = displayDateFromKey(puzzle.date);

  const scoreData = {
    date: puzzle.date,
    displayDate,
    score,
    scoreGrid,
    guesses,
    mode: archiveMode ? "archive" : "daily",
    submittedAt: new Date().toISOString(),
  };

  scoreData.shareText = buildShareText(scoreData);

  if (!archiveMode) {
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

function setupHowToPlayModal() {
  const openButton = document.getElementById("how-to-play-button");
  const closeButton = document.getElementById("how-to-play-close");
  const modal = document.getElementById("how-to-play-modal");

  if (openButton) {
    openButton.addEventListener("click", openHowToPlay);
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeHowToPlay);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeHowToPlay();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeHowToPlay();
    }
  });
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

function setupThemeToggle() {
  applyTheme(getPreferredTheme());

  const button = document.getElementById("theme-toggle-button");

  if (button) {
    button.addEventListener("click", toggleTheme);
  }
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

setupHowToPlayModal();
setupThemeToggle();
setupArchiveDropdown();

init();
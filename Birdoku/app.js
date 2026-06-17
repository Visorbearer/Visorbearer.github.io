const STORAGE_KEY = "birdoku_scores_v1";

let puzzle = null;
let species = [];

function getTodayKey() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function displayDateFromKey(dateKey) {
  const year = dateKey.slice(0, 4);
  const month = dateKey.slice(4, 6);
  const day = dateKey.slice(6, 8);

  return `${month}/${day}/${year}`;
}

function formatCategoryLabel(label) {
  if (!label.includes(":")) {
    return escapeHtml(label);
  }

  const [first, ...restParts] = label.split(":");
  const rest = restParts.join(":").trim();

  return `<strong>${escapeHtml(first)}:</strong>&nbsp;${escapeHtml(rest)}`;
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

async function loadGameData() {
  const todayKey = getTodayKey();

  const puzzleResponse = await fetch(`./puzzles/${todayKey}.json`, {
    cache: "no-store",
  });

  if (!puzzleResponse.ok) {
    throw new Error(`No puzzle found for ${todayKey}.`);
  }

  const speciesResponse = await fetch("./data/species_lookup.json", {
    cache: "no-store",
  });

  if (!speciesResponse.ok) {
    throw new Error("Could not load species list.");
  }

  puzzle = await puzzleResponse.json();
  species = await speciesResponse.json();
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
  return (
    `Birdoku ${scoreData.displayDate}\n` +
    `Score: ${scoreData.score}/9\n\n` +
    `${scoreData.scoreGrid}\n\n` +
    `Play: https://masonmaron.com/birdoku/`
  );
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
      box.textContent = guess || "—";

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
    submittedAt: new Date().toISOString(),
  };

  scoreData.shareText = buildShareText(scoreData);

  saveScore(puzzle.date, scoreData);
  renderCompletedGame(scoreData);
}

async function init() {
  const loading = document.getElementById("loading");

  try {
    await loadGameData();

    loading.style.display = "none";

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

init();
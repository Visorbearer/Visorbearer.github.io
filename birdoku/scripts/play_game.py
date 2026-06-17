##  Play the Birdoku game in a local, rudimentary form
##  Boy oh boy, I sure do love being bad at games I make myself!

import json
from pathlib import Path
from datetime import date
import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

# So that it saves your score locally
from streamlit_local_storage import LocalStorage

ROOT = Path(__file__).resolve().parent.parent

TODAY = date.today().strftime("%Y%m%d")
TODAY_DISPLAY = date.today().strftime("%m/%d/%Y")
ANSWERS_PATH = Path("answers") / f"{TODAY}_answers.json"
SPECIES_LOOKUP_PATH = ROOT / "data" / "species_lookup.csv"

# Here comes the CSS, hold on to your butts

st.set_page_config(page_title="Birdoku", layout="centered")

@st.cache_resource
def LocalStorageManager():
    return LocalStorage()

localS = LocalStorageManager()

st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@500;600;700;800&display=swap');

    :root {
        --pixel-font: 'Press Start 2P', monospace;
        --body-font: 'Inter', sans-serif;
        --blue-main: #61a6fa;
        --blue-button: #548eeb;
        --blue-button-hover: #3f79d5;
        --ink: #222;
        --soft-gray: #eef1f5;
    }

    html, body, [class*="css"] {
        font-family: var(--body-font);
    }

    .block-container {
        max-width: 1120px;
        padding-top: 1rem;
        padding-bottom: 2rem;
    }

    /* Header bar */
    .birdoku-header {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 20px;
        padding: 34px 30px 30px 30px;
        margin-bottom: 34px;
        border: 3px solid var(--ink);
        border-radius: 18px;
        background: var(--blue-main);
        box-shadow: 6px 6px 0px var(--ink);
        min-height: 150px;
        overflow: visible;
    }

    .birdoku-logo-placeholder {
        width: 76px;
        height: 76px;
        min-width: 76px;
        border: 3px solid var(--ink);
        border-radius: 14px;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
    }

    .birdoku-title {
        font-family: var(--pixel-font);
        font-size: clamp(28px, 4.2vw, 48px);
        line-height: 1.5;
        margin: 0;
        color: #ffffff;
        text-shadow: 3px 3px 0px var(--ink);
        white-space: nowrap;
    }

    .birdoku-subtitle {
        margin: 10px 0 0 2px;
        font-size: clamp(15px, 1.8vw, 20px);
        font-weight: 800;
        color: #10233f;
    }

    .section-title {
        font-size: clamp(28px, 3vw, 40px);
        font-weight: 900;
        margin-top: 8px;
        margin-bottom: 26px;
        text-align: center;
    }

    /* Add breathing room between grid cells */
    [data-testid="stHorizontalBlock"] {
        gap: 18px;
        margin-bottom: 18px;
    }

    [data-testid="column"] {
        align-self: stretch;
    }

    /* Category headers */
    .cat-box {
        min-height: 66px;
        padding: 12px 14px;
        border: none;
        border-radius: 10px;
        background: var(--soft-gray);
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-size: clamp(14px, 1.15vw, 18px);
        font-weight: 800;
        line-height: 1.25;
        white-space: normal;
        overflow-wrap: normal;
        word-break: normal;
        hyphens: none;
    }

    .row-cat-box {
        min-height: 104px;
        background: var(--soft-gray);
    }

    .result-box {
        min-height: 104px;
        aspect-ratio: 1 / 1;
        padding: 12px;
        border: 3px solid var(--ink);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-weight: 800;
        font-size: clamp(16px, 1.8vw, 24px);
        line-height: 1.15;
    }

    .correct-box {
        background: #d4edda;
    }

    .wrong-box {
        background: #f8d7da;
    }

    .footer {
        margin-top: 42px;
        padding-top: 22px;
        border-top: 1px solid #ddd;
        font-size: 15px;
        color: #555;
        line-height: 1.55;
        text-align: center;
    }

    /* Streamlit dropdown/input styling */
    div[data-baseweb="select"] {
        font-size: 18px;
    }

    div[data-baseweb="select"] > div {
        min-height: 104px;
        border-radius: 10px;
        background-color: var(--soft-gray);
    }

    div[data-baseweb="select"] span,
    div[data-baseweb="select"] div {
        font-size: 18px !important;
        font-weight: 700 !important;
    }

    input {
        font-size: 18px !important;
        font-weight: 700 !important;
    }

    /* Streamlit buttons */
    div.stButton {
        display: flex;
        justify-content: center;
        margin-top: 30px;
        margin-bottom: 24px;
    }

    div.stButton > button {
        background-color: var(--blue-button) !important;
        color: white !important;
        border: 3px solid var(--ink) !important;
        border-radius: 14px !important;
        padding: 1.25rem 3.2rem !important;
        min-width: 330px !important;
        min-height: 90px !important;
        box-shadow: 6px 6px 0px var(--ink) !important;
    }

    div.stButton > button p,
    div.stButton > button span,
    div.stButton > button div {
        font-family: var(--pixel-font) !important;
        font-size: 20px !important;
        font-weight: 400 !important;
        color: white !important;
        line-height: 1.35 !important;
    }

    div.stButton > button:hover {
        background-color: var(--blue-button-hover) !important;
        color: white !important;
        border: 3px solid var(--ink) !important;
    }

    /* Mobile tweaks */
    @media (max-width: 700px) {
        .block-container {
            padding-left: 0.35rem;
            padding-right: 0.35rem;
        }

        .birdoku-header {
            padding: 22px 16px 20px 16px;
            gap: 14px;
            min-height: 105px;
        }

        .birdoku-logo-placeholder {
            width: 54px;
            height: 54px;
            min-width: 54px;
            font-size: 28px;
        }

        .birdoku-title {
            font-size: 22px;
            line-height: 1.45;
        }

        .birdoku-subtitle {
            font-size: 12px;
        }

        [data-testid="stHorizontalBlock"] {
            gap: 8px;
            margin-bottom: 8px;
        }

        .cat-box {
            min-height: 56px;
            font-size: 10px;
            padding: 6px;
        }

        .row-cat-box,
        .result-box {
            min-height: 74px;
        }

        div[data-baseweb="select"] > div {
            min-height: 74px;
        }

        div.stButton > button {
            min-width: 250px !important;
            min-height: 72px !important;
            padding: 0.9rem 1.6rem !important;
        }

        div.stButton > button p,
        div.stButton > button span,
        div.stButton > button div {
            font-size: 14px !important;
        }
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    """
    <div class="birdoku-header">
        <div class="birdoku-logo-placeholder">🐦</div>
        <div>
            <div class="birdoku-title">Birdoku</div>
            <div class="birdoku-subtitle">A daily "sudoku-like" puzzle for birders!</div>
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)

# Later replace emoji with logo

@st.cache_data
def load_answers(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


if not ANSWERS_PATH.exists():
    st.error(f"No puzzle found: {ANSWERS_PATH}")
    st.stop()


with st.spinner("Loading today’s Birdoku..."):
    puzzle = load_answers(ANSWERS_PATH)

    rows = puzzle["rows"]
    cols = puzzle["cols"]
    cells = puzzle["cells"]

    species_df = pd.read_csv(SPECIES_LOOKUP_PATH)
    common_names = species_df["common_name"].tolist()

LOCAL_STORAGE_KEY = "birdoku_scores"

def load_browser_scores():
    raw_scores = localS.getItem(LOCAL_STORAGE_KEY)

    if raw_scores is None:
        return {}

    if isinstance(raw_scores, dict):
        return raw_scores

    try:
        return json.loads(raw_scores)
    except Exception:
        return {}


def save_browser_score(score_data):
    scores = load_browser_scores()
    scores[TODAY] = score_data

    localS.setItem(
        LOCAL_STORAGE_KEY,
        json.dumps(scores)
    )

def restore_today_score_if_available():
    scores = load_browser_scores()
    today_score = scores.get(TODAY)

    if today_score and not st.session_state.submitted:
        st.session_state.guesses = today_score.get("guesses", {})
        st.session_state.submitted = True

if "guesses" not in st.session_state:
    st.session_state.guesses = {}

if "submitted" not in st.session_state:
    st.session_state.submitted = False

restore_today_score_if_available()

def is_correct(row_cat, col_cat, common_name):
    if not common_name:
        return False

    key = f"{row_cat} × {col_cat}"
    valid_names = {bird["common_name"] for bird in cells[key]}

    return common_name in valid_names


def already_used_elsewhere(current_cell, common_name):
    for cell, guess in st.session_state.guesses.items():
        if cell != current_cell and guess == common_name:
            return True
    return False


def get_score_grid():
    lines = []

    for r in rows:
        line = ""

        for c in cols:
            cell_id = f"{r} × {c}"
            guess = st.session_state.guesses.get(cell_id, "")

            if is_correct(r, c, guess):
                line += "🟩"
            else:
                line += "🟥"

        lines.append(line)

    return "\n".join(lines)


def get_correct_count():
    correct_count = 0

    for r in rows:
        for c in cols:
            cell_id = f"{r} × {c}"
            guess = st.session_state.guesses.get(cell_id, "")

            if is_correct(r, c, guess):
                correct_count += 1

    return correct_count

def copy_to_clipboard_button(text, button_label="Share Results! 🔗"):
    escaped_text = json.dumps(text)

    components.html(
        f"""
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
            margin-top: 12px;
            margin-bottom: 12px;
        ">
            <button
                onclick='copyResults()'
                style="
                    background-color: #548eeb;
                    color: white;
                    border: 3px solid #222;
                    border-radius: 14px;
                    padding: 1.25rem 3.2rem;
                    font-family: 'Press Start 2P', monospace;
                    font-size: 20px;
                    line-height: 1.35;
                    font-weight: 400;
                    box-shadow: 6px 6px 0px #222;
                    min-width: 330px;
                    min-height: 90px;
                    cursor: pointer;
                "
            >
                {button_label}
            </button>

            <div id="copy-status" style="
                font-family: 'Inter', sans-serif;
                font-size: 20px;
                font-weight: 800;
                color: #1f7a3a;
                min-height: 32px;
            "></div>
        </div>

        <script>
        function copyResults() {{
            const text = {escaped_text};

            navigator.clipboard.writeText(text).then(function() {{
                document.getElementById("copy-status").innerText = "Results copied!";
            }}, function(err) {{
                document.getElementById("copy-status").innerText = "Could not copy automatically. Please copy manually.";
            }});
        }}
        </script>
        """,
        height=160,
    )

def build_share_text():
    correct_count = get_correct_count()
    grid = get_score_grid()

    return (
        f"Birdoku {TODAY_DISPLAY}\n"
        f"Score: {correct_count}/9\n\n"
        f"{grid}\n\n"
        f"Play: https://masonmaron.com/birdoku"
    )

st.markdown('<div class="section-title">Today\'s Puzzle</div>', unsafe_allow_html=True)

# Print column headers once
header_cols = st.columns(4)
header_cols[0].write("")

def format_category_label(label):
    if ":" not in label:
        return label

    first, rest = label.split(":", 1)
    return f"<strong>{first}:</strong>&nbsp;{rest.strip()}"

for j, c in enumerate(cols):
    header_cols[j + 1].markdown(
        f'<div class="cat-box">{format_category_label(c)}</div>',
        unsafe_allow_html=True,
    )

# Print grid rows
for r in rows:
    cols_for_layout = st.columns(4)

    cols_for_layout[0].markdown(
        f'<div class="cat-box row-cat-box">{format_category_label(r)}</div>',
        unsafe_allow_html=True,
    )

    for j, c in enumerate(cols):
        cell_id = f"{r} × {c}"

        with cols_for_layout[j + 1]:
            current_guess = st.session_state.guesses.get(cell_id, "")

            if st.session_state.submitted:
                correct = is_correct(r, c, current_guess)

                label = current_guess if current_guess else "—"
                result_class = "correct-box" if correct else "wrong-box"

                st.markdown(
                    f"""
                    <div class="result-box {result_class}">
                        {label}
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

            else:
                available_names = [
                    name for name in common_names
                    if not already_used_elsewhere(cell_id, name)
                    or name == current_guess
                ]

                select_options = [""] + available_names

                choice = st.selectbox(
                    label=f"{r} × {c}",
                    options=select_options,
                    index=select_options.index(current_guess)
                    if current_guess in select_options else 0,
                    key=cell_id,
                    label_visibility="collapsed",
                )
        
st.write("")

if not st.session_state.submitted:
    if st.button("Submit"):
        for r in rows:
            for c in cols:
                cell_id = f"{r} × {c}"
                st.session_state.guesses[cell_id] = st.session_state.get(cell_id, "")

        st.session_state.submitted = True

        correct_count = get_correct_count()
        share_text = build_share_text()

        score_data = {
            "date": TODAY,
            "display_date": TODAY_DISPLAY,
            "score": correct_count,
            "score_grid": get_score_grid(),
            "share_text": share_text,
            "guesses": st.session_state.guesses,
        }

        save_browser_score(score_data)

        st.rerun()
else:
    correct_count = get_correct_count()
    share_text = build_share_text()

    st.success(f"Score: {correct_count}/9")
    st.caption("Thanks for playing today’s Birdoku!")

    copy_to_clipboard_button(share_text)

    # This lets me reset the game, to be commented out before release
    #if st.button("Reset"):
    #    st.session_state.guesses = {}
    #    st.session_state.submitted = False
    #    st.rerun()

    # Print footer
st.markdown(
    """
    <div class="footer">
        <p>
            Birdoku is a bird puzzle game built by <a href="https://masonmaron.com/" target="_blank">Mason Maron</a> and inspired by <a href="https://pokedoku.com/" target="_blank">PokeDoku</a>. Species trait data comes from
            <a href="https://doi.org/10.1038/s41597-025-05615-3" target="_blank">BIRDBASE</a>, but this project is not affiliated with BIRDBASE or its creators in any way. 
            Any errors in gameplay categories may reflect either data limitations or developer implementation choices.
        </p>
    </div>
    """,
    unsafe_allow_html=True,
)
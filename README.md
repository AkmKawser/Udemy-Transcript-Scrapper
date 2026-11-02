# Udemy Transcript & Lecture Content Scraper

An automated Playwright-based Python scraper that extracts full video transcripts and article lecture contents from any enrolled Udemy course into a consolidated text file inside `data/output/UdemyTranscript.txt`.

Built specifically to work seamlessly with modern Udemy players, passwordless OTP / multi-factor authentication, and persistent browser sessions.

---

## 📌 Key Features

- **Persistent Session (`Browser_Session/`)**: 
  Saves your cookies and login state locally. You only need to log in **once** manually. On all subsequent runs, the scraper detects your active session and begins scraping immediately.
- **Zero Video Playback**: 
  Videos are never played. Playback is paused instantly to save bandwidth and prevent audio interference.
- **Instant Transcript Copying**: 
  Clicks the player's Transcript toggle, copies all text cue segments directly from the live DOM, and removes duplicate span lines.
- **Full Support for Non-Video Lectures**: 
  Detects and extracts article readings, coding guides, summaries, and assignment texts.
- **Right-Arrow Player Navigation**: 
  Advances through lectures using the purple side right-arrow button (`<svg aria-label="Go to Next lecture">`), matching the official Udemy player experience.
- **Automatic Pre-Scrape File Reset**: 
  Before scraping begins, the output text file (`data/output/UdemyTranscript.txt`) is automatically wiped and reset to empty so old or partial transcripts are never mixed with the new run.
- **Smart Duplicate Prevention**: 
  Uses SHA-256 content hashing to ensure that no lecture or assignment is ever written to the output file twice.
- **Automatic End-of-Course Termination**: 
  Detects disabled navigation controls at the end of the course and halts cleanly without looping.
- **Real-Time Synchronous Appending**: 
  Each lecture is written and flushed to disk immediately upon extraction so your progress is never lost.

---

## 📁 Project Structure

```text
├── Browser_Session/                      # Persistent browser profile & session cookies (git-ignored)
├── configuration/                        # Environment configuration
│   ├── .env                              # Local config (git-ignored, do NOT commit)
│   └── .env.example                      # Safe template
├── data/                                 # Data storage
│   └── output/                           # Output directory
│       └── UdemyTranscript.txt           # Scraped course transcripts and notes
├── docs/                                 # Documentation and reference files
├── messages/                             # Development transcripts and prompt logs
│   └── messages with antigravity.md      # Full chat history & implementation log
├── src/                                  # Source code
│   └── automate.py                       # Main Playwright automation script
├── .gitattributes
├── .gitignore
├── README.md
└── requirements.txt
```

---

## 🚀 Getting Started

### 1. Prerequisites

- **Python 3.9+** installed on your system.
- An active Udemy account with access to the course you want to scrape.

---

### 2. Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/Udemy-Transcript-Scrapper.git
   cd Udemy-Transcript-Scrapper
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Install the Playwright Chromium browser:**
   ```bash
   python -m playwright install chromium
   ```

---

### 3. Configuration

1. Create your local `.env` inside the `configuration/` folder (or copy from the example):
   - **Windows (PowerShell):**
     ```powershell
     Copy-Item configuration\.env.example configuration\.env
     ```
   - **macOS / Linux:**
     ```bash
     cp configuration/.env.example configuration/.env
     ```

2. Set your course URL in `configuration/.env`:
   ```env
   # Udemy Configuration
   COURSE_URL="https://www.udemy.com/course/your-course-slug"

   # Output Configuration
   OUTPUT_FILE="data/output/UdemyTranscript.txt"
   ```

---

### 4. Running the Scraper

Run the script from the project root:

```bash
python src/automate.py
```

#### How the workflow runs:
1. **First Run (One-time Login)**:
   - A visible Chromium browser opens pointing to the Udemy login page.
   - Log in manually using whatever method you prefer (Email OTP code, password, or Google).
   - Once logged in, return to the terminal and press **Enter**.
   - Your session is now saved inside `Browser_Session/`.
2. **Subsequent Runs**:
   - The script detects your existing session automatically (`[OK] Existing login session found! Skipping login step.`).
   - It navigates straight into the course learning player.
3. **Scraping**:
   - Clears any previous content in `data/output/UdemyTranscript.txt`.
   - Traverses each lecture, extracts transcripts or reading materials, hashes the content to prevent duplicates, and writes the output.
   - Clicks the right-arrow next lecture button and automatically stops upon reaching the end of the course.

---

## ⚠️ Notes & Best Practices

- **Personal Study Use**: Use this tool only for personal, offline study of courses you have purchased or legally have access to.
- **Git Security**: Do not commit `configuration/.env` or `Browser_Session/` to source control. Both are already listed in `.gitignore`.

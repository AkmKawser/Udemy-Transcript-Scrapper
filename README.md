# Udemy Transcript & Lecture Content Scraper

An automated Playwright-based scraper that launches a clean browser session, lets you log into Udemy manually with whatever method you prefer (email OTP, password, Google OAuth, etc.), detects your login, and automatically navigates through the course to extract full video transcripts and article lecture contents into `data/output/UdemyTranscript.txt`.

---

## 📌 Features

- **Safe Manual Login**: Opens the browser and holds execution with zero bot interference, letting you log in naturally so Udemy's anti-bot protections are not triggered.
- **Persistent Session**: Uses a local `.browser_session/` cache so you may not even need to re-login on future runs.
- **Automatic Traversal**: Once login is confirmed, the script automatically opens the course, visits every lecture in order, opens the transcript drawer, and extracts the text.
- **Handles Both Video Transcripts & Articles**: Captures timestamped cues from video lectures as well as reading material from text/article lectures.
- **Synchronous Output**: Appends text in real-time to `data/output/UdemyTranscript.txt` as each lecture completes.

---

## 📁 Project Structure

```text
├── configuration/                        # Environment configuration
│   ├── .env                              # Local config (git-ignored, do NOT commit)
│   └── .env.example                      # Safe template
├── data/                                 # Data storage
│   └── output/                           # Scraped transcript text files (UdemyTranscript.txt)
├── docs/                                 # Documentation and reference files
├── messages/                             # Development transcripts and prompt logs
│   └── messages with antigravity.md      # Chat history & project log
├── src/                                  # Source code
│   └── automate.py                       # Main Playwright Python automation script
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

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Install Playwright Browsers:**
   ```bash
   python -m playwright install chromium
   ```

---

### 3. Configuration

Your `configuration/.env` only needs the course URL (and optional output path):

```env
# Udemy Configuration
COURSE_URL="https://www.udemy.com/course/build-a-full-stack-web-app-with-flutter-spring-boot"

# Output Configuration
OUTPUT_FILE="data/output/UdemyTranscript.txt"
```

---

### 4. Running the Scraper

Run the script from the root directory:

```bash
python src/automate.py
```

#### What happens during execution:
1. Chromium opens with `https://www.udemy.com/join/login-popup/`.
2. **Manual Login**:
   - The terminal announces that it is holding execution.
   - You log in manually inside the browser using your email, 6-digit code, password, or Google account.
3. Once logged in:
   - The script detects that you are logged in (you can also hit **Enter** in the terminal if needed).
   - It navigates directly to `COURSE_URL`.
   - Iterates through each lecture, extracts the transcripts and article text, and writes them into `data/output/UdemyTranscript.txt`.

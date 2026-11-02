# Udemy Transcript & Lecture Content Scraper

An automated Playwright-based scraper that logs into your Udemy account, handles email verification (2FA/OTP), navigates through all lectures in a purchased course, and extracts full video transcripts and article lecture contents into a consolidated text file inside `data/output/`.

---

## 📌 Features

- **Automated Login & 2FA**: Automatically logs into Udemy and retrieves the 6-digit email verification code via IMAP (Gmail supported). If email integration isn't configured, falls back to manual terminal prompt.
- **Transcript Extraction**: Opens the Udemy transcript panel, extracts all cue blocks with timestamps, and formats them cleanly.
- **Article & Text Lectures**: Detects non-video text lectures and extracts body content.
- **Course Traversal**: Automatically cycles through lectures using the course navigation controls.
- **Real-Time Synchronous Saving**: Transcripts are written to disk as each lecture finishes into `data/output/` so you never lose progress.

---

## 📁 Project Structure

```text
├── configuration/                        # Environment configuration
│   ├── .env                              # Local secrets (git-ignored, do NOT commit)
│   └── .env.example                      # Safe template — copy to .env and fill in values
├── data/                                 # Data storage
│   └── output/                           # Scraped transcript text files (e.g. UdemyTranscript.txt)
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
- (Optional, but recommended) Gmail account with **App Password** enabled for automatic 2FA code retrieval.

---

### 2. Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/Udemy-Transcript-Scrapper.git
   cd Udemy-Transcript-Scrapper
   ```

2. **Create and activate a virtual environment:**
   - **Windows (PowerShell):**
     ```powershell
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```
   - **macOS / Linux:**
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Install Playwright Browsers:**
   ```bash
   playwright install chromium
   ```

---

### 3. Configuration

1. Copy the example configuration to create your `.env` file (if not already created):
   - **Windows (PowerShell):**
     ```powershell
     Copy-Item configuration\.env.example configuration\.env
     ```
   - **macOS / Linux:**
     ```bash
     cp configuration/.env.example configuration/.env
     ```

2. Open `configuration/.env` and update the parameters:

```env
# Udemy Credentials
UDEMY_EMAIL="your_udemy_email@example.com"
UDEMY_PASSWORD="your_udemy_password"
COURSE_URL="https://www.udemy.com/course/your-course-slug"

# Gmail IMAP Credentials for Automatic 2FA Code (Optional)
# To create an App Password: https://myaccount.google.com/apppasswords
EMAIL_USER="your_email@gmail.com"
EMAIL_APP_PASSWORD="your_16_char_app_password"
IMAP_SERVER="imap.gmail.com"

# Output and Execution Settings
OUTPUT_FILE="data/output/UdemyTranscript.txt"
HEADLESS=false
```

> **Note on 2FA / Verification Code**:
> If you leave `EMAIL_APP_PASSWORD` blank, the scraper will pause at login and ask you to enter the 6-digit code directly in the terminal.

---

### 4. Running the Scraper

Run the script from the root directory using Python:

```bash
python src/automate.py
```

#### What happens during execution:
1. Chromium launches and navigates to the Udemy login page.
2. The script inputs your credentials.
3. If an email verification prompt appears:
   - It fetches the 6-digit code from your email via IMAP (or prompts you in the terminal).
   - Enters the code and confirms.
4. Navigates to `COURSE_URL`.
5. Iterates through each lecture:
   - If a video lecture: opens the transcript sidebar, extracts text and timestamps.
   - If a text/article lecture: extracts all body content.
   - Saves content to the designated output file under `data/output/` (e.g. `data/output/UdemyTranscript.txt`).
   - Clicks "Next" to continue until all lectures are complete.

---

## ⚠️ Important Considerations & Best Practices

- **Respect Terms of Service**: Use this tool only for personal offline study of courses you have purchased or legally have access to.
- **Keep `.env` Secret**: Never commit `configuration/.env` to source control. It is listed in `.gitignore`.
- **Browser Automation Headless vs. Headed**: Keep `HEADLESS=false` initially so you can observe the browser and verify successful login.

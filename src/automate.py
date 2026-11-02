#!/usr/bin/env python3
"""
Udemy Course Transcript & Hands-on Text Extractor

Robust Traversal & Deduplication:
1. Launches persistent browser context so session persists.
2. Lets you log in manually and press Enter when ready.
3. Clears any existing content in the output file before scraping begins.
4. Collects and extracts all lecture items sequentially.
5. Reliably advances via 'Next' button and curriculum fallback without getting stuck.
"""

import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

project_root = Path(__file__).resolve().parent.parent if Path(__file__).resolve().parent.name == "src" else Path(__file__).resolve().parent
env_candidates = [
    project_root / "configuration" / ".env",
    project_root / ".env",
]
for candidate in env_candidates:
    if candidate.exists():
        load_dotenv(dotenv_path=candidate)
        break
else:
    load_dotenv()

COURSE_URL = os.getenv("COURSE_URL", "").strip()
OUTPUT_FILE = os.getenv("OUTPUT_FILE", "data/output/UdemyTranscript.txt")


def initialize_output_file(file_path):
    """Clears/resets the output file before starting a fresh scraping session."""
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("")
    print(f"[*] Cleared existing contents in: {file_path}")


def append_to_transcript_file(file_path, title, content):
    """Synchronously appends lecture transcript/text to file."""
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(f"\n\n{'='*70}\n")
        f.write(f"{title}\n")
        f.write(f"{'='*70}\n\n")
        f.write(content.strip() + "\n")
        f.flush()
    print(f"[+] SAVED: {title} ({len(content)} chars)")


def clean_and_dedup_cues(cues_list):
    """Filters duplicate consecutive lines often caused by twin transcript spans."""
    cleaned = []
    prev = None
    for line in cues_list:
        clean_line = line.strip()
        if clean_line and clean_line != prev:
            cleaned.append(clean_line)
            prev = clean_line
    return cleaned


def extract_current_lecture_title(page, lecture_idx):
    """Extracts current lecture heading from player, sidebar, or breadcrumbs."""
    title_selectors = [
        'h1[data-purpose="lecture-title"]',
        'div[data-purpose="header-title"] h1',
        'span[data-purpose="item-title"]',
        'h2[data-purpose="item-title"]',
        'div[class*="curriculum-item-link--is-current"] span',
        'li[class*="is-current"] span'
    ]
    for sel in title_selectors:
        try:
            loc = page.locator(sel)
            if loc.first.is_visible(timeout=1000):
                text = loc.first.inner_text().strip()
                lines = [l.strip() for l in text.split("\n") if l.strip() and "completed" not in l.lower() and not l.strip().endswith("min")]
                if lines:
                    return lines[0]
        except Exception:
            pass

    # Fallback to document title
    doc_title = page.title()
    if "|" in doc_title:
        candidate = doc_title.split("|")[0].strip()
        if candidate and candidate.lower() != "udemy":
            return candidate

    return f"Lecture {lecture_idx}"


def extract_lecture_content(page):
    """Extracts either video transcript cues or article body."""
    content_lines = []

    # 1. Try to open transcript if video lecture
    try:
        transcript_btn = page.locator('button:has-text("Transcript"), button[data-purpose="transcript-toggle"]')
        if transcript_btn.is_visible(timeout=3000):
            panel = page.locator('[data-purpose="transcript-panel"], div[class*="transcript--transcript-panel"]')
            if not panel.is_visible(timeout=1000):
                transcript_btn.click()
                page.wait_for_timeout(2000)
    except Exception:
        pass

    # Extract cues
    try:
        cues = page.locator('[data-purpose="cue-text"]')
        if cues.count() == 0:
            cues = page.locator('p[data-purpose="transcript-cue"], [class*="transcript--cue-container"] span')

        count = cues.count()
        if count > 0:
            raw_cues = []
            for i in range(count):
                txt = cues.nth(i).inner_text().strip()
                if txt:
                    raw_cues.append(txt)
            content_lines = clean_and_dedup_cues(raw_cues)
            if content_lines:
                print(f"    [+] Extracted {len(content_lines)} transcript cue lines")
    except Exception as e:
        print(f"    [-] Transcript extraction notice: {e}")

    # 2. Check for article / text content if no transcript cues found
    if not content_lines:
        try:
            article_loc = page.locator('div[data-purpose="article-body"], div[class*="article-content"], div[data-purpose="lecture-description"]')
            if article_loc.is_visible(timeout=2000):
                article_txt = article_loc.inner_text().strip()
                if article_txt:
                    content_lines = [article_txt]
                    print("    [+] Extracted article text content")
        except Exception:
            pass

    return "\n\n".join(content_lines) if content_lines else ""


def click_next_lecture(page, visited_urls):
    """
    Attempts multiple reliable strategies to click the Next lecture:
    1. Player Next button ([data-purpose="go-to-next-item"]).
    2. Controls bar next button.
    3. Curriculum sidebar link click with re-opened drawer.
    """
    # Strategy 1: Dedicated next button in player
    next_selectors = [
        'button[data-purpose="go-to-next-item"]',
        'button[aria-label="Next item"]',
        'button[aria-label="Go to next item"]',
        'a[data-purpose="go-to-next-item"]',
        'button:has-text("Next lecture")',
        'a:has-text("Next lecture")'
    ]
    for sel in next_selectors:
        btn = page.locator(sel)
        if btn.is_visible(timeout=1500) and not btn.get_attribute("disabled"):
            try:
                btn.click()
                page.wait_for_timeout(4000)
                curr = page.url.split("?")[0]
                if curr not in visited_urls:
                    return True
            except Exception:
                pass

    # Strategy 2: Use curriculum drawer
    print("    [*] Next button not available; searching curriculum sidebar...")
    try:
        # Ensure drawer is open
        drawer_btn = page.locator('button[data-purpose="curriculum-dropdown-button"], button[aria-label="Course content"], button[data-purpose="course-content-tab"]')
        if drawer_btn.is_visible(timeout=2000):
            try:
                drawer_btn.click()
                page.wait_for_timeout(1000)
            except Exception:
                pass

        # Expand sections
        toggles = page.locator('button[data-purpose="section-panel-toggle"][aria-expanded="false"]')
        for t in range(toggles.count()):
            try:
                toggles.nth(t).click()
                page.wait_for_timeout(200)
            except Exception:
                pass

        # Query all lecture links
        lecture_links = page.locator('a[href*="/learn/lecture/"]')
        total = lecture_links.count()

        for l_idx in range(total):
            item = lecture_links.nth(l_idx)
            href = item.get_attribute("href") or ""
            full_href = ("https://www.udemy.com" + href) if href.startswith("/") else href
            clean_href = full_href.split("?")[0]

            if clean_href not in visited_urls:
                item.scroll_into_view_if_needed(timeout=2000)
                item.click()
                page.wait_for_timeout(4000)
                return True

    except Exception as ex:
        print(f"    [!] Error advancing via curriculum: {ex}")

    return False


def run_automation():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[!] Playwright is not installed. Run: pip install playwright && python -m playwright install chromium")
        sys.exit(1)

    global COURSE_URL

    if not COURSE_URL:
        COURSE_URL = input("[?] Enter your Udemy course URL: ").strip()

    course_url_clean = COURSE_URL.rstrip("/")
    if not course_url_clean.endswith("/learn") and "/learn/lecture" not in course_url_clean:
        course_learn_url = f"{course_url_clean}/learn/"
    else:
        course_learn_url = course_url_clean

    raw_output_file = Path(OUTPUT_FILE)
    if raw_output_file.is_absolute():
        output_path = raw_output_file
    else:
        output_path = (project_root / raw_output_file).resolve()

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Clean existing content in output file before starting
    initialize_output_file(output_path)

    user_data_dir = project_root / ".browser_session"
    user_data_dir.mkdir(exist_ok=True)

    with sync_playwright() as p:
        print("[*] Launching browser window...")
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(user_data_dir),
            headless=False,
            channel="chrome" if os.name == "nt" else None,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--start-maximized"
            ],
            no_viewport=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.pages[0] if context.pages else context.new_page()

        print("\n" + "=" * 70)
        print(">>> STEP 1: LOG IN TO UDEMY <<<")
        print("Opening Udemy in the browser...")
        print("Log in manually if not already logged in.")
        print("=" * 70 + "\n")

        page.goto("https://www.udemy.com/join/login-popup/", wait_until="domcontentloaded")

        input("\n[?] >>> Once you are logged in, PRESS ENTER HERE to start scraping... <<< ")

        print("\n[*] Navigating directly to course learning player...")
        print(f"[*] Target URL: {course_learn_url}")
        page.goto(course_learn_url, wait_until="domcontentloaded")
        page.wait_for_timeout(6000)

        # Handle landing page if it redirected back to course overview
        goto_btn = page.locator('a:has-text("Go to course"), button:has-text("Go to course"), a:has-text("Start course"), button:has-text("Start course")')
        if goto_btn.is_visible(timeout=3000):
            print("[*] Clicking 'Go to course'...")
            goto_btn.first.click()
            page.wait_for_timeout(6000)

        # Ensure sidebar course content is open initially
        try:
            content_tab = page.locator('button[data-purpose="course-content-tab"], button:has-text("Course content")')
            if content_tab.is_visible(timeout=3000):
                content_tab.click()
                page.wait_for_timeout(2000)
        except Exception:
            pass

        print("\n[*] Starting sequential lecture scraper...")

        visited_urls = set()
        lecture_idx = 1
        max_lectures = 250
        consecutive_failures = 0

        while lecture_idx <= max_lectures:
            current_url = page.url
            clean_curr = current_url.split("?")[0]
            print(f"\n--- Processing Lecture {lecture_idx} ---")
            print(f"[*] Page URL: {clean_curr}")

            # Extract title and content for current lecture
            title = extract_current_lecture_title(page, lecture_idx)
            print(f"[*] Title: {title}")

            content = extract_lecture_content(page)
            if content:
                append_to_transcript_file(output_path, f"Lecture {lecture_idx}: {title}", content)
            else:
                print(f"    [-] No text/transcript found on this lecture.")

            visited_urls.add(clean_curr)

            # Advance to next lecture
            advanced = click_next_lecture(page, visited_urls)

            if not advanced:
                consecutive_failures += 1
                print(f"    [!] Could not advance to next lecture (attempt {consecutive_failures} of 2).")
                page.wait_for_timeout(2000)
                if consecutive_failures >= 2:
                    print("\n[✓] Reached the end of the course or no more lectures found.")
                    break
            else:
                consecutive_failures = 0

            lecture_idx += 1

        print("\n" + "=" * 70)
        print(f"[✓] Scraper completed! Transcripts saved to:")
        print(f"    {output_path}")
        print("=" * 70 + "\n")
        context.close()


if __name__ == "__main__":
    run_automation()

#!/usr/bin/env python3
"""
Udemy Course Transcript & Lecture Text Extractor

Simple, Reliable, Interactive-First Flow:
1. Launches visible browser window using your saved session in Browser_Session/.
2. Navigates to the course player.
3. Lets you manually click on whichever lecture you want to start from (e.g. Lecture 1).
4. Once you see the lecture on screen, you press ENTER in the terminal.
5. From that exact lecture onwards, the scraper runs completely hands-free:
   - Pauses the video immediately.
   - Clicks the Transcript button and copies all text.
   - If article/text, copies the reading material.
   - Saves directly as 'Lecture-1', 'Lecture-2', etc. to data/output/UdemyTranscript.txt (deduplicated).
   - Clicks the purple right-arrow button to automatically advance to the next lecture.
   - Repeats until you reach the end of the course!
"""

import os
import sys
import time
import hashlib
from pathlib import Path
from dotenv import load_dotenv

# Ensure UTF-8 output encoding on Windows consoles
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

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


def append_to_transcript_file(file_path, header, content):
    """Synchronously appends lecture transcript/text to file."""
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(f"\n\n{'='*70}\n")
        f.write(f"{header}\n")
        f.write(f"{'='*70}\n\n")
        f.write(content.strip() + "\n")
        f.flush()
    print(f"[+] SAVED: {header} ({len(content)} chars)")


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


def extract_current_lecture_content(page):
    """
    Extracts text without playing video:
    - Pauses video immediately.
    - Clicks the transcript icon button in the player control bar.
    - Extracts cues from the opened transcript container.
    - If article/text, copies the reading material.
    """
    try:
        page.evaluate("""() => {
            document.querySelectorAll('video').forEach(v => {
                if (!v.paused) v.pause();
            });
        }""")
    except Exception:
        pass

    content_lines = []

    # Wake up control bar
    try:
        video_el = page.locator('video, div[data-purpose="video-controls"]').first
        if video_el.is_visible(timeout=1000):
            video_el.hover()
            page.wait_for_timeout(300)
    except Exception:
        pass

    # Transcript toggle button
    transcript_icon_selectors = [
        'button[data-purpose="transcript-toggle"]',
        'button[aria-label*="transcript" i]',
        'button:has(svg[data-purpose*="transcript"])',
        'button:has-text("Transcript")',
        'button#tabs--1--tab--transcript',
        'button[data-purpose="tab-transcript"]'
    ]

    for sel in transcript_icon_selectors:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=1200):
                panel = page.locator('[data-purpose="transcript-panel"], div[class*="transcript--transcript-panel"]').first
                if not panel.is_visible(timeout=1000):
                    btn.click()
                    page.wait_for_timeout(2000)
                break
        except Exception:
            pass

    # Extract cues from the transcript panel
    cue_selectors = [
        '[data-purpose="transcript-panel"] [data-purpose="cue-text"]',
        '[data-purpose="cue-text"]',
        'div[class*="transcript--cue-container"] p',
        'div[class*="transcript--cue-container"] span',
        'p[data-purpose="transcript-cue"]',
        '[data-purpose="transcript-panel"] p'
    ]

    for c_sel in cue_selectors:
        try:
            cues = page.locator(c_sel)
            count = cues.count()
            if count > 0:
                raw_cues = []
                for i in range(count):
                    txt = cues.nth(i).inner_text().strip()
                    if txt:
                        raw_cues.append(txt)
                cleaned = clean_and_dedup_cues(raw_cues)
                if cleaned:
                    content_lines = cleaned
                    print(f"    [+] Transcript extracted: {len(content_lines)} cues")
                    break
        except Exception:
            pass

    # If not a video (i.e. text/article/quiz), extract reading content
    if not content_lines:
        article_selectors = [
            'div[data-purpose="article-body"]',
            'div[class*="article-content"]',
            'div[data-purpose="lecture-description"]',
            'div.ud-text-sm.article-content',
            'div[class*="content-container"]'
        ]
        for a_sel in article_selectors:
            try:
                article_loc = page.locator(a_sel).first
                if article_loc.is_visible(timeout=1500):
                    article_txt = article_loc.inner_text().strip()
                    if article_txt and len(article_txt) > 20:
                        content_lines = [article_txt]
                        print("    [+] Article/text reading copied")
                        break
            except Exception:
                pass

    return "\n\n".join(content_lines) if content_lines else ""


def click_purple_right_arrow(page):
    """Clicks the purple right-arrow button on the player edge."""
    exact_selectors = [
        'svg[aria-label="Go to Next lecture"]',
        'button:has(svg[aria-label="Go to Next lecture"])',
        'button:has(use[*|href*="icon-next"])',
        'button[data-purpose="go-to-next-item"]',
        'button[aria-label="Next item"]',
        'button[aria-label="Next lecture"]'
    ]
    for sel in exact_selectors:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=1200):
                el.scroll_into_view_if_needed(timeout=1000)
                el.click(force=True)
                return True
        except Exception:
            pass

    try:
        clicked_js = page.evaluate("""() => {
            const svg = document.querySelector('svg[aria-label="Go to Next lecture"]') 
                     || document.querySelector('use[*|href="#icon-next"]')?.closest('svg');
            if (svg) {
                const clickable = svg.closest('button, a') || svg;
                if (!clickable.hasAttribute('disabled') && clickable.getAttribute('aria-disabled') !== 'true') {
                    clickable.click();
                    return true;
                }
            }
            return false;
        }""")
        if clicked_js:
            return True
    except Exception:
        pass

    try:
        page.keyboard.press("Shift+N")
        return True
    except Exception:
        pass

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
    initialize_output_file(output_path)

    user_data_dir = project_root / "Browser_Session"
    user_data_dir.mkdir(exist_ok=True)

    with sync_playwright() as p:
        print("[*] Launching browser window...")
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(user_data_dir),
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--start-maximized"
            ],
            no_viewport=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.pages[0] if context.pages else context.new_page()

        print("[*] Checking existing login session...")
        page.goto("https://www.udemy.com/", wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        user_nav = page.locator('[data-purpose="user-dropdown"], a[href*="/home/my-courses"], button[aria-label*="user profile" i], a[href*="/user/edit-profile"]')
        already_logged_in = False
        try:
            already_logged_in = user_nav.first.is_visible(timeout=3000)
        except Exception:
            already_logged_in = False

        if already_logged_in:
            print("\n[OK] Existing login session found! Skipping login step.")
        else:
            print("\n" + "=" * 70)
            print(">>> STEP 1: LOG IN TO UDEMY <<<")
            print("No active session detected. Navigating to login page...")
            print("=" * 70 + "\n")
            page.goto("https://www.udemy.com/join/login-popup/", wait_until="domcontentloaded")
            input("\n[?] >>> Once you are logged in, PRESS ENTER HERE to continue... <<< ")

        print("\n[*] Navigating to course learning player...")
        print(f"[*] Target URL: {course_learn_url}")
        page.goto(course_learn_url, wait_until="domcontentloaded")
        page.wait_for_timeout(6000)

        goto_btn = page.locator('a:has-text("Go to course"), button:has-text("Go to course"), a:has-text("Start course"), button:has-text("Start course")').first
        if goto_btn.is_visible(timeout=3000):
            print("[*] Clicking 'Go to course'...")
            goto_btn.click()
            page.wait_for_timeout(6000)

        # Clear, foolproof checkpoint:
        print("\n" + "=" * 70)
        print(">>> READY TO SCRAPE <<<")
        print("Please check the browser:")
        print("1. If not already on Lecture 1 ('1. Welcome to Stark Group'),")
        print("   simply click on Lecture 1 in the right sidebar right now.")
        print("2. Once Lecture 1 is open in the player, PRESS ENTER HERE to start!")
        print("=" * 70)
        input("\n[?] >>> Press Enter when Lecture 1 is open in the player... <<< ")

        print("\n" + "=" * 70)
        print("[*] STARTING SCRAPER (Sequential hands-free scrape)")
        print("=" * 70)

        lecture_num = 1
        seen_urls = set()
        seen_content_hashes = set()
        consecutive_stalls = 0

        while lecture_num <= 300:
            current_url = page.url.split("?")[0]
            header = f"Lecture-{lecture_num}"
            print(f"\n--- [Processing {header}] ---")
            print(f"[*] URL: {current_url}")

            # Extract Transcript or Reading content directly
            content = extract_current_lecture_content(page)

            if content:
                content_hash = hashlib.sha256(content.strip().encode("utf-8")).hexdigest()

                if content_hash in seen_content_hashes:
                    print("    [!] DUPLICATE: Content already captured. Skipping re-write.")
                else:
                    append_to_transcript_file(output_path, header, content)
                    seen_content_hashes.add(content_hash)
            else:
                print("    [-] Notice: No transcript or text found on this lecture.")

            seen_urls.add(current_url)

            # Click the Purple Right-Arrow button
            print("    [*] Clicking purple right-arrow for next lecture...")
            clicked = click_purple_right_arrow(page)

            if not clicked:
                print("\n[✓] Next arrow not clickable or end of course reached.")
                break

            # Wait for player to transition to next lecture
            prev_url = current_url
            transitioned = False
            for _ in range(6):  # Wait up to 6 seconds for player to advance
                page.wait_for_timeout(1000)
                new_url = page.url.split("?")[0]
                if new_url != prev_url:
                    transitioned = True
                    break

            if not transitioned:
                consecutive_stalls += 1
                print(f"    [!] Player remained on same lecture (stall {consecutive_stalls} of 2).")
            else:
                consecutive_stalls = 0

            if consecutive_stalls >= 2:
                print("\n[✓] Finished all lectures! No more new lectures to advance to.")
                break

            lecture_num += 1

        print("\n" + "=" * 70)
        print(f"[✓] SCRAPING COMPLETED! Output saved to:")
        print(f"    {output_path}")
        print("=" * 70 + "\n")
        context.close()


if __name__ == "__main__":
    run_automation()

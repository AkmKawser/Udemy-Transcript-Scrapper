#!/usr/bin/env python3
"""
Udemy Course Transcript & Lecture Text Extractor

Master Catalog & Differential Ingestion Architecture:
1. Opens course player and discovers ALL lectures across ALL sections upfront.
2. Checks data/output/UdemyTranscript.txt to see which lectures are already present.
3. Visits ONLY the missing/unrecorded lectures one by one.
4. Pauses video immediately, copies transcript cues / article content.
5. Appends the newly scraped lecture to the output file.
6. 100% resilient: independent of player session state or where the video was left off.
"""

import os
import sys
import time
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


def get_existing_recorded_titles(file_path):
    """
    Reads data/output/UdemyTranscript.txt and extracts all lecture headers
    already saved, e.g. "Lecture 1: 1. Welcome to Stark Group".
    """
    if not file_path.exists():
        return set()

    recorded = set()
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line_str = line.strip()
                if line_str.startswith("Lecture ") and ":" in line_str:
                    # e.g., "Lecture 1: 1. Welcome to Stark Group" -> extract title part
                    parts = line_str.split(":", 1)
                    if len(parts) > 1:
                        recorded.add(parts[1].strip().lower())
    except Exception as e:
        print(f"[-] Notice reading existing file: {e}")

    return recorded


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


def discover_all_course_lectures(page):
    """
    Ensures the sidebar is open, expands every section, and builds
    the full ordered catalog of all lectures:
    [{'index': 1, 'title': '...', 'url': '...'}, ...]
    """
    print("[*] Opening Course Content sidebar...")
    try:
        drawer_btn = page.locator('button[data-purpose="curriculum-dropdown-button"], button[aria-label="Course content"]').first
        if drawer_btn.is_visible(timeout=2500):
            drawer_btn.click()
            page.wait_for_timeout(1500)
    except Exception:
        pass

    # Scroll sidebar to top and bottom to trigger any lazy loaded sections
    try:
        page.evaluate("""() => {
            const sidebars = document.querySelectorAll('[data-purpose="curriculum-section-container"], aside, div[class*="curriculum--curriculum-sidebar"]');
            sidebars.forEach(s => s.scrollTop = 0);
        }""")
        page.wait_for_timeout(1000)
    except Exception:
        pass

    # Expand all collapsed section accordion headers
    print("[*] Expanding all sections...")
    section_toggles = page.locator('button[data-purpose="section-panel-toggle"][aria-expanded="false"]')
    for i in range(section_toggles.count()):
        try:
            section_toggles.nth(i).click()
            page.wait_for_timeout(250)
        except Exception:
            pass

    page.wait_for_timeout(2000)

    # Gather all lecture links from the DOM
    catalog = []
    seen_hrefs = set()

    links = page.locator('a[href*="/learn/lecture/"], a[href*="/learn/practice/"]')
    total = links.count()

    print(f"[+] Found {total} raw items in curriculum.")

    for i in range(total):
        try:
            link = links.nth(i)
            raw_href = link.get_attribute("href") or ""
            if not raw_href:
                continue

            full_url = ("https://www.udemy.com" + raw_href) if raw_href.startswith("/") else raw_href
            clean_url = full_url.split("?")[0]

            if clean_url in seen_hrefs:
                continue
            seen_hrefs.add(clean_url)

            # Extract title
            raw_text = link.inner_text().strip()
            lines = [l.strip() for l in raw_text.split("\n") if l.strip() and "completed" not in l.lower() and not l.strip().endswith("min")]
            title = lines[0] if lines else f"Lecture {len(catalog) + 1}"

            catalog.append({
                "index": len(catalog) + 1,
                "title": title,
                "url": clean_url
            })
        except Exception as e:
            print(f"    [-] Error parsing catalog item {i}: {e}")

    return catalog


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

    # Read existing recorded titles
    existing_titles = get_existing_recorded_titles(output_path)
    print(f"[*] Found {len(existing_titles)} existing lecture entries in: {output_path.name}")

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
            input("\n[?] >>> Once you are logged in, PRESS ENTER HERE to start scraping... <<< ")

        print("\n[*] Navigating to course learning player...")
        print(f"[*] Target URL: {course_learn_url}")
        page.goto(course_learn_url, wait_until="domcontentloaded")
        page.wait_for_timeout(6000)

        goto_btn = page.locator('a:has-text("Go to course"), button:has-text("Go to course"), a:has-text("Start course"), button:has-text("Start course")').first
        if goto_btn.is_visible(timeout=3000):
            print("[*] Clicking 'Go to course'...")
            goto_btn.click()
            page.wait_for_timeout(6000)

        # Step 1: Calculate the entire course catalog upfront!
        print("\n" + "=" * 70)
        print("[*] CATALOGING ALL COURSE LECTURES...")
        print("=" * 70)
        catalog = discover_all_course_lectures(page)
        total_lectures = len(catalog)

        print(f"\n[✓] Discovered {total_lectures} total lectures in the course curriculum.")

        # Step 2: Iterate through every catalog item; check if already in file
        for item in catalog:
            lecture_idx = item["index"]
            title = item["title"]
            url = item["url"]

            print(f"\n--- [{lecture_idx}/{total_lectures}] {title} ---")

            # Check if already present in text file
            if title.lower() in existing_titles:
                print(f"    [SKIP] Already recorded in {output_path.name}. Moving to next.")
                continue

            print(f"    [*] Missing from output. Navigating to: {url}")
            try:
                page.goto(url, wait_until="domcontentloaded")
                page.wait_for_timeout(4000)

                # Extract content
                content = extract_current_lecture_content(page)
                if content:
                    append_to_transcript_file(output_path, f"Lecture {lecture_idx}: {title}", content)
                    existing_titles.add(title.lower())
                else:
                    print("    [-] Notice: No transcript or text content available.")

            except Exception as ex:
                print(f"    [!] Error loading lecture {lecture_idx}: {ex}")

        print("\n" + "=" * 70)
        print(f"[✓] ALL {total_lectures} LECTURES ARE NOW SYNCED IN:")
        print(f"    {output_path}")
        print("=" * 70 + "\n")
        context.close()


if __name__ == "__main__":
    run_automation()

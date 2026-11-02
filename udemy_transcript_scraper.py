#!/usr/bin/env python3
"""
Udemy Course Transcript & Hands-on Text Extractor

This script automates:
1. Logging into Udemy with credentials from .env.
2. Checking Gmail via IMAP for the 6-digit login verification code and entering it.
3. Navigating through all lectures (videos & articles) in the specified Udemy course.
4. Extracting transcript cues and lecture text.
5. Synchronously appending content to a transcript text file.
"""

import os
import sys
import re
import time
import imaplib
import email
from email.header import decode_header
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables (supports root .env and configuration/.env)
env_path = Path(__file__).resolve().parent / "configuration" / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

UDEMY_EMAIL = os.getenv("UDEMY_EMAIL", "")
UDEMY_PASSWORD = os.getenv("UDEMY_PASSWORD", "")
COURSE_URL = os.getenv("COURSE_URL", "")

EMAIL_USER = os.getenv("EMAIL_USER", UDEMY_EMAIL)
EMAIL_APP_PASSWORD = os.getenv("EMAIL_APP_PASSWORD", "")
IMAP_SERVER = os.getenv("IMAP_SERVER", "imap.gmail.com")
OUTPUT_FILE = os.getenv("OUTPUT_FILE", "UdemyTranscript.txt")
HEADLESS = os.getenv("HEADLESS", "false").lower() in ("true", "1", "yes")


def fetch_udemy_code_from_email(timeout_seconds=90, poll_interval=5):
    """
    Connects to IMAP (e.g. Gmail) to search for the latest Udemy 6-digit verification code.
    Falls back to terminal manual input if email credentials are missing or retrieval fails.
    """
    if not EMAIL_APP_PASSWORD:
        print("[!] EMAIL_APP_PASSWORD not set in .env.")
        return input("[?] Please enter the 6-digit code received on your email: ").strip()

    print(f"[*] Connecting to IMAP server ({IMAP_SERVER}) to fetch verification code...")
    start_time = time.time()

    while time.time() - start_time < timeout_seconds:
        try:
            mail = imaplib.IMAP4_SSL(IMAP_SERVER)
            mail.login(EMAIL_USER, EMAIL_APP_PASSWORD)
            mail.select("INBOX")

            # Search recent emails
            status, messages = mail.search(None, "ALL")
            if status != "OK" or not messages[0]:
                mail.logout()
                time.sleep(poll_interval)
                continue

            email_ids = messages[0].split()
            # Inspect latest 5 emails in reverse
            for mail_id in reversed(email_ids[-5:]):
                _, msg_data = mail.fetch(mail_id, "(RFC822)")
                for response_part in msg_data:
                    if isinstance(response_part, tuple):
                        msg = email.message_from_bytes(response_part[1])
                        subject, encoding = decode_header(msg.get("Subject", ""))[0]
                        if isinstance(subject, bytes):
                            subject = subject.decode(encoding or "utf-8", errors="ignore")

                        sender = msg.get("From", "")
                        body = ""

                        if msg.is_multipart():
                            for part in msg.walk():
                                content_type = part.get_content_type()
                                if content_type in ("text/plain", "text/html"):
                                    payload = part.get_payload(decode=True)
                                    if payload:
                                        body += payload.decode(errors="ignore") + "\n"
                        else:
                            payload = msg.get_payload(decode=True)
                            if payload:
                                body = payload.decode(errors="ignore")

                        full_text = f"{subject}\n{body}"

                        # Check if message is from or related to Udemy
                        if "udemy" in sender.lower() or "udemy" in full_text.lower():
                            match = re.search(r"\b(\d{6})\b", full_text)
                            if match:
                                code = match.group(1)
                                print(f"[+] Found verification code in email: {code}")
                                mail.logout()
                                return code

            mail.logout()
        except Exception as e:
            print(f"[-] IMAP polling error: {e}")

        print(f"[*] Waiting for Udemy verification email... ({int(time.time() - start_time)}s elapsed)")
        time.sleep(poll_interval)

    print("[!] Timeout waiting for email verification code.")
    return input("[?] Please enter the 6-digit code received on your email: ").strip()


def append_to_transcript_file(file_path, title, content):
    """Synchronously appends lecture transcript/text to file."""
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(f"\n\n{'='*60}\n")
        f.write(f"{title}\n")
        f.write(f"{'='*60}\n\n")
        f.write(content.strip() + "\n")
        f.flush()
    print(f"[+] Successfully wrote: {title} ({len(content)} chars)")


def run_automation():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[!] Playwright is not installed. Run: pip install playwright && playwright install chromium")
        sys.exit(1)

    if not UDEMY_EMAIL or not UDEMY_PASSWORD:
        print("[!] Please configure UDEMY_EMAIL and UDEMY_PASSWORD in your .env file.")
        sys.exit(1)

    output_path = Path(OUTPUT_FILE).resolve()
    print(f"[*] Output file: {output_path}")

    with sync_playwright() as p:
        # Launch Chromium (headful by default to handle anti-bot and challenges)
        browser = p.chromium.launch(headless=HEADLESS, channel="chrome" if os.name == "nt" else None)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        print("[*] Navigating to Udemy login page...")
        page.goto("https://www.udemy.com/join/login-popup/", wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        # Handle cookie banner if present
        try:
            accept_btn = page.locator("#onetrust-accept-btn-handler")
            if accept_btn.is_visible(timeout=3000):
                accept_btn.click()
        except Exception:
            pass

        # Enter email and password
        print("[*] Entering Udemy login credentials...")
        email_input = page.locator('input[name="email"], input[type="email"]')
        email_input.wait_for(state="visible", timeout=15000)
        email_input.fill(UDEMY_EMAIL)

        password_input = page.locator('input[name="password"], input[type="password"]')
        password_input.fill(UDEMY_PASSWORD)

        # Submit login form
        submit_btn = page.locator('button[type="submit"]')
        submit_btn.click()
        page.wait_for_timeout(4000)

        # Check for 6-digit verification code prompt
        code_input = page.locator('input[name="verification_code"], input[name="code"], input[data-purpose="verification-code-input"], input[id*="verification-code"]')
        multi_inputs = page.locator('input[aria-label*="digit" i], input[data-purpose*="code-digit"]')

        if code_input.is_visible(timeout=5000):
            print("[*] Verification code field detected!")
            code = fetch_udemy_code_from_email()
            if code:
                code_input.fill(code)
                verify_btn = page.locator('button[type="submit"], button:has-text("Verify"), button:has-text("Continue")')
                verify_btn.click()
                page.wait_for_timeout(5000)

        elif multi_inputs.count() == 6:
            print("[*] 6-digit split verification boxes detected!")
            code = fetch_udemy_code_from_email()
            if code and len(code) == 6:
                for idx, digit in enumerate(code):
                    multi_inputs.nth(idx).fill(digit)
                verify_btn = page.locator('button[type="submit"], button:has-text("Verify"), button:has-text("Continue")')
                verify_btn.click()
                page.wait_for_timeout(5000)

        # Wait for navigation / successful login
        print("[*] Checking login status...")
        page.wait_for_timeout(5000)

        # Navigate to course URL
        print(f"[*] Navigating to Course: {COURSE_URL}")
        page.goto(COURSE_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(4000)

        # Look for "Go to course" or "Start course" button if on landing page
        goto_btn = page.locator('a:has-text("Go to course"), button:has-text("Go to course"), a:has-text("Continue"), button:has-text("Continue")')
        if goto_btn.is_visible(timeout=5000):
            print("[*] Clicking 'Go to course' button...")
            goto_btn.first.click()
            page.wait_for_timeout(5000)

        print("[*] On course player page. Preparing lecture extraction...")

        # Ensure curriculum drawer is open
        curriculum_drawer_btn = page.locator('button[data-purpose="curriculum-dropdown-button"], button[aria-label="Course content"]')
        if curriculum_drawer_btn.is_visible(timeout=3000):
            curriculum_drawer_btn.click()
            page.wait_for_timeout(2000)

        # Expand all sections if collapsed
        expand_buttons = page.locator('button[data-purpose="section-panel-toggle"][aria-expanded="false"]')
        count = expand_buttons.count()
        for i in range(count):
            try:
                expand_buttons.nth(i).click()
                page.wait_for_timeout(500)
            except Exception:
                pass

        # Locate all curriculum lecture items
        lecture_items = page.locator('li[data-purpose*="item"], div[data-purpose*="curriculum-item"]')
        total_lectures = lecture_items.count()
        print(f"[+] Total curriculum items found: {total_lectures}")

        # If items weren't identified directly, find clickable lecture links
        if total_lectures == 0:
            lecture_links = page.locator('a[href*="/learn/lecture/"]')
            total_lectures = lecture_links.count()
            print(f"[+] Alternative lecture links found: {total_lectures}")

        for index in range(total_lectures):
            print(f"\n--- Processing lecture {index + 1} of {total_lectures} ---")
            try:
                item = lecture_items.nth(index) if lecture_items.count() > index else page.locator('a[href*="/learn/lecture/"]').nth(index)
                item_title = item.inner_text().split("\n")[0].strip() or f"Lecture-{index + 1}"
                print(f"[*] Opening: {item_title}")

                item.click()
                page.wait_for_timeout(4000)

                # Try opening Transcript tab if video lecture
                transcript_content = []
                transcript_toggle = page.locator('button:has-text("Transcript"), button[data-purpose="transcript-toggle"]')
                if transcript_toggle.is_visible(timeout=3000):
                    try:
                        transcript_toggle.click()
                        page.wait_for_timeout(2000)
                    except Exception:
                        pass

                # Check for transcript cues
                cues = page.locator('[data-purpose="cue-text"], [class*="transcript--cue-container"], p[data-purpose="transcript-cue"]')
                if cues.count() > 0:
                    for c_idx in range(cues.count()):
                        cue_txt = cues.nth(c_idx).inner_text().strip()
                        if cue_txt:
                            transcript_content.append(cue_txt)

                # If no transcript cues found, check for article / text / description content
                article_body = page.locator('div[data-purpose="article-body"], div[class*="article-content"], div[data-purpose="lecture-description"]')
                if article_body.is_visible(timeout=2000):
                    article_text = article_body.inner_text().strip()
                    if article_text:
                        transcript_content.append(article_text)

                if transcript_content:
                    final_text = "\n\n".join(transcript_content)
                    append_to_transcript_file(output_path, f"Vid-{index + 1}: {item_title}", final_text)
                else:
                    print(f"[-] No text/transcript found for lecture {index + 1}.")

            except Exception as ex:
                print(f"[-] Error processing lecture {index + 1}: {ex}")

        print("\n[✓] Transcript extraction completed!")
        browser.close()


if __name__ == "__main__":
    run_automation()


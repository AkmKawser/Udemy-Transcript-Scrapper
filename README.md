# Udemy Transcript Scrapper (Browser Extension)

A lightweight Manifest V3 browser extension built with [WXT](https://wxt.dev/) and TypeScript that extracts course transcripts, article lectures, and coding exercises directly from Udemy as clean Markdown (`.md`) files or bundled `.zip` archives.

---

## 📌 Features

- **Direct API & DOM Extraction**: Captures accurate transcripts and lecture text directly within your authenticated browser session without external bots or credentials.
- **Markdown Formatting**: Converts HTML articles, transcripts, and code blocks into clean, structured Markdown.
- **Bulk & Single Export**: Download transcripts lecture-by-lecture or export an entire section/course as a single `.zip` file.
- **Zero Configuration**: No `.env` or API tokens required—runs directly in your browser.
- **Cross-Browser Support**: Built for Chromium browsers (Chrome, Edge, Brave) and Firefox.

---

## 📁 Project Structure

```text
├── dist/                                 # Compiled extension builds & release zip files
│   ├── chrome-mv3/                       # Unpacked Chrome MV3 extension (load in chrome://extensions)
│   └── udemy-transcript-scrapper-1.0.0-chrome.zip # Packaged release zip
├── src/                                  # Extension source code
│   ├── assets/                           # Extension icons and graphics
│   ├── entrypoints/                      # Popup UI and content script
│   │   ├── content.ts                    # Content script for page DOM / API interactions
│   │   └── popup/                        # Extension popup interface (HTML, TS, CSS)
│   └── utils/                            # Core utilities
│       ├── file-generator.ts             # Markdown and zip bundle generator
│       ├── helpers.ts                    # DOM and text formatting helpers
│       ├── html-to-markdown.ts           # HTML to Markdown converter
│       ├── storage.ts                    # Extension state management
│       ├── types.ts                      # TypeScript type definitions
│       └── udemy-api.ts                  # Udemy internal API client
├── .gitattributes
├── .gitignore
├── package.json
├── tsconfig.json
└── wxt.config.ts                         # WXT framework configuration
```

---

## 🚀 Development & Building

### 1. Prerequisites

- **Node.js 18+** or **Bun** installed on your system.

---

### 2. Install Dependencies

```bash
npm install
```

---

### 3. Local Development

Start the live-reloading extension development server:

```bash
# Chrome / Chromium
npm run dev

# Firefox
npm run dev:firefox
```

---

### 4. Build for Production

Generate production-ready extension builds:

```bash
# Type check
npm run compile

# Build Chrome MV3 (dist/chrome-mv3)
npm run build

# Build Firefox MV3 (dist/firefox-mv3)
npm run build:firefox
```

---

### 5. Create Release Zip Archives

Package the extension into ready-to-publish `.zip` files for Web Store distribution or GitHub Releases:

```bash
# Chrome zip (dist/udemy-transcript-scrapper-1.0.0-chrome.zip)
npm run zip

# Firefox zip (dist/udemy-transcript-scrapper-1.0.0-firefox.zip)
npm run zip:firefox
```

---

## 📦 How to Install the Extension Manually

### In Google Chrome / Brave / Edge:
1. Run `npm run build` (or download the release zip and unpack it).
2. Open your browser and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `dist/chrome-mv3` folder.
5. Open any Udemy course video or lecture, click the extension icon, and export your transcripts!

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

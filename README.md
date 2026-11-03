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

## 📦 How to Install the Extension (Step-by-Step)

You can install this extension directly into any Chromium-based browser (**Google Chrome**, **Brave**, **Microsoft Edge**, **Opera**, or **Vivaldi**) in just a few minutes using **Developer Mode**.

---

### Method A: Install from a Release ZIP (Recommended for Users)

1. **Download the Release ZIP**:
   - Go to the [Releases](https://github.com/AkmKawser/Udemy-Transcript-Scrapper/releases) page.
   - Download the latest `udemy-transcript-scrapper-1.0.0-chrome.zip`.
2. **Extract the ZIP file**:
   - Right-click the downloaded `.zip` file and select **Extract All...** (or unpack it using 7-Zip / WinRAR).
   - Extract it to a permanent folder on your computer (e.g. `Documents/Extensions/udemy-transcript-scrapper`).
   > ⚠️ **Important**: Do not delete or move this folder after installing, as the browser loads the extension files directly from here.
3. **Open Browser Extensions Page**:
   - In your browser's address bar, type the following and press Enter:
     - **Google Chrome**: `chrome://extensions`
     - **Brave Browser**: `brave://extensions`
     - **Microsoft Edge**: `edge://extensions`
4. **Enable Developer Mode**:
   - Look in the **top-right corner** of the Extensions page.
   - Toggle the switch labeled **Developer mode** to **ON**.
5. **Load the Extension**:
   - Three new buttons will appear in the top-left corner: **Load unpacked**, **Pack extension**, and **Update**.
   - Click **Load unpacked**.
   - In the file selection dialog, browse to and select the extracted folder (make sure to select the folder containing `manifest.json`).
6. **Pin the Extension**:
   - Click the puzzle-piece icon (🧩) in the top-right toolbar of your browser.
   - Find **Udemy Transcript Scrapper** and click the **Pin** icon (📌) to keep it visible in your toolbar.

---

### Method B: Install by Building from Source Code (For Developers)

If you have cloned this repository locally, you can build and load the unpacked extension in seconds:

1. **Open your terminal** in the repository root directory:
   ```bash
   cd Udemy-Transcript-Scrapper
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Build the extension**:
   ```bash
   npm run build
   ```
   This generates the production-ready extension inside the `dist/chrome-mv3/` directory.
4. **Load into Browser**:
   - Navigate to `chrome://extensions/`.
   - Enable **Developer mode** (top-right toggle).
   - Click **Load unpacked**.
   - Select the `dist/chrome-mv3` folder inside this project.
5. **Pin and Use**:
   - Click the extension icon in your browser toolbar while viewing any Udemy course!

---

### 💡 How to Use the Extension on Udemy:

1. Log in to your account at [Udemy.com](https://www.udemy.com) and open any enrolled course.
2. Navigate to any lecture player (URL format: `https://www.udemy.com/course/.../learn/lecture/...`).
3. Click the **Udemy Transcript Scrapper** icon in your browser toolbar.
4. The popup will automatically detect the course title and lecture:
   - Click **Download Current Lecture** to save the active transcript or article reading as a Markdown (`.md`) file.
   - Click **Export Course Transcripts** to generate a complete `.zip` archive containing all sections and lectures formatted neatly.

---

### 🔄 How to Update the Extension:

When a new version is released:
1. Re-run `npm run build` (or replace the files in your unpacked folder with the new release files).
2. Go back to `chrome://extensions/`.
3. Locate **Udemy Transcript Scrapper** and click the circular **Reload** icon (🔄).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

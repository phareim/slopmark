# slopmark Chrome Extension

A Manifest V3 Chrome extension that identifies AI-written text on web pages.

## Installation

1. Go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` folder

## Configuration

1. Click the slopmark icon in your toolbar
2. Click "Settings"
3. Enter your backend API key
4. (Optional) Adjust the backend URL and blocklist
5. Click "Save"

## How it works

- The extension scans pages for blocks of text (paragraphs, lists, quotes, etc.) longer than 280 characters
- It sends these blocks to your slopmark backend for analysis
- Blocks flagged as obviously AI-written are marked with a subtle amber bar on the left
- Hover over marked blocks to see the confidence percentage
- The toolbar shows the total number of flagged blocks on each page

Browser test: `KEY=<SLOPMARK_KEY> node extension/test/browser-test.mjs` loads the extension in headless Chromium against `test/page.html`.

## Privacy

- Paragraph text from sites not on your blocklist is sent to the slopmark backend, which forwards it to TypeSafe's Jev API for scoring. The backend keeps only a SHA-256 hash of each paragraph and its score, never the text
- By default, Google Workspace, Microsoft 365, Slack, banking sites, and other collaboration tools are blocked
- Add or remove sites from the blocklist in Settings
- The blocklist is stored locally in your browser

## The mark

Flagged blocks show an amber bar on the left side. Hover to see a tooltip with the confidence percentage. The styling respects your system's motion preferences.

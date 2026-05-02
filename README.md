# Web To Prompt

> Hover over any section of any website, click it, and instantly get a pixel-accurate vibe coding prompt — ready to paste into v0, Bolt, Lovable, or Claude.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4F46E5?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-informational)
![No Build Tools](https://img.shields.io/badge/Build-None%20Required-success)
![Zero Backend](https://img.shields.io/badge/Backend-None-lightgrey)

---

## What It Does

Web To Prompt captures the full visual and structural data of any element on any webpage — colors, fonts, spacing, layout, shadows, borders — and converts it into a detailed, copy-ready prompt that an AI builder can use to reproduce it accurately.

No sign-up. No API key needed in v1. Works 100% client-side.

---

## How It Works

1. Visit any website
2. Click the **Web To Prompt** extension icon to enter capture mode
3. Hover over the page — elements highlight with a blue outline
4. Click the section you want to capture
5. The popup opens with a fully generated prompt
6. Choose your output format and hit **Copy Prompt**
7. Paste directly into v0, Bolt, Lovable, or Claude

Capture to clipboard in under 10 seconds.

---

## Output Formats

| Format | Target | Style |
|---|---|---|
| **HTML / CSS** | Pure HTML + CSS, BEM naming | Precise, no frameworks |
| **React + Tailwind** | Functional component with arbitrary values | `w-[254px]`, `text-[#4F46E5]` |
| **v0 / Bolt / Lovable** | Natural language optimised for AI builders | Descriptive, intent-driven |

---

## What Gets Captured

Every element in the selected section is recursively walked and documented:

- **Geometry** — exact `width × height`, `x/y` position
- **Colors** — background, text, border (hex values)
- **Typography** — font-family, size, weight, line-height, letter-spacing
- **Spacing** — padding (all 4 sides), margin, gap
- **Borders** — width, style, color, radius (per-corner)
- **Effects** — box-shadow, opacity, transform, backdrop-filter
- **Layout** — display, flexbox/grid properties, overflow
- **Assets** — image `src` + `alt`, full inline SVG markup
- **Interactions** — inferred hover states per element type

---

## Generated Prompt Sections

Each prompt includes:

1. Component overview and visual feel
2. HTML semantic structure tree
3. Design tokens table (colors, fonts, spacing, radii, shadows)
4. Element-by-element spec for every node
5. Typography setup with Google Fonts import URL where applicable
6. Hover state definitions
7. Responsive breakpoints (1024px / 768px / 480px)
8. Strict rules block — preserves every px value, color, and weight

---

## File Structure

```
web-to-prompt/
├── manifest.json           # MV3 config — permissions, service worker, icons
├── background.js           # Service worker — message routing between popup and content
├── content.js              # Injected on all pages — hover highlight, click capture
├── promptBuilder.js        # Converts captured DOM JSON → formatted prompt string
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.js            # Popup logic — tab switching, copy, activate
│   └── popup.css           # Minimal styles, no external frameworks
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── privacy-policy.html     # Required for Chrome Web Store listing
```

---

## Installation (Development)

1. Clone the repo
   ```bash
   git clone https://github.com/your-username/web-to-prompt-chrome-extension.git
   ```
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the project folder
5. The extension icon appears in your toolbar

No build step. No `npm install`. Plain JS files, load and go.

---

## Keyboard Shortcut

`Alt + Shift + W` — activates capture mode on the current tab without opening the popup.

`Escape` — cancels capture mode.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Manifest | V3 | Required for all new Chrome extensions |
| Build system | None | Faster to ship, zero tooling overhead |
| JS | Vanilla ES2020 | No bundler needed, no dependencies |
| Storage | `chrome.storage.local` | Fully private, no server |
| Popup CSS | Hand-written | Keeps the extension lightweight |
| AI API (v1) | None | Works for everyone out of the box |

---

## Roadmap

### v1.0 — Shipping Now
- [x] DOM capture engine with full style extraction
- [x] Three output formats (HTML, React, vibe)
- [x] Copy-to-clipboard with confirmation feedback
- [x] Keyboard shortcut activation
- [x] Zero external dependencies

### v1.1 — Optional Claude API Mode
- [ ] Settings panel with API key input (stored locally, never transmitted except to Anthropic)
- [ ] Send captured JSON to Claude Sonnet for an AI-enhanced prompt
- [ ] Token count estimate before sending
- [ ] Graceful fallback to v1.0 logic on API failure

---

## Edge Cases Handled

| Situation | Behaviour |
|---|---|
| Private / custom font | Flagged in prompt, DM Sans suggested as fallback |
| Transparent background | Resolved from nearest opaque parent, noted in output |
| Oversized SVG (> 50KB) | Truncated to 5000 chars with a note |
| Cross-origin iframe | Skipped with a note in the prompt |
| Canvas element | Dimensions captured only, reproduction noted as CSS-impossible |
| Empty / no-content element | User prompted to click a parent element |
| Click on `<body>` or `<html>` | Rejected with a clear message |

---

## Privacy

Web To Prompt captures DOM data from the page you are viewing and stores it **locally in your browser only** (`chrome.storage.local`). No data is sent to any external server in v1.0. No analytics, no telemetry, no accounts.

---

## License

MIT

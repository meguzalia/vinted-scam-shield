# 🛡️ Vinted Scam Shield v3.0

**A friendly tap on the shoulder before you get scammed.**

---

## What changed in v3.0

The extension was rebuilt around one insight: **casual shoppers don't want dashboards or risk scores — they want a simple, clear warning before they waste money.**

### Removed
- Stats dashboard (items checked, money saved) — added friction, no real value
- Complex risk score bar — overwhelming for casual users

### Added
- Clean, friendly warning banner — appears only when something's actually wrong
- **AI-powered analysis** via Claude API — catches subtle scams that keyword rules miss
- Smarter language: "This listing has a few unusual patterns" not "SCAM DETECTED"

---

## How it works

When you open a Vinted item page:

1. **Instant rule-based checks** run immediately (no API call needed):
   - Fake "vintage" / Y2K fast fashion
   - Shein/Temu reseller signals
   - Counterfeit luxury items (Rolex, Birkin, etc.)
   - Zero-review sellers with expensive items

2. **AI analysis** runs in parallel (requires API key):
   - Sends title, brand, price, description snippet to Claude
   - Detects subtle patterns: copy-paste text, vague descriptions, translated phrasing, suspicious pricing for the brand
   - Returns a plain-language warning if anything's off

3. If a flag is found → a small, friendly banner appears in the top-right corner with:
   - What the problem is (one sentence)
   - What to do about it (one concrete tip)
   - A "Check Images" button that opens Google Lens

If nothing's wrong → no banner, no noise. The extension stays invisible.

---

## Setup

### Basic (no AI, rule-based only)
1. Download all files to a folder
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → select the folder
5. Done

### With AI analysis
1. Get an Anthropic API key at [console.anthropic.com](https://console.anthropic.com)
2. Open `content.js`
3. Replace `'YOUR_API_KEY_HERE'` with your key
4. Load the extension as above

---

## Privacy

- No data ever leaves your device (except the listing text sent to Anthropic's API if you set a key — only when you view an item with suspicious signals)
- No tracking, no analytics, no servers
- Open source — read the code

---

## Known limitations

- Only works on individual item pages (not search results)
- AI analysis requires an Anthropic API key
- Some scams won't be caught — always use your judgment
- Google Lens requires a manual click

---

## Roadmap

- Detect suspicious patterns in seller profile bios
- Multi-language support improvements (FR, DE, PL)
- Firefox support

---

**Stay safe shopping! 🛡️**

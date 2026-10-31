# livingSpaces design rounds

The Lavish review board and mockups the app was designed from. Open `board.html` in a browser; everything it links to is in this folder.

| File | What it is |
|---|---|
| `board.html` | The review board: round 5 at the top, then rounds 4 → 1 with the captain's notes, screenshots and comparisons |
| `roomie-v5.html` | **Round 5, the approved design** this app is built from: 10 categories, zoned layout, one model per type with arrows, Chad, Bills, per-item move-out with a buyout value, any phone photo → PNG |
| `roomie-v4.html` | Round 4: rename to livingSpaces, live Claude Haiku classification and Sonnet chat |
| `roomie-v3.html` | Round 3: HEIC/Android photos → PNG, duplicates behind arrows, speakers |
| `roomie-v2.html` | Round 2: option A plus borrowed ideas, Chad, no phase gates |
| `option-a-diorama.html`, `option-b-studio.html`, `option-c-cinematic.html` | Round 1: three alternative directions (A was chosen) |
| `ref.jpeg` | The captain's art-direction reference |
| `shots/` | Screenshots used by the board |

The mockups are single self-contained HTML files (three.js from a CDN). Rounds 1–3 use simulated AI. Rounds 4–5 called a design-time backend whose API the real server in `server/` has since replaced, so their live AI calls now show a "backend offline" or error state. The app itself is the working version of round 5.

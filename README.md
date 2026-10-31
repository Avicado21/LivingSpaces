# livingSpaces

A one-screen, 3D room for roommates to keep track of the things they buy together and the bills they share.

- **Add** furniture by photographing it. Any phone photo (HEIC, JPEG, WebP, AVIF, …) is converted to PNG in the browser. **Claude Haiku** on Amazon Bedrock picks one of ten categories, and a generic model of it appears in the room. You can correct the type, then enter the name, price, purchase date and who chipped in.
- **Live** with **Chad** (left tab), a roommate helper running on **Claude Sonnet**, who knows the household's furniture, bills and balances. **Bills** (right tab) splits bills, shows who owes whom, and records payments.
- **Move out** any item at any time: pick who keeps it, agree a value (a suggested 20%-a-year wear value, the price paid, half, or a slider), and see who owes whom. When the last item leaves the room, the flow ends with a final tally.

The ten categories are couch, chair (an armchair is a chair), coffee table, TV, speakers, area rug, floor lamp, bookshelf, game console and mini fridge. Duplicates share one model, with ‹ › arrows in its card.

## Requirements

- Node.js 22.13 or newer (uses the built-in `node:sqlite`)
- The AWS CLI with SSO access to the **`cic-sandbox`** profile, which has Bedrock access in **us-east-1** to `us.anthropic.claude-haiku-5-5` and `us.anthropic.claude-sonnet-5-5`

## Run it

```sh
npm install
aws sso login --profile cic-sandbox   # refresh the AWS session (repeat when it expires)
npm run build                          # build the front end into dist/
npm start                              # http://127.0.0.1:8787
```

The first visit asks you to set up the household and its roommates; after that, you pick who you are. `npm run seed` instead creates a demo household (Apt 4B: Alex, Maya and Jordan, with a month of bills); furniture is added in the app with real photos.

For development, `npm run dev` runs the API (restarting on changes) plus Vite with hot reload at http://127.0.0.1:5173, proxying `/api` to the server.

Data lives in `data/livingspaces.db` (SQLite: household, roommates, items with their PNG photo, splits, bills, buyouts and Chad's conversations). Delete the file to start over.

| Environment variable | Default |
|---|---|
| `PORT`, `HOST` | `8787`, `127.0.0.1` |
| `LIVINGSPACES_DB` | `data/livingspaces.db` |
| `AWS_REGION` | `us-east-1` |
| `LIVINGSPACES_AWS_PROFILE` | `cic-sandbox` |
| `HAIKU_MODEL`, `SONNET_MODEL` | `us.anthropic.claude-haiku-5-5`, `us.anthropic.claude-sonnet-5-5` |

If the AWS session has expired, the top-right pill turns red, and the app says "The AWS session for profile "cic-sandbox" is expired or not authorized. Refresh it with: aws sso login --profile cic-sandbox". Run that, then press Retry.

## Tests

```sh
npm test                 # ledger math, photo-format detection, and the API with Bedrock mocked
npm run smoke:bedrock    # live check: credentials, one Haiku classification, one Sonnet reply
npm run smoke:bedrock -- path/to/photo.png
```

The smoke check makes real Bedrock calls (a few cents), so run it manually.

## How it fits together

```
web/        Vite + three.js front end
  src/scene/  the isometric room, generic models, zoned layout (kit.js, stage.js)
  src/ui/     Add card, item card + move-out, Chad, Bills, sign-in
  src/lib/    API client, photo → PNG pipeline (heic2any for HEIC), DOM helpers
shared/     categories and the ledger math (integer cents), used by both sides
server/     Node HTTP server: API + built front end on one origin
  app.mjs     routes and validation (createApp takes the db and AI client, for tests)
  db.mjs      SQLite schema and queries
  ai.mjs      Claude on Bedrock: Haiku classification, Sonnet chat, error messages
scripts/    dev runner, seed, live Bedrock smoke check
test/       node:test suites
docs/design the review board and mockups from the design rounds
```

- **Classification:** the browser sends the PNG to `POST /api/classify`. The server sends Haiku an image block, plus a system prompt that defines each allowed category, and a JSON-schema output whose `category` is an enum of those categories.
- **Chad:** `POST /api/chat` streams Sonnet over server-sent events. The server builds the household ledger from the database for every question (items with who paid what, moved-out items, bills, buyouts, who owes whom) and keeps each roommate's conversation.
- **Credentials:** they stay in the server process. The browser only talks to its own origin, and cross-origin writes are refused.
- **Bedrock path:** the server uses Bedrock's InvokeModel API with US cross-region inference profiles. This account returns 404 for these models on the newer bedrock-mantle endpoint.
- **Sign-in:** it's local and has no passwords. This is a prototype for one household on one machine.

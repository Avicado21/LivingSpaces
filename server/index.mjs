/* livingSpaces server: API + built front end on one origin.

   npm start            serve dist/ and the API on http://127.0.0.1:8787
   Env: PORT, HOST, LIVINGSPACES_DB (default data/livingspaces.db),
        AWS_REGION (us-east-1), LIVINGSPACES_AWS_PROFILE (falls back to AWS_PROFILE / default),
        HAIKU_MODEL, SONNET_MODEL */
import http from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';
import { createBedrockAI } from './ai.mjs';
import { createApp } from './app.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const dbFile = process.env.LIVINGSPACES_DB || path.join(root, 'data', 'livingspaces.db');
const dist = path.join(root, 'dist');

const db = openDb(dbFile);
const ai = createBedrockAI({
  region: process.env.AWS_REGION,
  profile: process.env.LIVINGSPACES_AWS_PROFILE,
  haikuModel: process.env.HAIKU_MODEL,
  sonnetModel: process.env.SONNET_MODEL,
});
const handler = createApp({ db, ai, staticDir: existsSync(dist) ? dist : null, log: (...a) => console.error(new Date().toISOString(), ...a) });

http.createServer(handler).listen(PORT, HOST, () => {
  console.log(`livingSpaces on http://${HOST}:${PORT}  ·  db ${path.relative(root, dbFile)}  ·  Bedrock ${ai.info.region} (profile ${ai.info.profile})`);
  if (!existsSync(dist)) console.log('No dist/ build yet: run "npm run dev" for the Vite front end, or "npm run build" first.');
});

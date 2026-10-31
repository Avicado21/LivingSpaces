import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/* The front end lives in web/, shares shared/ with the server, and talks to
   the API through a same-origin proxy in dev. `npm run build` writes dist/,
   which the server then serves itself. */
export default defineConfig({
  root: 'web',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1600 },
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: { allow: [here] },
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.PORT || 8787}` } },
  },
});

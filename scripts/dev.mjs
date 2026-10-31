/* `npm run dev`: the API server (restarts on change) plus the Vite dev server. */
import { spawn } from 'node:child_process';

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', env: process.env });
const procs = [
  run(process.execPath, ['--watch-path=server', '--watch-path=shared', 'server/index.mjs']),
  run(process.execPath, ['node_modules/vite/bin/vite.js']),
];
const stop = () => { for (const p of procs) p.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', code => { if (code) { console.error(`dev process exited with ${code}`); stop(); } });

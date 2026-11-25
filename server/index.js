/**
 * @fileoverview Local HTTP entrypoint binding PORT (default 3000) when run directly.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';

/**
 * Start the local Express HTTP server.
 * @returns {import('node:http').Server}
 */
export function startServer() {
  const parsedPort = Number.parseInt(process.env.PORT ?? '3000', 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 3000;
  const app = createApp();
  const server = app.listen(port, () => {
    console.info(`VayuMitra listening on http://localhost:${port}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  startServer();
}

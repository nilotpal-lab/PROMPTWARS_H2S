/**
 * @fileoverview Vercel serverless function entrypoint exporting the Express app
 * without binding a listening TCP port.
 */

import { createApp } from '../server/app.js';

const app = createApp();

export default app;

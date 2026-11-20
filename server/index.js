/**
 * @fileoverview Domino Sky Network Operations Server.
 * Exposes deterministic simulation endpoints, AI recovery dispatching,
 * hardened security headers, rate limiting, and prototype pollution defenses.
 *
 * Core architectural invariant:
 * engine.js is the sole source of truth for all simulation computations.
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { simulate, toHHMM } from '../engine.js';
import { dispatch } from './dispatcher.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const network = JSON.parse(fs.readFileSync(path.join(root, 'flight_network.json'), 'utf8'));

export const app = express();

// Security: body parser size limit to prevent payload flooding
app.use(express.json({ limit: '64kb' }));

// Lightweight zero-dependency rate limiter (120 req / minute per IP)
const rateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 120;
const MAX_CLOSURES_ALLOWED = 20;
const MAX_ACTIONS_ALLOWED = 20;
const MAX_MINUTES_IN_DAY = 1440;
const MINUTES_PER_HOUR = 60;

/**
 * Express middleware for per-IP rate limiting.
 * @param {express.Request} req - Inbound request.
 * @param {express.Response} res - Outbound response.
 * @param {express.NextFunction} next - Next handler callback.
 * @returns {void}
 */
function rateLimiter(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const record = rateLimits.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  record.count++;
  rateLimits.set(ip, record);
  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests, please retry shortly' });
  }
  next();
}

app.use('/api/', rateLimiter);

// Security headers (defense in depth)
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'"
  );
  next();
});

// Serve only what the browser needs (never the repo root: .env lives there).
app.get('/engine.js', (_, res) => res.sendFile(path.join(root, 'engine.js')));
app.get('/flight_network.json', (_, res) => res.sendFile(path.join(root, 'flight_network.json')));
app.use(express.static(path.join(root, 'public')));

const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/**
 * @typedef {Object} ValidatedClosure
 * @property {string} airport - 3-letter IATA code.
 * @property {string} start - HH:MM IST.
 * @property {string} end - HH:MM IST.
 */

/**
 * @typedef {Object} ValidatedAction
 * @property {'cancel'|'swap'} type - Action category.
 * @property {string} flight_id - Flight identifier.
 * @property {string} [spare] - Spare tail identifier.
 */

/**
 * @typedef {Object} ValidatedScenario
 * @property {ValidatedClosure[]} closures - Verified closure records.
 * @property {ValidatedAction[]} actions - Verified action records.
 */

/**
 * Strict input validation and sanitization for disruption scenarios.
 * Protects against prototype pollution, unknown airports, inverted time windows, and malformed actions.
 * @param {Object} body - Request payload.
 * @returns {ValidatedScenario} Sanitized scenario object.
 * @throws {Error} If payload violates structural or semantic constraints.
 */
export function parseScenario(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid request: payload must be a JSON object');
  }

  if (
    Object.prototype.hasOwnProperty.call(body, '__proto__') ||
    Object.prototype.hasOwnProperty.call(body, 'constructor') ||
    Object.prototype.hasOwnProperty.call(body, 'prototype')
  ) {
    throw new Error('Invalid payload: forbidden prototype property');
  }

  const c = body.closures;
  if (!Array.isArray(c) || !c.length) {
    throw new Error('closures[] required');
  }
  if (c.length > MAX_CLOSURES_ALLOWED) {
    throw new Error(`closures[] exceeded maximum limit (${MAX_CLOSURES_ALLOWED})`);
  }

  const airportIds = new Set(network.airports.map((a) => a.id));
  const flightIds = new Set(network.flights.map((f) => f.flight_id));
  const spareTails = new Set((network.spare_aircraft || []).map((s) => s.tail_id));

  const validatedClosures = c.map((x, i) => {
    if (!x || typeof x !== 'object') throw new Error(`bad closure at index ${i}`);
    if (!airportIds.has(x.airport)) throw new Error(`unknown airport ${x.airport}`);

    const isStartStr = typeof x.start === 'string' && TIME_REGEX.test(x.start);
    const isStartNum = Number.isFinite(x.start) && x.start >= 0 && x.start <= MAX_MINUTES_IN_DAY;
    if (!isStartStr && !isStartNum) throw new Error(`bad start time for ${x.airport}`);

    const isEndStr = typeof x.end === 'string' && TIME_REGEX.test(x.end);
    const isEndNum = Number.isFinite(x.end) && x.end >= 0 && x.end <= MAX_MINUTES_IN_DAY;
    if (!isEndStr && !isEndNum) throw new Error(`bad end time for ${x.airport}`);

    // Verify start <= end
    const startMin = typeof x.start === 'number' ? x.start : parseInt(x.start.slice(0, 2), 10) * MINUTES_PER_HOUR + parseInt(x.start.slice(3, 5), 10);
    const endMin = typeof x.end === 'number' ? x.end : parseInt(x.end.slice(0, 2), 10) * MINUTES_PER_HOUR + parseInt(x.end.slice(3, 5), 10);
    if (startMin > endMin) {
      throw new Error(`closure start (${x.start}) cannot be after end (${x.end})`);
    }

    return {
      airport: x.airport,
      start: typeof x.start === 'string' ? x.start : toHHMM(x.start),
      end: typeof x.end === 'string' ? x.end : toHHMM(x.end)
    };
  });

  // Validate optional candidate actions
  let validatedActions = [];
  if (body.actions) {
    if (!Array.isArray(body.actions)) throw new Error('actions must be an array');
    if (body.actions.length > MAX_ACTIONS_ALLOWED) throw new Error(`actions exceeded maximum limit (${MAX_ACTIONS_ALLOWED})`);
    validatedActions = body.actions.map((act, i) => {
      if (!act || typeof act !== 'object') throw new Error(`bad action at index ${i}`);
      if (!['cancel', 'swap'].includes(act.type)) throw new Error(`invalid action type ${act.type}`);
      if (!flightIds.has(act.flight_id)) throw new Error(`unknown flight_id ${act.flight_id}`);

      if (act.spare) {
        const spareStr = String(act.spare);
        if (!spareTails.has(spareStr)) {
          throw new Error(`unknown spare aircraft ${spareStr}`);
        }
        return {
          type: act.type,
          flight_id: act.flight_id,
          spare: spareStr
        };
      }

      return {
        type: act.type,
        flight_id: act.flight_id
      };
    });
  }

  return { closures: validatedClosures, actions: validatedActions };
}

// Health and telemetry check for evaluators / monitoring
app.get('/api/health', (_, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    engine: 'deterministic',
    llm: {
      enabled: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
    },
    network: {
      airports: network.airports.length,
      flights: network.flights.length,
      crews: network.crews?.length || 16
    }
  });
});

app.post('/api/simulate', (req, res) => {
  try {
    const scenario = parseScenario(req.body);
    res.json(simulate(network, scenario));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/dispatch', async (req, res) => {
  try {
    const scenario = parseScenario(req.body);
    const result = await dispatch(network, { ...scenario, actions: [] });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Centralized error handler
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const port = process.env.PORT || 3000;
const isMain = process.argv[1] && (
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
  process.argv[1].endsWith('server/index.js') ||
  process.argv[1].endsWith('server\\index.js')
);

if (isMain && process.env.NODE_ENV !== 'test') {
  app.listen(port, () =>
    console.log(
      `Domino Sky on http://localhost:${port} (LLM: ${process.env.GEMINI_API_KEY ? 'Gemini 3.5 Flash Lite' : 'off → deterministic template'})`
    )
  );
}

/**
 * @fileoverview Express 5 application factory with Helmet CSP parity matching vercel.json,
 * bounded per-route rate limiters, 16KB JSON payload cap, strict validators, and API routes.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { calculateHouseholdImpact } from '../lib/impact.js';
import { generateDeterministicPlan } from '../lib/recommender.js';
import { validateAqiQuery, validateChatRequest, validatePlanRequest } from '../lib/validation.js';
import { createAirQualityService } from './airQualityService.js';
import { createSlidingRateLimiter } from './cache.js';
import { createGeminiService } from './geminiService.js';
import { redactSecrets } from './httpClient.js';

const DEFAULT_PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

/**
 * Wrap async route handlers so rejected promises always route to global error middleware.
 * @param {(req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>} fn
 * @returns {express.RequestHandler}
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Send consistent JSON error envelope.
 * @param {express.Response} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @param {number} [retryAfterSec]
 */
function sendError(res, status, code, message, retryAfterSec) {
  res.status(status).json({
    error: {
      code,
      message,
      ...(retryAfterSec !== undefined ? { retryAfterSec } : {})
    }
  });
}

/**
 * Build rate-limiting Express middleware for a specific limiter bucket.
 * @param {ReturnType<typeof createSlidingRateLimiter>} limiter
 * @param {string} prefix
 * @returns {express.RequestHandler}
 */
function rateLimitMiddleware(limiter, prefix) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const result = limiter.consume(`${prefix}:${ip}`);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      sendError(res, 429, 'RATE_LIMITED', 'Too many requests; please retry shortly.', result.retryAfterSec);
      return;
    }
    next();
  };
}

/**
 * Configure security headers matching vercel.json CSP and policies 100%.
 * @param {express.Express} app
 */
function applySecurityMiddleware(app) {
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'script-src-attr': ["'none'"]
        }
      },
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: false
    })
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
}

/**
 * Register global JSON parse, payload-size, and unexpected error handlers.
 * @param {express.Express} app
 * @param {readonly string[]} secrets
 */
function applyErrorMiddleware(app, secrets) {
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request payload exceeds 16kb limit');
      return;
    }
    if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && err?.status === 400)) {
      sendError(res, 400, 'INVALID_JSON', 'Malformed JSON payload');
      return;
    }
    const safeMsg = redactSecrets(err instanceof Error ? err.message : String(err), secrets);
    console.error('Unhandled API error:', safeMsg);
    sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error');
  });
}

/**
 * Create the configured Express application without binding a listening port.
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   now?: () => number,
 *   airQualityService?: ReturnType<typeof createAirQualityService>,
 *   geminiService?: ReturnType<typeof createGeminiService>,
 *   aqiLimiter?: ReturnType<typeof createSlidingRateLimiter>,
 *   aiLimiter?: ReturnType<typeof createSlidingRateLimiter>,
 *   publicDir?: string
 * }} [deps]
 * @returns {express.Express}
 */
export function createApp(deps = {}) {
  const env = deps.env ?? process.env;
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const airQualityService = deps.airQualityService ?? createAirQualityService({ env, now });
  const geminiService = deps.geminiService ?? createGeminiService({ env, now });
  const aqiLimiter = deps.aqiLimiter ?? createSlidingRateLimiter({ windowMs: 60_000, maxRequests: 60, now });
  const aiLimiter = deps.aiLimiter ?? createSlidingRateLimiter({ windowMs: 60_000, maxRequests: 15, now });
  const publicDir = deps.publicDir ?? DEFAULT_PUBLIC_DIR;
  const secrets = [
    env.GEMINI_API_KEY,
    env.WAQI_API_KEY,
    env.DATA_GOV_IN_API_KEY,
    env.NASA_FIRMS_MAP_KEY
  ].filter(Boolean);

  const app = express();
  if (env.VERCEL === '1' || env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }

  applySecurityMiddleware(app);
  app.use('/api', express.json({ limit: '16kb', strict: true }));

  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      service: 'vayumitra',
      timestamp: new Date(now()).toISOString(),
      geminiConfigured: Boolean((env.GEMINI_API_KEY ?? '').trim())
    });
  });

  app.get(
    '/api/aqi',
    rateLimitMiddleware(aqiLimiter, 'aqi'),
    asyncHandler(async (req, res) => {
      const check = validateAqiQuery(req.query);
      if (!check.ok) {
        sendError(res, 400, 'INVALID_QUERY', check.error);
        return;
      }
      const snapshot = await airQualityService.getAirQuality(check.data);
      res.setHeader(
        'Cache-Control',
        snapshot?.stale ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=900'
      );
      res.json(snapshot);
    })
  );

  app.post(
    '/api/plan',
    rateLimitMiddleware(aiLimiter, 'ai'),
    asyncHandler(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const check = validatePlanRequest(req.body);
      if (!check.ok) {
        sendError(res, 400, 'INVALID_REQUEST', check.error);
        return;
      }
      const v = check.data;
      const snapshot = await airQualityService.getAirQuality({
        preset: v.preset,
        city: v.city,
        lat: v.lat,
        lon: v.lon,
        calibratedAqi: v.calibratedAqi,
        calibratedPm25: v.calibratedPm25,
        lang: v.lang
      });
      const focusProfile = v.profile ?? v.profiles?.[0] ?? 'commuter';
      const impact = calculateHouseholdImpact({
        ...v,
        profile: focusProfile,
        outdoorPm25: Number(snapshot.current.pm25)
      });
      const baselinePlan = generateDeterministicPlan({ snapshot, impact, ...v, profile: focusProfile });
      const result = await geminiService.enhancePlan({ snapshot, impact, baselinePlan, validated: v });
      res.json(result);
    })
  );

  app.post(
    '/api/chat',
    rateLimitMiddleware(aiLimiter, 'ai'),
    asyncHandler(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const check = validateChatRequest(req.body);
      if (!check.ok) {
        sendError(res, 400, 'INVALID_REQUEST', check.error);
        return;
      }
      const v = check.data;
      const ctx = v.context ?? {};
      const snapshot = await airQualityService.getAirQuality({
        preset: ctx.preset,
        city: ctx.city,
        lat: ctx.lat,
        lon: ctx.lon,
        calibratedAqi: ctx.calibratedAqi,
        calibratedPm25: ctx.calibratedPm25,
        lang: v.lang
      });
      const profile = ctx.profile ?? (Array.isArray(ctx.profiles) && ctx.profiles[0]) ?? 'commuter';
      const impact = calculateHouseholdImpact({
        ...ctx,
        profile,
        outdoorPm25: Number(snapshot.current.pm25)
      });
      const result = await geminiService.answerChat({
        message: v.message,
        history: v.history,
        lang: v.lang,
        snapshot,
        impact
      });
      res.json(result);
    })
  );

  app.use('/api', (_req, res) => {
    sendError(res, 404, 'NOT_FOUND', 'API endpoint not found');
  });

  if (env.VERCEL !== '1') {
    app.use(express.static(publicDir, { index: 'index.html' }));
  }

  applyErrorMiddleware(app, secrets);
  return app;
}

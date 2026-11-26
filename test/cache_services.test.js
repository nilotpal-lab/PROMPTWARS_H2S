import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTtlCache, createSlidingRateLimiter, createDistributedRateLimiter } from '../server/cache.js';
import { ALLOWED_HOSTS, redactSecrets, safeFetch } from '../server/httpClient.js';
import { createAirQualityService } from '../server/airQualityService.js';
import { clauseViolatesSafety, createGeminiService } from '../server/geminiService.js';
import { buildAirQualitySnapshot } from '../lib/aqi.js';
import { calculateHouseholdImpact } from '../lib/impact.js';
import { generateDeterministicPlan } from '../lib/recommender.js';

function makeOpenMeteoAqPayload() {
  const times = Array.from({ length: 48 }, (_, i) => {
    const day = i < 24 ? '25' : '26';
    const hour = String(i % 24).padStart(2, '0');
    return `2026-11-${day}T${hour}:00`;
  });
  return {
    hourly: {
      time: times,
      pm2_5: times.map((_, i) => (i % 24 >= 12 && i % 24 <= 15 ? 70 : 180)),
      pm10: times.map(() => 240),
      carbon_monoxide: times.map(() => 800),
      nitrogen_dioxide: times.map(() => 55),
      sulphur_dioxide: times.map(() => 18),
      ozone: times.map(() => 35)
    }
  };
}

function makeOpenMeteoWxPayload() {
  const times = Array.from({ length: 48 }, (_, i) => {
    const day = i < 24 ? '25' : '26';
    const hour = String(i % 24).padStart(2, '0');
    return `2026-11-${day}T${hour}:00`;
  });
  return {
    hourly: {
      time: times,
      boundary_layer_height: times.map((_, i) => (i % 24 >= 12 && i % 24 <= 15 ? 1100 : 250)),
      wind_speed_10m: times.map((_, i) => (i % 24 >= 12 && i % 24 <= 15 ? 10.8 : 3.6)),
      relative_humidity_2m: times.map(() => 76)
    }
  };
}

describe('server/cache.js — Bounded LRU/TTL Cache & Sliding Rate Limiter', () => {
  it('enforces LRU eviction with recency refresh on get, TTL expiry, and clear()', () => {
    let clock = 1000;
    const cache = createTtlCache({ maxEntries: 2, now: () => clock });

    cache.set('a', 'alpha', 500);
    cache.set('b', 'beta', 500);
    assert.equal(cache.size, 2);

    // Refresh 'a' so 'b' becomes LRU
    assert.equal(cache.get('a'), 'alpha');
    cache.set('c', 'gamma', 500);
    assert.equal(cache.size, 2);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 'alpha');
    assert.equal(cache.get('c'), 'gamma');

    clock += 500;
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.has('c'), false);
    assert.equal(cache.size, 0);

    cache.set('x', 1, 1000);
    cache.clear();
    assert.equal(cache.size, 0);
  });

  it('enforces sliding window limits, retryAfterSec, window expiry, and bounded IP eviction', () => {
    let clock = 10_000;
    const limiter = createSlidingRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      maxEntries: 2,
      now: () => clock
    });

    const r1 = limiter.consume('1.1.1.1');
    const r2 = limiter.consume('1.1.1.1');
    const r3 = limiter.consume('1.1.1.1');
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 1);
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 0);
    assert.equal(r3.allowed, false);
    assert.equal(r3.retryAfterSec, 60);

    // Bounded IP eviction keeps size <= 2
    limiter.consume('2.2.2.2');
    limiter.consume('3.3.3.3');
    assert.equal(limiter.size, 2);

    clock += 60_001;
    const afterWindow = limiter.consume('1.1.1.1');
    assert.equal(afterWindow.allowed, true);
  });

  it('supports mocked Upstash REST pipeline (INCR + PEXPIRE) and falls back cleanly when unconfigured or unreachable', async () => {
    const clock = 120_000;
    let redisCount = 0;
    const seenRequests = [];

    const upstashLimiter = createDistributedRateLimiter({
      redisUrl: 'https://mock-upstash.example/',
      redisToken: 'upstash-token-secret',
      windowMs: 60_000,
      maxRequests: 2,
      now: () => clock,
      fetchImpl: async (url, opts) => {
        redisCount += 1;
        seenRequests.push({ url, opts, body: JSON.parse(opts.body) });
        return new Response(JSON.stringify([{ result: redisCount }, { result: 1 }]), { status: 200 });
      }
    });

    const u1 = await upstashLimiter.consume('aqi:1.2.3.4');
    const u2 = await upstashLimiter.consume('aqi:1.2.3.4');
    const u3 = await upstashLimiter.consume('aqi:1.2.3.4');
    assert.equal(u1.allowed, true);
    assert.equal(u1.remaining, 1);
    assert.equal(u2.allowed, true);
    assert.equal(u2.remaining, 0);
    assert.equal(u3.allowed, false);
    assert.equal(u3.retryAfterSec, 60);
    assert.equal(seenRequests[0].url, 'https://mock-upstash.example/pipeline');
    assert.equal(seenRequests[0].opts.headers.Authorization, 'Bearer upstash-token-secret');
    assert.equal(seenRequests[0].body[0][0], 'INCR');
    assert.equal(seenRequests[0].body[1][0], 'PEXPIRE');
    assert.equal(seenRequests[0].body[1][2], 60_000);

    // Unconfigured falls back to sliding limiter
    const unconfigured = createDistributedRateLimiter({ windowMs: 60_000, maxRequests: 1, now: () => clock });
    assert.equal((await unconfigured.consume('ip1')).allowed, true);
    assert.equal((await unconfigured.consume('ip1')).allowed, false);

    // Unreachable Upstash falls back gracefully to sliding limiter
    const unreachable = createDistributedRateLimiter({
      redisUrl: 'https://mock-upstash.example',
      redisToken: 'tok',
      windowMs: 60_000,
      maxRequests: 1,
      now: () => clock,
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      }
    });
    assert.equal((await unreachable.consume('ip2')).allowed, true);
    assert.equal((await unreachable.consume('ip2')).allowed, false);
  });
});

describe('server/httpClient.js — SSRF Guards, Byte Cap & Secret Redaction', () => {
  it('allows only allowlisted HTTPS hosts and blocks HTTP, metadata SSRF, credentials, and redirects', async () => {
    assert.ok(ALLOWED_HOSTS.has('air-quality-api.open-meteo.com'));
    assert.ok(ALLOWED_HOSTS.has('generativelanguage.googleapis.com'));
    assert.equal(ALLOWED_HOSTS.size, 7);

    await assert.rejects(() => safeFetch('http://api.open-meteo.com/v1/forecast'), /non-HTTPS/i);
    await assert.rejects(() => safeFetch('https://169.254.169.254/latest/meta-data/'), /non-allowlisted/i);
    await assert.rejects(() => safeFetch('https://user:pass@api.open-meteo.com/v1/forecast'), /credentials/i);

    await assert.rejects(
      () =>
        safeFetch('https://api.open-meteo.com/v1/forecast', {
          fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.test' } })
        }),
      /redirect/i
    );

    const passedOpts = [];
    const okRes = await safeFetch('https://api.open-meteo.com/v1/forecast', {
      fetchImpl: async (_url, opts) => {
        passedOpts.push(opts);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
    });
    assert.equal(passedOpts[0].redirect, 'error');
    assert.deepEqual(await okRes.json(), { ok: true });
  });

  it('enforces streaming byte cap and AbortController timeouts while redacting secrets', async () => {
    const bigStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
        controller.close();
      }
    });

    await assert.rejects(
      () =>
        safeFetch('https://api.open-meteo.com/v1/forecast', {
          maxBytes: 1000,
          fetchImpl: async () => new Response(bigStream, { status: 200 })
        }),
      /exceeded 1000 byte limit/i
    );

    await assert.rejects(
      () =>
        safeFetch('https://api.waqi.info/feed/geo:28;77/?token=supersecret999', {
          timeoutMs: 20,
          secrets: ['my-firms-secret'],
          fetchImpl: (_url, opts) =>
            new Promise((_resolve, reject) => {
              opts.signal.addEventListener('abort', () => {
                reject(new Error('Failed https://api.waqi.info/feed/geo:28;77/?token=supersecret999 with my-firms-secret'));
              });
            })
        }),
      (err) => {
        assert.match(err.message, /token=\[REDACTED\]/);
        assert.doesNotMatch(err.message, /supersecret999/);
        assert.doesNotMatch(err.message, /my-firms-secret/);
        return true;
      }
    );

    const scrubbed = redactSecrets(
      'err ?token=tok123&api-key=ak456&key=k789 /csv/mapkey999/VIIRS_SNPP_NRT/ GEMINI_API_KEY=AIzaSyDummySecretValue123456',
      ['explicit-secret-val']
    );
    assert.doesNotMatch(scrubbed, /tok123|ak456|k789|mapkey999|AIzaSyDummySecretValue123456/);
    assert.match(scrubbed, /\/csv\/\[REDACTED\]\//);
  });
});

describe('server/airQualityService.js — Parallel Fan-out, Normalization & Fallback Degradation', () => {
  it('returns curated presets immediately without outbound fetch', async () => {
    let called = 0;
    const svc = createAirQualityService({
      fetchImpl: async () => {
        called += 1;
        return new Response('{}');
      }
    });
    const res = await svc.getAirQuality({ preset: 'coastal-moderate', calibratedAqi: 120 });
    assert.equal(called, 0);
    assert.equal(res.sourceTier, 'preset');
    assert.equal(res.stale, false);
    assert.equal(res.calibration.applied, true);
    assert.ok(res.ventilationWindow.avgNaqi >= 0);
    assert.ok(res.regionalContext.fireAlert);
  });

  it('fans out Open-Meteo + WAQI + CPCB + FIRMS, normalizes units, prioritizes CPCB > WAQI, and skips FIRMS outside IGP', async () => {
    const requestedUrls = [];
    const firmsCsv = [
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
      ...Array.from({ length: 26 }, () => '30.5,75.5,330,0.4,0.4,2026-11-25,0800,N,VIIRS,n,2.0NRT,290,12.5,D'),
      '30.5,75.5,310,0.4,0.4,2026-11-25,0800,N,VIIRS,l,2.0NRT,290,20.0,D',
      '30.5,75.5,310,0.4,0.4,2026-11-25,0800,N,VIIRS,h,2.0NRT,290,2.0,D'
    ].join('\n');

    const fetchImpl = async (url) => {
      requestedUrls.push(url);
      if (url.startsWith('https://geocoding-api.open-meteo.com')) {
        return new Response(
          JSON.stringify({
            results: [
              { name: 'Delhi', admin1: 'Ontario', country_code: 'CA', latitude: 42.85, longitude: -80.5, population: 5000 },
              { name: 'Delhi', admin1: 'Delhi', country_code: 'IN', latitude: 28.6139, longitude: 77.209, population: 19000000 }
            ]
          })
        );
      }
      if (url.startsWith('https://air-quality-api.open-meteo.com')) {
        return new Response(JSON.stringify(makeOpenMeteoAqPayload()));
      }
      if (url.startsWith('https://api.open-meteo.com')) {
        return new Response(JSON.stringify(makeOpenMeteoWxPayload()));
      }
      if (url.startsWith('https://api.waqi.info')) {
        return new Response(
          JSON.stringify({
            status: 'ok',
            data: {
              iaqi: { pm25: { v: 149 } },
              city: { name: 'Mandir Marg, Delhi' },
              attributions: [{ name: 'DPCC', url: 'https://dpcc.delhigovt.nic.in' }]
            }
          })
        );
      }
      if (url.startsWith('https://api.data.gov.in')) {
        return new Response(
          JSON.stringify({
            records: [
              { city: 'Delhi', station: 'Anand Vihar, Delhi - DPCC', latitude: 28.64, longitude: 77.31, pollutant_id: 'PM2.5', avg_value: '260' }
            ]
          })
        );
      }
      if (url.startsWith('https://firms.modaps.eosdis.nasa.gov')) {
        return new Response(firmsCsv);
      }
      return new Response('{}', { status: 404 });
    };

    let clock = new Date('2026-11-25T10:00:00+05:30').getTime();
    const cache = createTtlCache({ now: () => clock });
    const svc = createAirQualityService({
      fetchImpl,
      cache,
      now: () => clock,
      env: {
        WAQI_API_KEY: 'waqi-test-key',
        DATA_GOV_IN_API_KEY: 'gov-test-key',
        NASA_FIRMS_MAP_KEY: 'firms-test-key'
      }
    });

    const delhi = await svc.getAirQuality({ city: 'Delhi' });
    assert.equal(delhi.stale, false);
    assert.match(delhi.sourceTier, /live-open-meteo/);
    assert.equal(delhi.current.coMgM3, 0.8);
    assert.equal(delhi.current.windSpeed10mMs, 1);
    assert.equal(delhi.calibration.source, 'cpcb-data-gov-in');
    // Sub-index 260 (without raw ug/m3 unit) converts via cpcbPm25SubIndexToUgM3 -> 108 ug/m3
    assert.equal(delhi.calibration.observedPm25, 108);
    assert.equal(delhi.regionalContext.fireAlert.active, true);
    assert.equal(delhi.regionalContext.fireAlert.fireCount, 26);
    assert.ok(requestedUrls.some((u) => u.includes('/feed/geo:28.6139;77.209/')));
    assert.ok(requestedUrls.some((u) => u.includes('filters%5Bpollutant_id%5D=PM2.5')));

    // Cached second call with user calibration should not re-fetch upstream
    const beforeCalls = requestedUrls.length;
    const userCal = await svc.getAirQuality({ city: 'Delhi', calibratedPm25: 150 });
    assert.equal(requestedUrls.length, beforeCalls);
    assert.equal(userCal.calibration.observedPm25, 150);
    assert.equal(userCal.calibration.source, 'user-calibrated');

    // Coordinate query with FakeCity must NOT poison subsequent ?city=Delhi label
    const fakeLabeled = await svc.getAirQuality({ lat: 28.6139, lon: 77.209, city: 'FakeCity' });
    assert.equal(fakeLabeled.location.city, 'FakeCity');
    const delhiAgain = await svc.getAirQuality({ city: 'Delhi' });
    assert.equal(delhiAgain.location.city, 'Delhi');

    // Non-IGP city (Mumbai) must NOT query NASA FIRMS
    const mumbai = await svc.getAirQuality({ lat: 19.076, lon: 72.8777 });
    assert.equal(mumbai.regionalContext.fireAlert.active, false);
    assert.equal(requestedUrls.filter((u) => u.includes('firms.modaps')).length, 1);

    // Advance past fresh TTL and fail all live upstreams -> stale cache fallback
    clock += 10 * 60 * 1000;
    const failSvc = createAirQualityService({
      fetchImpl: async () => {
        throw new Error('network down');
      },
      cache,
      now: () => clock,
      env: {}
    });
    const staleRes = await failSvc.getAirQuality({ city: 'Delhi' });
    assert.equal(staleRes.stale, true);
    assert.equal(staleRes.location.city, 'Delhi');

    // Cold cache + live failure -> closest preset fallback (never 500)
    const coldFailSvc = createAirQualityService({
      fetchImpl: async () => {
        throw new Error('network down');
      },
      cache: createTtlCache({ now: () => clock }),
      now: () => clock,
      env: {}
    });
    const presetFallback = await coldFailSvc.getAirQuality({ lat: 19.076, lon: 72.8777 });
    assert.equal(presetFallback.sourceTier, 'fallback-preset');
    assert.equal(presetFallback.stale, true);
    assert.equal(presetFallback.location.presetId, 'coastal-moderate');
  });

  it('prevents coordinate cache poisoning across FakeCity -> Delhi and interpolates null Open-Meteo pm2_5 slots', async () => {
    const aqGapPayload = makeOpenMeteoAqPayload();
    aqGapPayload.hourly.pm2_5[0] = 100;
    aqGapPayload.hourly.pm2_5[1] = null;
    aqGapPayload.hourly.pm2_5[2] = undefined;
    aqGapPayload.hourly.pm2_5[3] = 160;

    const clock = new Date('2026-11-25T00:00:00+05:30').getTime();
    const cache = createTtlCache({ now: () => clock });
    const svc = createAirQualityService({
      cache,
      now: () => clock,
      fetchImpl: async (url) => {
        if (url.startsWith('https://geocoding-api.open-meteo.com')) {
          return new Response(
            JSON.stringify({
              results: [{ name: 'Delhi', admin1: 'Delhi', country_code: 'IN', latitude: 28.6139, longitude: 77.209 }]
            })
          );
        }
        if (url.startsWith('https://air-quality-api.open-meteo.com')) {
          return new Response(JSON.stringify(aqGapPayload));
        }
        if (url.startsWith('https://api.open-meteo.com')) {
          return new Response(JSON.stringify(makeOpenMeteoWxPayload()));
        }
        return new Response('{}', { status: 404 });
      }
    });

    const poisonedAttempt = await svc.getAirQuality({ lat: 28.61, lon: 77.21, city: 'FakeCity' });
    assert.equal(poisonedAttempt.location.city, 'FakeCity');
    assert.equal(poisonedAttempt.hourly24h[0].pm25, 100);
    assert.equal(poisonedAttempt.hourly24h[1].pm25, 120);
    assert.equal(poisonedAttempt.hourly24h[2].pm25, 140);
    assert.equal(poisonedAttempt.hourly24h[3].pm25, 160);

    const cleanDelhi = await svc.getAirQuality({ city: 'Delhi' });
    assert.equal(cleanDelhi.location.city, 'Delhi');

    // All-null Open-Meteo pm2_5 series must fail Tier 0 and trigger fallback-preset
    const allNullAq = makeOpenMeteoAqPayload();
    allNullAq.hourly.pm2_5 = allNullAq.hourly.pm2_5.map(() => null);
    const allNullSvc = createAirQualityService({
      now: () => clock,
      fetchImpl: async (url) => {
        if (url.startsWith('https://air-quality-api.open-meteo.com')) {
          return new Response(JSON.stringify(allNullAq));
        }
        return new Response(JSON.stringify(makeOpenMeteoWxPayload()));
      }
    });
    const degraded = await allNullSvc.getAirQuality({ lat: 28.61, lon: 77.21 });
    assert.equal(degraded.stale, true);
    assert.equal(degraded.sourceTier, 'fallback-preset');
  });

  it('does not stall Tier 0 when optional Tier 1/2 providers hang past 2s cutoff', async () => {
    const fetchImpl = async (url, opts) => {
      if (url.startsWith('https://air-quality-api.open-meteo.com')) {
        return new Response(JSON.stringify(makeOpenMeteoAqPayload()));
      }
      if (url.startsWith('https://api.open-meteo.com')) {
        return new Response(JSON.stringify(makeOpenMeteoWxPayload()));
      }
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    };

    const svc = createAirQualityService({
      fetchImpl,
      env: { WAQI_API_KEY: 'k1', DATA_GOV_IN_API_KEY: 'k2', NASA_FIRMS_MAP_KEY: 'k3' }
    });
    const start = Date.now();
    const res = await svc.getAirQuality({ lat: 28.61, lon: 77.21 });
    const elapsed = Date.now() - start;
    assert.equal(res.sourceTier, 'live-open-meteo');
    assert.ok(elapsed < 3500);
  });

  it('fetches past_days=1 for yesterday delta & tomorrowWindow, throws 404 CITY_NOT_FOUND, splits cpcbCityKey, fixes missing-coord CPCB scoring, and validates WAQI https URLs', async () => {
    // 72h Open-Meteo payload: 2026-11-24 (yesterday, peak 320), 2026-11-25 (today, peak 180), 2026-11-26 (tomorrow)
    const times72h = Array.from({ length: 72 }, (_, i) => {
      const day = 24 + Math.floor(i / 24);
      const hour = String(i % 24).padStart(2, '0');
      return `2026-11-${day}T${hour}:00`;
    });
    const aq72 = {
      hourly: {
        time: times72h,
        pm2_5: times72h.map((_, i) => (i < 24 ? (i === 20 ? 320 : 210) : i % 24 >= 12 && i % 24 <= 15 ? 65 : 180)),
        pm10: times72h.map(() => 220),
        carbon_monoxide: times72h.map(() => 750),
        nitrogen_dioxide: times72h.map(() => 50),
        sulphur_dioxide: times72h.map(() => 16),
        ozone: times72h.map(() => 30)
      }
    };
    const wx72 = {
      hourly: {
        time: times72h,
        boundary_layer_height: times72h.map((_, i) => (i % 24 >= 12 && i % 24 <= 15 ? 1150 : 260)),
        wind_speed_10m: times72h.map((_, i) => (i % 24 >= 12 && i % 24 <= 15 ? 10.8 : 3.6)),
        relative_humidity_2m: times72h.map(() => 74)
      }
    };

    const requestedUrls = [];
    const clock = new Date('2026-11-25T10:00:00+05:30').getTime();
    const svc = createAirQualityService({
      now: () => clock,
      env: { WAQI_API_KEY: 'waqi-k', DATA_GOV_IN_API_KEY: 'cpcb-k' },
      fetchImpl: async (url) => {
        requestedUrls.push(url);
        if (url.startsWith('https://geocoding-api.open-meteo.com')) {
          if (url.includes('XyzzyUnknown')) {
            return new Response(JSON.stringify({ results: [] }));
          }
          return new Response(
            JSON.stringify({
              results: [{ name: 'Delhi', admin1: 'Delhi', country_code: 'IN', latitude: 28.6139, longitude: 77.209 }]
            })
          );
        }
        if (url.startsWith('https://air-quality-api.open-meteo.com')) {
          return new Response(JSON.stringify(aq72));
        }
        if (url.startsWith('https://api.open-meteo.com')) {
          return new Response(JSON.stringify(wx72));
        }
        if (url.startsWith('https://api.waqi.info')) {
          return new Response(
            JSON.stringify({
              status: 'ok',
              data: {
                iaqi: { pm25: { v: 150 } },
                city: { name: 'ITO Delhi' },
                attributions: [
                  { name: 'Valid DPCC', url: 'https://dpcc.delhigovt.nic.in' },
                  { name: 'XSS Attr', url: 'javascript:alert(1)' },
                  { name: 'Http Attr', url: 'http://insecure.example/feed' }
                ]
              }
            })
          );
        }
        if (url.startsWith('https://api.data.gov.in')) {
          return new Response(
            JSON.stringify({
              records: [
                // Missing coordinates -> must score 0.6 so nearby real station (dist <= 0.5) wins
                { city: 'Delhi', station: 'Unknown Coords Station', latitude: null, longitude: null, pollutant_id: 'PM2.5', avg_value: '999', unit: 'ug/m3' },
                { city: 'Delhi', station: 'Nearby Real Station', latitude: 28.8, longitude: 77.3, pollutant_id: 'PM2.5', avg_value: '190', unit: 'ug/m3' }
              ]
            })
          );
        }
        return new Response('{}', { status: 404 });
      }
    });

    // Unknown city throws 404 CITY_NOT_FOUND instead of masking as Delhi
    await assert.rejects(
      () => svc.getAirQuality({ city: 'XyzzyUnknown' }),
      (err) => err?.statusCode === 404 && err?.code === 'CITY_NOT_FOUND'
    );

    // Coordinate lookup first (cpcbCity=null) must NOT poison named city CPCB lookup
    const geoRes = await svc.getAirQuality({ lat: 28.6139, lon: 77.209 });
    assert.ok(requestedUrls.some((u) => u.includes('past_days=1') && u.includes('forecast_days=2') && u.includes('Asia%2FKolkata')));
    assert.ok(requestedUrls.some((u) => u.includes('api.data.gov.in') && u.includes('limit=250')));
    assert.match(geoRes.whatChangedToday.summaryEn, /vs yesterday/);
    assert.ok(geoRes.tomorrowWindow !== null);
    assert.ok(geoRes.tomorrowWindow.label.includes('IST'));

    // Nearby real station (dist ~0.21) beat missing-coord station (score 0.6)
    assert.equal(geoRes.regionalContext.stationName, 'Nearby Real Station');
    assert.equal(geoRes.calibration.observedPm25, 190);

    // WAQI attribution URL validation sanitized javascript: and http:// to https://waqi.info
    const attrUrls = geoRes.attribution.map((a) => a.url);
    assert.ok(attrUrls.includes('https://dpcc.delhigovt.nic.in/'));
    assert.ok(attrUrls.every((u) => u.startsWith('https://')));
    assert.ok(!attrUrls.some((u) => u.startsWith('javascript:') || u.startsWith('http://')));

    // Named city lookup uses separate :delhi cache key and queries CPCB with filters[city]=Delhi
    const cityRes = await svc.getAirQuality({ city: 'Delhi' });
    assert.equal(cityRes.location.city, 'Delhi');
    assert.ok(requestedUrls.some((u) => u.includes('filters%5Bcity%5D=Delhi')));
  });
});

describe('server/geminiService.js — Interactions SDK, Coalescing, Quota & Safety Floor', () => {
  function buildTestContext() {
    const snapshot = buildAirQualitySnapshot({ presetId: 'delhi-severe' });
    const impact = calculateHouseholdImpact({ outdoorPm25: snapshot.current.pm25, profiles: ['infant', 'commuter'] });
    const baselinePlan = generateDeterministicPlan({ snapshot, impact, profiles: ['infant', 'commuter'], lang: 'en' });
    return { snapshot, impact, baselinePlan };
  }

  it('calls client.interactions.create with static system_instruction, store:false, coalesces bursts, and rejects unsafe output', async () => {
    const { snapshot, impact, baselinePlan } = buildTestContext();
    let sdkCalls = 0;
    let nextOutput = null;

    const svc = createGeminiService({
      env: { GEMINI_API_KEY: 'test-gemini-key', GEMINI_MODEL: 'invalid model!!', GEMINI_DAILY_CAP: '3' },
      clientFactory: () => ({
        interactions: {
          create: async (params, opts) => {
            sdkCalls += 1;
            assert.equal(params.model, 'gemini-3.5-flash-lite');
            assert.equal(params.store, false);
            assert.equal(params.response_format.mime_type, 'application/json');
            assert.ok(opts.signal instanceof AbortSignal);
            assert.deepEqual(opts.retries, { strategy: 'none' });
            return { output_text: JSON.stringify(nextOutput) };
          }
        }
      })
    });

    const validLlmPlan = {
      headlinePlainEnglish: 'Delhi NAQI 420 Severe: stay indoors and filter bedroom air.',
      threeAnchorRoutine: [
        { id: 'morning_shield', conflictNote: 'Hold school commute brief.', actions: ['Keep infants in filtered room.'] },
        { id: 'midday_flush', conflictNote: 'Short midday CO2 flush.', actions: ['Flush 15 min at 14:00 IST.'] },
        { id: 'evening_lockdown', conflictNote: 'Seal home before dusk.', actions: ['Run 4-filter CR box on high.'] }
      ],
      profileGuidance: [{ profileId: 'infant', priorityAction: 'Keep bedroom closed with CR box running.' }],
      whatsappBrief: 'RWA Brief: NAQI 420 Severe; delay outdoor activity until midday window.'
    };
    nextOutput = validLlmPlan;

    // Concurrent identical requests coalesce into a single SDK call
    const [p1, p2] = await Promise.all([
      svc.enhancePlan({
        snapshot,
        impact,
        baselinePlan,
        validated: { lang: 'en', profiles: ['infant', 'commuter'], maskType: 'n95', purifierMode: 'diy_cr_box', communityActions: [] }
      }),
      svc.enhancePlan({
        snapshot,
        impact,
        baselinePlan,
        validated: { lang: 'en', profiles: ['infant', 'commuter'], maskType: 'n95', purifierMode: 'diy_cr_box', communityActions: [] }
      })
    ]);
    assert.equal(sdkCalls, 1);
    assert.equal(p1.source, 'gemini');
    assert.equal(p2.plan.headlinePlainEnglish, validLlmPlan.headlinePlainEnglish);

    // Unsafe recommendation (infant mask) must trigger deterministic fallback
    nextOutput = {
      ...validLlmPlan,
      headlinePlainEnglish: 'Put an N95 mask on your infant baby outside.'
    };
    const unsafeRes = await svc.enhancePlan({
      snapshot,
      impact,
      baselinePlan,
      validated: { lang: 'en', profiles: ['infant'], maskType: 'none', purifierMode: 'none', communityActions: [] }
    });
    assert.equal(unsafeRes.source, 'fallback');
    assert.equal(unsafeRes.fallbackReason, 'safety_or_schema_rejected');

    // XSS HTML output in chat must trigger deterministic fallback
    nextOutput = { reply: '<script>alert(1)</script> Open windows now' };
    const xssChat = await svc.answerChat({
      message: 'When should I open windows?',
      history: [],
      lang: 'en',
      snapshot,
      impact
    });
    assert.equal(xssChat.source, 'fallback');
    assert.equal(xssChat.fallbackReason, 'safety_or_schema_rejected');

    // 4th call exceeds GEMINI_DAILY_CAP=3 -> circuit breaker trips cleanly without calling SDK
    const quotaChat = await svc.answerChat({
      message: 'Is an ozone ionizer safe?',
      history: [],
      lang: 'en',
      snapshot,
      impact
    });
    assert.equal(sdkCalls, 3);
    assert.equal(quotaChat.source, 'fallback');
    assert.equal(quotaChat.fallbackReason, 'quota_exceeded');
  });

  it('degrades cleanly on missing API key and grounded chat success', async () => {
    const { snapshot, impact } = buildTestContext();
    const noKeySvc = createGeminiService({ env: {} });
    const chatFallback = await noKeySvc.answerChat({
      message: 'How much PM2.5 do we save?',
      history: [],
      lang: 'en',
      snapshot,
      impact
    });
    assert.equal(chatFallback.source, 'fallback');
    assert.equal(chatFallback.fallbackReason, 'missing_api_key');
    assert.equal(chatFallback.groundedNaqi, snapshot.current.naqi);

    const okSvc = createGeminiService({
      env: { GEMINI_API_KEY: 'valid-key', GEMINI_MODEL: 'gemini-3.5-flash-lite' },
      clientFactory: () => ({
        interactions: {
          create: async () => ({
            outputs: [{ type: 'text', text: JSON.stringify({ reply: 'Best window is 13:00-15:00 IST at NAQI 420.' }) }]
          })
        }
      })
    });
    const okChat = await okSvc.answerChat({
      message: 'Best window today?',
      history: [],
      lang: 'en',
      snapshot,
      impact
    });
    assert.equal(okChat.source, 'gemini');
    assert.match(okChat.reply, /13:00-15:00 IST/);
  });

  it('distinguishes coalescing keys on roomVolumeM3/profile/history and blocks double-negative safety bypasses', async () => {
    const { snapshot } = buildTestContext();
    let sdkCalls = 0;
    let nextReply = { reply: 'OK', safetyNotice: '' };

    const svc = createGeminiService({
      env: { GEMINI_API_KEY: 'test-key' },
      clientFactory: () => ({
        interactions: {
          create: async (_params, opts) => {
            sdkCalls += 1;
            assert.deepEqual(opts.retries, { strategy: 'none' });
            await new Promise((r) => setTimeout(r, 15));
            return { output_text: JSON.stringify(nextReply) };
          }
        }
      })
    });

    const impactSmall = calculateHouseholdImpact({ outdoorPm25: snapshot.current.pm25, profile: 'infant', roomVolumeM3: 30 });
    const impactLarge = calculateHouseholdImpact({ outdoorPm25: snapshot.current.pm25, profile: 'commuter', roomVolumeM3: 120 });
    const planSmall = generateDeterministicPlan({ snapshot, impact: impactSmall, profiles: ['infant', 'commuter'], profile: 'infant', lang: 'en' });
    const planLarge = generateDeterministicPlan({ snapshot, impact: impactLarge, profiles: ['infant', 'commuter'], profile: 'commuter', lang: 'en' });

    nextReply = {
      headlinePlainEnglish: 'Delhi NAQI Severe: keep rooms sealed and filtered.',
      threeAnchorRoutine: [
        { id: 'morning_shield', conflictNote: 'Hold commute brief.', actions: ['Keep infants indoors.'] },
        { id: 'midday_flush', conflictNote: 'Short midday flush.', actions: ['Flush 15 min.'] },
        { id: 'evening_lockdown', conflictNote: 'Seal before dusk.', actions: ['Run CR box.'] }
      ],
      profileGuidance: [{ profileId: 'infant', priorityAction: 'Use bedroom filtration.' }],
      whatsappBrief: 'RWA Brief: NAQI Severe.'
    };

    const [pA, pB] = await Promise.all([
      svc.enhancePlan({
        snapshot,
        impact: impactSmall,
        baselinePlan: planSmall,
        validated: { lang: 'en', profile: 'infant', profiles: ['infant', 'commuter'], maskType: 'n95', purifierMode: 'diy_cr_box', roomVolumeM3: 30, communityActions: [] }
      }),
      svc.enhancePlan({
        snapshot,
        impact: impactLarge,
        baselinePlan: planLarge,
        validated: { lang: 'en', profile: 'commuter', profiles: ['infant', 'commuter'], maskType: 'n95', purifierMode: 'diy_cr_box', roomVolumeM3: 120, communityActions: [] }
      })
    ]);
    assert.equal(sdkCalls, 2);
    assert.equal(pA.impact.profile, 'infant');
    assert.equal(pB.impact.profile, 'commuter');

    // Distinct chat history turns must NOT coalesce together
    nextReply = { reply: 'शिशु को कभी मास्क न पहनाएं, बंद कमरे में फ़िल्टर चलाएं।', safetyNotice: '' };
    const [cA, cB] = await Promise.all([
      svc.answerChat({ message: 'What now?', history: [{ role: 'user', text: 'First turn' }], lang: 'hi', snapshot, impact: impactSmall }),
      svc.answerChat({ message: 'What now?', history: [{ role: 'user', text: 'Different turn' }], lang: 'hi', snapshot, impact: impactSmall })
    ]);
    assert.equal(sdkCalls, 4);
    assert.equal(cA.source, 'gemini');
    assert.equal(cB.source, 'gemini');
    assert.equal(cA.safetyNotice, undefined);

    // Double-negative safety bypass attempts must be rejected to fallback
    const unsafePhrases = [
      'Do not hesitate to put an N95 mask on your infant',
      'No problem washing your N95 with soap and water',
      "Don't skip running an ozone ionizer in the bedroom",
      'Go jogging outside today for fresh air'
    ];
    for (const phrase of unsafePhrases) {
      nextReply = { reply: phrase };
      const res = await svc.answerChat({
        message: 'Advice please',
        history: [],
        lang: 'en',
        snapshot,
        impact: impactSmall
      });
      assert.equal(res.source, 'fallback', `Expected rejection for: ${phrase}`);
      assert.equal(res.fallbackReason, 'safety_or_schema_rejected');
    }
  });

  it('caches verified enhancePlan results for 10 minutes across EN/HI toggles and hardens clauseViolatesSafety', async () => {
    const { snapshot, impact, baselinePlan } = buildTestContext();
    let clock = 1_000_000;
    let sdkCalls = 0;

    const svc = createGeminiService({
      env: { GEMINI_API_KEY: 'test-key' },
      now: () => clock,
      clientFactory: () => ({
        interactions: {
          create: async (params) => {
            sdkCalls += 1;
            const parsedInput = JSON.parse(params.input);
            return {
              output_text: JSON.stringify({
                headlinePlainEnglish: `Plan (${parsedInput.lang}) NAQI ${snapshot.current.naqi}`,
                threeAnchorRoutine: [
                  { id: 'morning_shield', conflictNote: 'Hold commute.', actions: ['Stay indoors.'] },
                  { id: 'midday_flush', conflictNote: 'Short flush.', actions: ['Open 15 min.'] },
                  { id: 'evening_lockdown', conflictNote: 'Seal home.', actions: ['Run CR box.'] }
                ],
                profileGuidance: [{ profileId: 'commuter', priorityAction: 'Wear N95 outdoors.' }],
                whatsappBrief: `Brief (${parsedInput.lang})`
              })
            };
          }
        }
      })
    });

    const reqEn = {
      snapshot,
      impact,
      baselinePlan,
      validated: { lang: 'en', profiles: ['infant', 'commuter'], maskType: 'n95', purifierMode: 'diy_cr_box', communityActions: [] }
    };
    const reqHi = {
      snapshot,
      impact,
      baselinePlan,
      validated: { lang: 'hi', profiles: ['infant', 'commuter'], maskType: 'n95', purifierMode: 'diy_cr_box', communityActions: [] }
    };

    const en1 = await svc.enhancePlan(reqEn);
    const hi1 = await svc.enhancePlan(reqHi);
    const en2 = await svc.enhancePlan(reqEn);
    assert.equal(en1.source, 'gemini');
    assert.equal(hi1.source, 'gemini');
    assert.equal(en2.source, 'gemini');
    assert.equal(en2.plan.headlinePlainEnglish, en1.plan.headlinePlainEnglish);
    assert.equal(sdkCalls, 2);

    // After 10 minutes TTL expires -> fresh SDK call
    clock += 10 * 60 * 1000 + 1;
    const en3 = await svc.enhancePlan(reqEn);
    assert.equal(en3.source, 'gemini');
    assert.equal(sdkCalls, 3);

    // Hardened clauseViolatesSafety checks
    assert.equal(clauseViolatesSafety('Put an N95 on your infant and avoid cold drafts'.split(' and ')[0], 420), true);
    assert.equal(clauseViolatesSafety('Put an N95 on your infant to avoid cold drafts', 420), true);
    assert.equal(clauseViolatesSafety('Never put an N95 mask on your infant', 420), false);
    assert.equal(clauseViolatesSafety('शिशु को कभी मास्क न पहनाएं', 420), false);
    assert.equal(clauseViolatesSafety('Do light indoor exercise or yoga with purifier on', 420), false);
    assert.equal(clauseViolatesSafety('घर के अंदर हल्का व्यायाम करें', 420), false);
    assert.equal(clauseViolatesSafety('Go for a morning jog in the park', 420), true);
    assert.equal(clauseViolatesSafety('Use a plasma air cleaner indoors', 200), true);
    assert.equal(clauseViolatesSafety('Rinse your respirator with soap', 200), true);
  });
});

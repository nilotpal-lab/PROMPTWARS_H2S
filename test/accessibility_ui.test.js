import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';
import { buildAirQualitySnapshot, classifyNaqi, computeNaqi } from '../lib/aqi.js';
import { calculateHouseholdImpact } from '../lib/impact.js';

const PUBLIC_DIR = path.resolve('public');

async function loadFrontendDom() {
  const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const css = await fs.readFile(path.join(PUBLIC_DIR, 'styles.css'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    pretendToBeVisual: true
  });
  const style = dom.window.document.createElement('style');
  style.textContent = css;
  dom.window.document.head.append(style);
  dom.window.__VAYUMITRA_MANUAL_INIT__ = true;
  return dom;
}

function withDomGlobals(dom, fn) {
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevElem = globalThis.Element;
  const prevNode = globalThis.Node;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.window = prevWin;
      globalThis.document = prevDoc;
      globalThis.Element = prevElem;
      globalThis.Node = prevNode;
    });
}

function assertCleanElementAttrs(doc) {
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      const name = attr.name.toLowerCase();
      assert.notEqual(name, 'style', `Inline style attribute found on <${el.tagName}>`);
      assert.equal(name.startsWith('on'), false, `Inline handler ${name}= found on <${el.tagName}>`);
    }
  }
}

describe('Frontend CSP hygiene, XSS escaping, keyboard navigation & WCAG 2.2 AA+', () => {
  it('contains zero unsafe DOM sinks, evals, inline scripts, or inline style attributes and enforces 44px .lang-btn', async () => {
    const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    const css = await fs.readFile(path.join(PUBLIC_DIR, 'styles.css'), 'utf8');
    assert.equal(/<style\b/i.test(html), false, 'Inline <style> block found in HTML');
    assert.equal(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(html), false, 'Zoom-blocking viewport found');
    assert.match(html, /viewport-fit=cover/);
    assert.match(css, /\.lang-btn\s*\{[^}]*min-height:\s*44px;/s);

    const dom = new JSDOM(html);
    assertCleanElementAttrs(dom.window.document);

    const scripts = Array.from(dom.window.document.querySelectorAll('script'));
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].getAttribute('src'), '/js/app.js');
    assert.equal(scripts[0].textContent.trim(), '');

    const jsDir = path.join(PUBLIC_DIR, 'js');
    const jsFiles = await fs.readdir(jsDir);
    const forbidden = /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval|new\s+Function)\b|setAttribute\(\s*['"]style['"]/;
    for (const file of jsFiles) {
      if (!file.endsWith('.js')) {
        continue;
      }
      const code = await fs.readFile(path.join(jsDir, file), 'utf8');
      assert.equal(forbidden.test(code), false, `Unsafe sink found in public/js/${file}`);
    }
  });

  it('matches lib/impact.js dosimetry and lib/aqi.js NAQI 100% in public/js/state.js', async () => {
    const {
      classifyNaqi: clientClassifyNaqi,
      computeImpactMirror,
      computeNaqi: clientComputeNaqi,
      createInitialState
    } = await import('../public/js/state.js');
    const scenarios = [
      { pm25: 0, profile: 'commuter', maskType: 'n95', purifierMode: 'diy_cr_box', roomVolumeM3: 40, outdoorHours: 0, noExhaustTadka: false, indoorIncenseOrCoil: false, dryJhaduSweeping: false, sealed24hNoFlush: false, commuteFrom: 'petrol_car', commuteTo: 'wfh', dailyKm: 0, commuteDaysPerWeek: 5, communityActions: [] },
      { pm25: 220, profile: 'commuter', maskType: 'n95', purifierMode: 'diy_cr_box', roomVolumeM3: 40, outdoorHours: 2.5, noExhaustTadka: true, indoorIncenseOrCoil: false, dryJhaduSweeping: false, sealed24hNoFlush: false, commuteFrom: 'petrol_car', commuteTo: 'metro_bus', dailyKm: 20, commuteDaysPerWeek: 5, communityActions: ['compost_leaves'] },
      { pm25: 340, profile: 'infant', maskType: 'n95', purifierMode: 'hepa_purifier', roomVolumeM3: 32, outdoorHours: 0.5, noExhaustTadka: false, indoorIncenseOrCoil: true, dryJhaduSweeping: true, sealed24hNoFlush: true, commuteFrom: 'diesel_cab', commuteTo: 'ev', dailyKm: 12, commuteDaysPerWeek: 6, communityActions: ['watchman_thermal_gear', 'school_no_idling_dg_stagger'] }
    ];

    for (const cfg of scenarios) {
      const serverImpact = calculateHouseholdImpact({ ...cfg, outdoorPm25: cfg.pm25 });
      const clientImpact = computeImpactMirror(cfg.pm25, cfg);
      assert.deepEqual(clientImpact, serverImpact);
    }

    assert.deepEqual(
      clientComputeNaqi({ pm25: 185, coUgM3: 800 }),
      computeNaqi({ pm25: 185, coUgM3: 800 })
    );
    assert.deepEqual(clientClassifyNaqi(462), classifyNaqi(462));

    const dom = await loadFrontendDom();
    await withDomGlobals(dom, async () => {
      const seeded = createInitialState().snapshot;
      const domainDelhi = buildAirQualitySnapshot({ presetId: 'delhi-severe' });
      assert.equal(seeded.current.istHour, domainDelhi.current.istHour);
      assert.equal(seeded.current.naqi, domainDelhi.current.naqi);
      assert.equal(seeded.current.category, domainDelhi.current.category);
      assert.deepEqual(seeded.hourly24h, domainDelhi.hourly24h);
    });
  });

  it('rejects 200 OK non-JSON responses in api.js', async () => {
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('<html>bad gateway</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
    try {
      const { fetchAqiSnapshot } = await import('../public/js/api.js');
      await assert.rejects(() => fetchAqiSnapshot({ preset: 'delhi-severe', lang: 'en' }), /non-JSON/i);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it('aligns rotated 24h SVG chart bands inside 560x290 viewBox and stacks 520x168 dose legend cleanly', async () => {
    const dom = await loadFrontendDom();
    await withDomGlobals(dom, async () => {
      const { renderDoseBarSvg, renderPm25Chart } = await import('../public/js/charts.js');
      const doc = dom.window.document;
      const chartSvg = doc.getElementById('pm25-chart-svg');
      const rotatedHourly = Array.from({ length: 24 }, (_, idx) => ({
        istHour: (18 + idx) % 24,
        pm25: 100 + ((idx * 17) % 180)
      }));
      renderPm25Chart(chartSvg, {
        location: { city: 'Patna' },
        current: { istHour: 20 },
        ventilationWindow: { startHour: 13, endHour: 15, label: '13:00–15:00 IST' },
        peakSmogWindow: { startHour: 23, endHour: 1, label: '23:00–01:00 IST' },
        hourly24h: rotatedHourly
      }, 'en');

      assert.equal(chartSvg.getAttribute('viewBox'), '0 0 560 290');
      const tickTexts = Array.from(chartSvg.querySelectorAll('text')).map((n) => n.textContent);
      assert.ok(tickTexts.includes('18:00'));
      for (const rect of chartSvg.querySelectorAll('rect')) {
        const x = Number(rect.getAttribute('x'));
        const w = Number(rect.getAttribute('width'));
        assert.ok(x >= 0 && x + w <= 560, `Band rect overflowed viewBox: x=${x}, w=${w}`);
      }

      // Close bands stack clearly below legend (y=20) and above PLOT.top (y=72)
      renderPm25Chart(chartSvg, {
        location: { city: 'Patna' },
        current: { istHour: 20 },
        ventilationWindow: { startHour: 14, endHour: 16, label: '14:00–16:00 IST' },
        peakSmogWindow: { startHour: 21, endHour: 23, label: '21:00–23:00 IST' },
        hourly24h: Array.from({ length: 24 }, (_, idx) => ({ istHour: idx, pm25: 120 + idx }))
      }, 'en');
      const bandNodes = Array.from(chartSvg.querySelectorAll('text')).filter((n) => /IST$/.test(n.textContent || ''));
      assert.equal(bandNodes.length, 2);
      for (const node of bandNodes) {
        const yVal = Number(node.getAttribute('y'));
        assert.ok(yVal >= 40 && yVal <= 66, `Header band label y=${yVal} must stay clear of legend (20) and plot (72)`);
      }

      const doseSvg = doc.getElementById('dose-bar-svg');
      renderDoseBarSvg(doseSvg, { dose: { commuteOutdoor: 0, cookingIndoor: 0, baselineIndoor: 0, totalMitigatedUg: 0 } }, 'en');
      assert.equal(doseSvg.getAttribute('viewBox'), '0 0 520 168');
      const legendTexts = Array.from(doseSvg.querySelectorAll('text'));
      assert.equal(legendTexts.length, 3);
      const yPositions = legendTexts.map((t) => Number(t.getAttribute('y')));
      assert.equal(new Set(yPositions).size, 3, 'Dose legend rows must stack on distinct Y coordinates');
    });
  });

  it('supports GPS geolocation, form aria-invalid validation, 404 city retention, empty dailyKm=0, tomorrowWindow, slider aria-valuetext, incremental copilot & focus preservation', async () => {
    const dom = await loadFrontendDom();
    const prevFetch = globalThis.fetch;

    await withDomGlobals(dom, async () => {
      const { initApp } = await import('../public/js/app.js');
      const { collectDomRefs, renderCopilotPanel } = await import('../public/js/renderers.js');
      const doc = dom.window.document;
      const fetchedUrls = [];

      globalThis.fetch = async (url, opts) => {
        fetchedUrls.push({ url: String(url), method: opts?.method || 'GET' });
        if (String(url).includes('city=UnknownTown')) {
          return new Response(JSON.stringify({ error: { code: 'CITY_NOT_FOUND', message: 'City not found' } }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (String(url).includes('/api/aqi')) {
          const base = buildAirQualitySnapshot({ presetId: 'igp-very-poor' });
          return new Response(JSON.stringify({
            ...base,
            location: { ...base.location, city: 'GPS Lucknow', lat: 26.85, lon: 80.95 },
            tomorrowWindow: { startHour: 12, endHour: 14, label: '12:00–14:00 IST', avgPm25: 98, confidence: 'brief_only' }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (String(url).includes('/api/plan')) {
          return new Response(JSON.stringify({ error: { code: 'AI_DOWN', message: 'Quota exceeded' } }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      };

      const app = initApp(doc);
      try {
        // 1. Boot does zero redundant /api/aqi calls
        assert.equal(fetchedUrls.length, 0);

        // 2. Range slider aria-valuetext updates in EN and HI
        const roomRange = doc.getElementById('room-volume-range');
        const hoursRange = doc.getElementById('outdoor-hours-range');
        assert.match(roomRange.getAttribute('aria-valuetext'), /36 m³/);
        assert.match(hoursRange.getAttribute('aria-valuetext'), /2\.5 hours per day/);
        roomRange.value = '60';
        roomRange.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        assert.match(roomRange.getAttribute('aria-valuetext'), /60 m³/);

        // 3. Empty #daily-km-input maps to 0 km (not 16 km), invalid shows aria-invalid
        const dailyKmInput = doc.getElementById('daily-km-input');
        dailyKmInput.value = '';
        dailyKmInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        assert.equal(app.state.household.dailyKm, 0);
        assert.equal(dailyKmInput.hasAttribute('aria-invalid'), false);
        dailyKmInput.value = '999';
        dailyKmInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        assert.equal(dailyKmInput.getAttribute('aria-invalid'), 'true');
        assert.equal(doc.getElementById('daily-km-error').hidden, false);

        // 4. Empty city and invalid calibration submit set aria-invalid + aria-describedby + alert
        const cityInput = doc.getElementById('city-input');
        const statusBanner = doc.getElementById('status-banner');
        cityInput.value = '';
        doc.getElementById('city-search-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        assert.equal(cityInput.getAttribute('aria-invalid'), 'true');
        assert.equal(cityInput.getAttribute('aria-describedby'), 'status-banner');
        assert.equal(statusBanner.getAttribute('role'), 'alert');

        const calInput = doc.getElementById('calibrated-aqi-input');
        calInput.value = '1500';
        doc.getElementById('calibration-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        assert.equal(calInput.getAttribute('aria-invalid'), 'true');
        assert.equal(calInput.getAttribute('aria-describedby'), 'status-banner');

        // 5. #gps-locate-btn existence & geolocation -> GET /api/aqi?lat=...&lon=... + tomorrowWindow rendering
        const gpsBtn = doc.getElementById('gps-locate-btn');
        assert.ok(gpsBtn, '#gps-locate-btn must exist');
        Object.defineProperty(dom.window.navigator, 'geolocation', {
          configurable: true,
          value: {
            getCurrentPosition: (ok) => ok({ coords: { latitude: 26.8467, longitude: 80.9462 } })
          }
        });
        gpsBtn.click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.ok(fetchedUrls.some((u) => u.url.includes('/api/aqi?') && u.url.includes('lat=26.8467') && u.url.includes('lon=80.9462')));
        assert.equal(doc.getElementById('hero-location-city').textContent, 'GPS Lucknow');
        assert.equal(doc.getElementById('tomorrow-window-row').hidden, false);
        assert.match(doc.getElementById('tomorrow-window-label').textContent, /12:00–14:00 IST/);

        // 6. Non-silent /api/plan failure surfaced in #plan-source-badge and #status-banner
        assert.match(doc.getElementById('plan-source-badge').textContent, /Offline Fallback/i);
        assert.match(statusBanner.textContent, /Quota exceeded/);

        // 7. 404 CITY_NOT_FOUND preserves current valid city telemetry
        cityInput.value = 'UnknownTown';
        doc.getElementById('city-search-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(doc.getElementById('hero-location-city').textContent, 'GPS Lucknow');
        assert.match(statusBanner.textContent, /City not found/i);
        assert.equal(cityInput.getAttribute('aria-invalid'), 'true');

        // 8. Focus preserved on #routine-anchors checkbox when syncPlan() updates plan section
        const firstAnchorCheckbox = doc.querySelector('#routine-anchors input[type="checkbox"]');
        firstAnchorCheckbox.focus();
        assert.equal(doc.activeElement, firstAnchorCheckbox);
        await app.syncPlan();
        assert.equal(doc.activeElement, firstAnchorCheckbox);

        // 9. Incremental copilot append preserves existing DOM bubble nodes
        const refs = collectDomRefs(doc);
        const msgBox = doc.getElementById('copilot-messages');
        const msg1 = { role: 'user', text: 'First question' };
        const msg2 = { role: 'assistant', text: 'First reply', meta: 'NAQI 300' };
        renderCopilotPanel(refs, [msg1], app.state.snapshot, 'en', () => {});
        const firstBubbleNode = msgBox.children[0];
        renderCopilotPanel(refs, [msg1, msg2], app.state.snapshot, 'en', () => {});
        assert.equal(msgBox.children.length, 2);
        assert.equal(msgBox.children[0], firstBubbleNode);

        // Language switch rebuilds copilot bubbles in Hindi and updates slider aria-valuetext
        doc.getElementById('lang-hi-btn').click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.match(hoursRange.getAttribute('aria-valuetext'), /घंटे प्रतिदिन/);

        // GPS denied & timeout errors display localized status banner
        Object.defineProperty(dom.window.navigator, 'geolocation', {
          configurable: true,
          value: {
            getCurrentPosition: (_ok, errFn) => errFn({ code: 1 })
          }
        });
        gpsBtn.click();
        assert.match(statusBanner.textContent, /लोकेशन की अनुमति नहीं मिली/);

        Object.defineProperty(dom.window.navigator, 'geolocation', {
          configurable: true,
          value: {
            getCurrentPosition: (_ok, errFn) => errFn({ code: 3 })
          }
        });
        gpsBtn.click();
        assert.ok(statusBanner.textContent.trim().length > 0);

        // Apply and clear manual calibration AQI
        calInput.value = '355';
        doc.getElementById('calibration-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(doc.getElementById('clear-calibration-btn').hidden, false);
        doc.getElementById('clear-calibration-btn').click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(doc.getElementById('clear-calibration-btn').hidden, true);

        // WhatsApp clipboard copy success + fallback textarea toggle
        Object.defineProperty(dom.window.navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async () => {} }
        });
        doc.getElementById('copy-whatsapp-btn').click();
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(doc.getElementById('whatsapp-fallback-wrap').hidden, true);

        Object.defineProperty(dom.window.navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async () => { throw new Error('denied'); } }
        });
        doc.getElementById('copy-whatsapp-btn').click();
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(doc.getElementById('whatsapp-fallback-wrap').hidden, false);

        // Copilot submit & error fallback path
        doc.getElementById('copilot-input').value = 'Can we ventilate now?';
        doc.getElementById('copilot-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.ok(doc.getElementById('copilot-messages').children.length >= 2);
      } finally {
        globalThis.fetch = prevFetch;
        app.destroy();
      }
    });
  });

  it('escapes worst-case XSS, supports midnight .ics, EN/HI table-toggle preservation, safetyNotice, APG keyboard & 0 axe-core violations', async () => {
    const dom = await loadFrontendDom();
    const xssPayload = '<img src=x onerror=alert(1)><script>window.__xssFired=1</script>';

    await withDomGlobals(dom, async () => {
      const { initApp } = await import('../public/js/app.js');
      const {
        buildIcsContent,
        collectDomRefs,
        renderCopilotPanel,
        renderLocationAndTelemetry,
        renderPlanSections,
        renderSimulatorReadout
      } = await import('../public/js/renderers.js');
      const { computeImpactMirror } = await import('../public/js/state.js');

      const app = initApp(dom.window.document);
      const { state } = app;
      const doc = dom.window.document;
      try {
        const infantBox = doc.querySelector('input[name="profiles"][value="infant"]');
        infantBox.checked = true;
        infantBox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        const profileSelect = doc.getElementById('profile-select');
        assert.equal(profileSelect.value, 'infant');
        assert.equal(profileSelect.options.length, 2);

        state.snapshot.location.city = `Anand Vihar ${xssPayload}`;
        state.snapshot.regionalContext = {
          fireAlert: { active: true, fireCount: 42, region: 'Punjab-Haryana', messageEn: `Fire plume ${xssPayload}` }
        };
        state.snapshot.whatChangedToday.summaryEn = `Change summary ${xssPayload}`;
        state.household.maskType = 'n95';
        state.impact = computeImpactMirror(260, state.household);
        state.planSource = 'gemini';
        state.plan = {
          lang: 'en',
          headlinePlainEnglish: `Headline ${xssPayload}`,
          medicalRedFlag: { active: true, severity: 'critical', guidance: `Red flag ${xssPayload}`, emergencySigns: [`Sign ${xssPayload}`] },
          threeAnchorRoutine: [
            { id: 'morning_shield', timeWindow: '06:30–09:00 IST', title: `Morning ${xssPayload}`, conflictNote: xssPayload, actions: [xssPayload] }
          ],
          profileGuidance: [
            { profileId: 'infant', label: 'Infant', maskRule: `Safety rule ${xssPayload}`, outdoorRule: xssPayload, priorityAction: xssPayload }
          ],
          iaqHacks: { zero_cost: [{ title: xssPayload, detail: xssPayload }], diy: [], purifier: [] },
          mythBusters: [{ myth: xssPayload, reality: xssPayload }],
          commuteAndCommunity: { whatsappBrief: `RWA Brief ${xssPayload}` }
        };

        const refs = collectDomRefs(doc);
        renderLocationAndTelemetry(refs, state.snapshot, 'en');
        renderSimulatorReadout(refs, state.impact, state.household, state.snapshot, 'en');
        renderPlanSections(refs, state, () => {});
        renderCopilotPanel(
          refs,
          [{ role: 'assistant', text: `Reply ${xssPayload}`, meta: 'NAQI 420', safetyNotice: `Medical notice ${xssPayload}` }],
          state.snapshot,
          'en',
          () => {}
        );

        assert.equal(state.impact.mask.blockedForInfant, true);
        assert.equal(state.impact.mask.efficiency, 0);
        assert.equal(refs['infant-mask-warning'].hidden, false);
        assert.equal(refs['medical-red-flag-banner'].classList.contains('alert-critical'), true);
        assert.equal(dom.window.__xssFired, undefined);
        assert.equal(doc.querySelectorAll('img[src="x"]').length, 0);
        assert.ok(refs['hero-location-city'].textContent.includes('<img src=x onerror=alert(1)>'));
        assert.ok(doc.querySelector('.chat-safety-notice')?.textContent.includes('Medical notice'));
        assert.match(doc.getElementById('math-details-body').textContent, /Open-Meteo CAMS/i);
        assert.equal(doc.querySelectorAll('#inversion-diagram-callouts li').length, 3);
        assert.equal(doc.querySelectorAll('#diy-diagram-callouts li').length, 3);
        assertCleanElementAttrs(doc);

        const toggleBtn = doc.getElementById('toggle-table-btn');
        const tableWrap = doc.getElementById('pm25-table-wrap');
        assert.equal(toggleBtn.getAttribute('aria-expanded'), 'false');
        toggleBtn.click();
        assert.equal(toggleBtn.getAttribute('aria-expanded'), 'true');
        assert.equal(tableWrap.hidden, false);
        assert.equal(toggleBtn.getAttribute('data-i18n'), 'hideTableBtn');

        const tabRoutine = doc.getElementById('tab-routine');
        const tabIaq = doc.getElementById('tab-iaq');
        const tabImpact = doc.getElementById('tab-impact');
        tabRoutine.focus();
        tabRoutine.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        assert.equal(tabIaq.getAttribute('aria-selected'), 'true');
        assert.equal(tabIaq.getAttribute('tabindex'), '0');
        assert.equal(doc.getElementById('panel-iaq').hidden, false);

        tabIaq.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        assert.equal(tabImpact.getAttribute('aria-selected'), 'true');
        tabImpact.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        assert.equal(tabRoutine.getAttribute('aria-selected'), 'true');

        const openBtn = doc.getElementById('open-copilot-btn');
        const dialog = doc.getElementById('copilot-dialog');
        openBtn.focus();
        openBtn.click();
        assert.equal(dialog.hasAttribute('open'), true);
        dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.equal(dialog.hasAttribute('open'), false);
        assert.equal(doc.activeElement, openBtn);

        const midnightIcs = buildIcsContent({
          location: { city: 'Delhi' },
          ventilationWindow: { startHour: 0, endHour: 2, label: '00:00–02:00 IST', avgPm25: 80 }
        }, 'en');
        assert.match(midnightIcs, /DTSTART:\d{8}T183000Z/);
        assert.match(midnightIcs, /DTEND:\d{8}T203000Z/);

        const rolloverIcs = buildIcsContent({
          location: { city: 'Delhi' },
          ventilationWindow: { startHour: 23, endHour: 1, label: '23:00–01:00 IST', avgPm25: 90 }
        }, 'hi');
        const [, dayA, dayB] = rolloverIcs.match(/DTSTART:(\d{8})T173000Z\r\nDTEND:(\d{8})T193000Z/) || [];
        assert.ok(dayA && dayB && dayA === dayB, '23:00-01:00 IST maps to 17:30Z-19:30Z on same UTC date');

        const spanMidnightIcs = buildIcsContent({
          location: { city: 'Delhi' },
          ventilationWindow: { startHour: 23, endHour: 8, label: '23:00–08:00 IST', avgPm25: 90 }
        }, 'hi');
        const [, dtStart, dtEnd] = spanMidnightIcs.match(/DTSTART:(\d{8})T173000Z\r\nDTEND:(\d{8})T023000Z/) || [];
        assert.ok(dtStart && dtEnd && Number(dtEnd) > Number(dtStart), 'Overnight DTEND must advance UTC date');

        doc.getElementById('copy-whatsapp-btn').click();
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(doc.getElementById('whatsapp-fallback-wrap').hidden, false);

        const enAxe = await axe.run(doc.documentElement, {
          rules: { 'color-contrast': { enabled: false } }
        });
        assert.deepEqual(enAxe.violations, [], `axe EN violations: ${JSON.stringify(enAxe.violations, null, 2)}`);
        assert.ok(enAxe.passes.some((p) => p.id === 'html-has-lang'));

        doc.getElementById('lang-hi-btn').click();
        assert.equal(doc.documentElement.lang, 'hi');
        assert.equal(toggleBtn.textContent, 'डेटा तालिका छिपाएं');
        assert.equal(doc.getElementById('close-copilot-btn').hasAttribute('aria-label'), false);
        assert.match(doc.querySelector('#inversion-diagram-callouts li').textContent, /मिश्रण परत/);
        const hiAxe = await axe.run(doc.documentElement, {
          rules: { 'color-contrast': { enabled: false } }
        });
        assert.deepEqual(hiAxe.violations, [], `axe HI violations: ${JSON.stringify(hiAxe.violations, null, 2)}`);

        // Additional UI flows: avoid-confidence anchor2 + .ics, preset click, non-404 rollback, profile auto-resync, print/ics, quick chip, and WCAG CSS contrast
        const prevAnchorFetch = globalThis.fetch;
        try {
          let slowReject;
          globalThis.fetch = (url) => {
            if (String(url).includes('/api/aqi?') && String(url).includes('coastal-moderate')) {
              return new Promise((resolve) => resolve(new Response(JSON.stringify({ error: { message: 'Upstream busy' } }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
            }
            if (String(url).includes('/api/chat')) {
              return new Promise((_resolve, reject) => {
                slowReject = reject;
              });
            }
            return new Response(JSON.stringify(app.state.snapshot), { status: 200, headers: { 'Content-Type': 'application/json' } });
          };

          // Commit valid city 'Delhi' first, then verify non-404 error rolls back state.query rather than committing failed preset
          doc.getElementById('city-input').value = 'Delhi';
          doc.getElementById('city-search-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
          await new Promise((resolve) => setTimeout(resolve, 25));
          assert.equal(app.state.query.city, 'Delhi');
          doc.getElementById('preset-coastal').click();
          await new Promise((resolve) => setTimeout(resolve, 25));
          assert.equal(app.state.query.city, 'Delhi');
          assert.equal(app.state.query.preset, '');
          assert.match(doc.getElementById('status-banner').textContent, /Upstream busy/);

          // Editing city clears status-banner alert state cleanly
          doc.getElementById('city-input').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
          assert.equal(doc.getElementById('status-banner').classList.contains('status-error'), false);

          // Unchecking all profile checkboxes re-checks commuter fallback in DOM
          for (const cb of doc.querySelectorAll('input[name="profiles"]')) {
            cb.checked = false;
          }
          doc.querySelector('input[name="profiles"][value="infant"]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
          assert.equal(doc.querySelector('input[name="profiles"][value="commuter"]').checked, true);

          // Avoid-confidence 15-min ICS reminder & title
          const avoidIcs = buildIcsContent({
            location: { city: 'Delhi' },
            ventilationWindow: { startHour: 14, endHour: 16, label: '14:00–16:00 IST', avgPm25: 250, confidence: 'avoid' }
          }, 'en');
          assert.match(avoidIcs, /Brief <5 Min Flush/);

          // Print & ICS buttons + unsupported geolocation branch
          dom.window.print = () => {};
          dom.window.URL.createObjectURL = () => 'blob:mock';
          dom.window.URL.revokeObjectURL = () => {};
          doc.getElementById('print-sheet-btn').click();
          doc.getElementById('download-ics-btn').click();

          Object.defineProperty(dom.window.navigator, 'geolocation', { configurable: true, value: undefined });
          doc.getElementById('gps-locate-btn').click();
          assert.equal(doc.getElementById('status-banner').classList.contains('status-error'), true);

          // Quick-chip disables chips while loading & AbortError doesn't unlock early
          const firstChip = doc.querySelector('.quick-chip-btn');
          firstChip.click();
          assert.equal(firstChip.disabled, true);
          assert.equal(doc.getElementById('copilot-send-btn').disabled, true);
          const abortErr = new Error('Aborted');
          abortErr.name = 'AbortError';
          slowReject(abortErr);
          await new Promise((resolve) => setTimeout(resolve, 10));
          assert.equal(doc.getElementById('copilot-send-btn').disabled, true);
        } finally {
          globalThis.fetch = prevAnchorFetch;
        }
      } finally {
        app.destroy();
      }
    });
  });

  it('meets WCAG 2.2 AA contrast ratio (>= 4.5:1) across all semantic palette pairs in public/styles.css', async () => {
    const css = await fs.readFile(path.join(PUBLIC_DIR, 'styles.css'), 'utf8');
    const tokens = Object.fromEntries(Array.from(css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g), (m) => [m[1], m[2]]));
    const relLum = (hex) => {
      const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
      const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const ratio = (fg, bg) => {
      const [l1, l2] = [relLum(fg), relLum(bg)].sort((a, b) => b - a);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    const pairs = [
      ['--text-primary', '--bg-canvas'],
      ['--text-primary', '--bg-surface'],
      ['--text-secondary', '--bg-surface'],
      ['--text-muted', '--bg-surface'],
      ['--accent-ink', '--accent-soft'],
      ['--sev-good-text', '--sev-good-bg'],
      ['--sev-sat-text', '--sev-sat-bg'],
      ['--sev-mod-text', '--sev-mod-bg'],
      ['--sev-poor-text', '--sev-poor-bg'],
      ['--sev-vpoor-text', '--sev-vpoor-bg'],
      ['--sev-sev-text', '--sev-sev-bg']
    ];
    for (const [fgKey, bgKey] of pairs) {
      const cr = ratio(tokens[fgKey], tokens[bgKey]);
      assert.ok(cr >= 4.5, `WCAG AA contrast < 4.5 for ${fgKey}/${bgKey}: ${cr.toFixed(2)}`);
    }
    assert.ok(ratio('#FFFFFF', tokens['--accent']) >= 4.5, 'Primary CTA button white-on-accent contrast must be >= 4.5');
  });
});

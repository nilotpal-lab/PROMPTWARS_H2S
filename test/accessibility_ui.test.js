import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';
import { buildAirQualitySnapshot } from '../lib/aqi.js';
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
  it('contains zero unsafe DOM sinks, evals, inline scripts, or inline style attributes', async () => {
    const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    assert.equal(/<style\b/i.test(html), false, 'Inline <style> block found in HTML');
    assert.equal(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(html), false, 'Zoom-blocking viewport found');
    assert.match(html, /viewport-fit=cover/);

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

  it('matches lib/impact.js dosimetry and lib/aqi.js NAQI in client 0ms state mirror', async () => {
    const { computeImpactMirror, createInitialState } = await import('../public/js/state.js');
    const scenarios = [
      { pm25: 0, profile: 'commuter', maskType: 'n95', purifierMode: 'diy_cr_box', roomVolumeM3: 40, outdoorHours: 0, noExhaustTadka: false, indoorIncenseOrCoil: false, dryJhaduSweeping: false, sealed24hNoFlush: false, commuteFrom: 'petrol_car', commuteTo: 'wfh', dailyKm: 0, commuteDaysPerWeek: 5, communityActions: [] },
      { pm25: 220, profile: 'commuter', maskType: 'n95', purifierMode: 'diy_cr_box', roomVolumeM3: 40, outdoorHours: 2.5, noExhaustTadka: true, indoorIncenseOrCoil: false, dryJhaduSweeping: false, sealed24hNoFlush: false, commuteFrom: 'petrol_car', commuteTo: 'metro_bus', dailyKm: 20, commuteDaysPerWeek: 5, communityActions: ['compost_leaves'] },
      { pm25: 340, profile: 'infant', maskType: 'n95', purifierMode: 'hepa_purifier', roomVolumeM3: 32, outdoorHours: 0.5, noExhaustTadka: false, indoorIncenseOrCoil: true, dryJhaduSweeping: true, sealed24hNoFlush: true, commuteFrom: 'diesel_cab', commuteTo: 'ev', dailyKm: 12, commuteDaysPerWeek: 6, communityActions: ['watchman_thermal_gear', 'school_no_idling_dg_stagger'] }
    ];

    for (const cfg of scenarios) {
      const serverImpact = calculateHouseholdImpact({ ...cfg, outdoorPm25: cfg.pm25 });
      const clientImpact = computeImpactMirror(cfg.pm25, cfg);
      assert.deepEqual(clientImpact.dose, serverImpact.dose);
      assert.deepEqual(clientImpact.indoorBox, serverImpact.indoorBox);
      assert.equal(clientImpact.adultCigaretteEquivalent, serverImpact.adultCigaretteEquivalent);
      assert.equal(clientImpact.co2eSavedKgPerWeek, serverImpact.co2eSavedKgPerWeek);
      assert.equal(clientImpact.pm25AvoidedGPerWeek, serverImpact.pm25AvoidedGPerWeek);
    }

    const dom = await loadFrontendDom();
    await withDomGlobals(dom, async () => {
      const seeded = createInitialState().snapshot;
      const domainDelhi = buildAirQualitySnapshot({ presetId: 'delhi-severe' });
      assert.equal(seeded.current.naqi, domainDelhi.current.naqi);
      assert.equal(seeded.current.category, domainDelhi.current.category);
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

  it('aligns rotated 24h SVG chart bands inside viewBox and avoids dose legend overlap / zero-division', async () => {
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

      const tickTexts = Array.from(chartSvg.querySelectorAll('text')).map((n) => n.textContent);
      assert.ok(tickTexts.includes('18:00'));
      for (const rect of chartSvg.querySelectorAll('rect')) {
        const x = Number(rect.getAttribute('x'));
        const w = Number(rect.getAttribute('width'));
        assert.ok(x >= 0 && x + w <= 720, `Band rect overflowed viewBox: x=${x}, w=${w}`);
      }

      const doseSvg = doc.getElementById('dose-bar-svg');
      renderDoseBarSvg(doseSvg, { dose: { commuteOutdoor: 0, cookingIndoor: 0, baselineIndoor: 0, totalMitigatedUg: 0 } }, 'en');
      const legendTexts = Array.from(doseSvg.querySelectorAll('text'));
      assert.equal(legendTexts.length, 3);
      const yPositions = legendTexts.map((t) => Number(t.getAttribute('y')));
      assert.equal(new Set(yPositions).size, 3, 'Dose legend rows must stack on distinct Y coordinates');
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

      // Dynamic profile selector updates to highest-risk checked member
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
      assertCleanElementAttrs(doc);

      // Verify 24h table toggle & EN <-> HI label preservation
      const toggleBtn = doc.getElementById('toggle-table-btn');
      const tableWrap = doc.getElementById('pm25-table-wrap');
      assert.equal(toggleBtn.getAttribute('aria-expanded'), 'false');
      toggleBtn.click();
      assert.equal(toggleBtn.getAttribute('aria-expanded'), 'true');
      assert.equal(tableWrap.hidden, false);
      assert.equal(toggleBtn.getAttribute('data-i18n'), 'hideTableBtn');

      // Verify APG roving-tabindex keyboard navigation
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

      // Verify <dialog> open, Escape close & focus restoration
      const openBtn = doc.getElementById('open-copilot-btn');
      const dialog = doc.getElementById('copilot-dialog');
      openBtn.focus();
      openBtn.click();
      assert.equal(dialog.hasAttribute('open'), true);
      dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert.equal(dialog.hasAttribute('open'), false);
      assert.equal(doc.activeElement, openBtn);

      // Verify midnight hour 0 and midnight rollover in .ics export
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

      // Verify WhatsApp fallback textarea appears when clipboard unavailable
      doc.getElementById('copy-whatsapp-btn').click();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(doc.getElementById('whatsapp-fallback-wrap').hidden, false);

      const enAxe = await axe.run(doc.documentElement, {
        rules: { 'color-contrast': { enabled: false } }
      });
      assert.deepEqual(enAxe.violations, [], `axe EN violations: ${JSON.stringify(enAxe.violations, null, 2)}`);
      assert.ok(enAxe.passes.some((p) => p.id === 'html-has-lang'));

      // Switch to Hindi: check <html lang="hi">, preserved expanded table-toggle button text, and 0 axe violations
      doc.getElementById('lang-hi-btn').click();
      assert.equal(doc.documentElement.lang, 'hi');
      assert.equal(toggleBtn.textContent, 'डेटा तालिका छिपाएं');
      assert.equal(doc.getElementById('close-copilot-btn').hasAttribute('aria-label'), false);
      const hiAxe = await axe.run(doc.documentElement, {
        rules: { 'color-contrast': { enabled: false } }
      });
      assert.deepEqual(hiAxe.violations, [], `axe HI violations: ${JSON.stringify(hiAxe.violations, null, 2)}`);
      } finally {
        app.destroy();
      }
    });
  });
});

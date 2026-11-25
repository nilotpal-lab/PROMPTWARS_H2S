import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';
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

  it('matches lib/impact.js dosimetry calculations in client 0ms mirror', async () => {
    const { computeImpactMirror } = await import('../public/js/state.js');
    const scenarios = [
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
  });

  it('escapes worst-case XSS payloads, supports APG roving-tabindex tabs, Escape dialog restoration, and passes axe-core with 0 violations', async () => {
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

      const { state } = initApp(dom.window.document);
      const doc = dom.window.document;

      state.snapshot.location.city = `Anand Vihar ${xssPayload}`;
      state.snapshot.regionalContext = {
        fireAlert: { active: true, fireCount: 42, region: 'Punjab-Haryana', messageEn: `Fire plume ${xssPayload}` }
      };
      state.snapshot.whatChangedToday.summaryEn = `Change summary ${xssPayload}`;
      state.household.profile = 'infant';
      state.household.profiles = ['infant', 'asthmatic'];
      state.household.maskType = 'n95';
      state.impact = computeImpactMirror(260, state.household);
      state.planSource = 'gemini';
      state.plan = {
        lang: 'en',
        headlinePlainEnglish: `Headline ${xssPayload}`,
        medicalRedFlag: { active: true, guidance: `Red flag ${xssPayload}`, emergencySigns: [`Sign ${xssPayload}`] },
        threeAnchorRoutine: [
          { id: 'morning_shield', timeWindow: '06:30–09:00 IST', title: `Morning ${xssPayload}`, conflictNote: xssPayload, actions: [xssPayload] }
        ],
        profileGuidance: [
          { profileId: 'infant', label: 'Infant', maskRule: `Hard block ${xssPayload}`, outdoorRule: xssPayload, priorityAction: xssPayload }
        ],
        iaqHacks: { zero_cost: [{ title: xssPayload, detail: xssPayload }], diy: [], purifier: [] },
        mythBusters: [{ myth: xssPayload, reality: xssPayload }],
        commuteAndCommunity: { whatsappBrief: `RWA Brief ${xssPayload}` }
      };

      const refs = collectDomRefs(doc);
      renderLocationAndTelemetry(refs, state.snapshot, 'en');
      renderSimulatorReadout(refs, state.impact, state.household, state.snapshot, 'en');
      renderPlanSections(refs, state, () => {});
      renderCopilotPanel(refs, [{ role: 'assistant', text: `Reply ${xssPayload}`, meta: 'NAQI 420' }], state.snapshot, 'en', () => {});

      assert.equal(state.impact.mask.blockedForInfant, true);
      assert.equal(state.impact.mask.efficiency, 0);
      assert.equal(refs['infant-mask-warning'].hidden, false);
      assert.equal(dom.window.__xssFired, undefined);
      assert.equal(doc.querySelectorAll('img[src="x"]').length, 0);
      assert.ok(refs['hero-location-city'].textContent.includes('<img src=x onerror=alert(1)>'));
      assertCleanElementAttrs(doc);

      const toggleBtn = doc.getElementById('toggle-table-btn');
      const tableWrap = doc.getElementById('pm25-table-wrap');
      assert.equal(toggleBtn.getAttribute('aria-expanded'), 'false');
      assert.equal(tableWrap.hidden, true);
      toggleBtn.click();
      assert.equal(toggleBtn.getAttribute('aria-expanded'), 'true');
      assert.equal(tableWrap.hidden, false);

      const tabRoutine = doc.getElementById('tab-routine');
      const tabIaq = doc.getElementById('tab-iaq');
      const tabImpact = doc.getElementById('tab-impact');
      tabRoutine.focus();
      tabRoutine.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      assert.equal(tabIaq.getAttribute('aria-selected'), 'true');
      assert.equal(tabIaq.getAttribute('tabindex'), '0');
      assert.equal(tabRoutine.getAttribute('tabindex'), '-1');
      assert.equal(doc.getElementById('panel-iaq').hidden, false);
      assert.equal(doc.getElementById('panel-routine').hidden, true);

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

      const ics = buildIcsContent(state.snapshot, 'en');
      assert.match(ics, /^BEGIN:VCALENDAR/m);
      assert.match(ics, /BEGIN:VEVENT/m);
      assert.match(ics, /END:VCALENDAR/m);

      // Verify WhatsApp fallback textarea appears when clipboard unavailable
      doc.getElementById('copy-whatsapp-btn').click();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(doc.getElementById('whatsapp-fallback-wrap').hidden, false);
      assert.ok(doc.getElementById('whatsapp-fallback-input').value.includes('RWA Brief'));

      // Verify instant 0ms simulator toggle recalculates indoor concentration & CADR gate
      const purifierSel = doc.getElementById('purifier-select');
      purifierSel.value = 'diy_cr_box';
      purifierSel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      assert.match(doc.getElementById('cadr-gate-badge').textContent, /Optimal CADR/);

      const enAxe = await axe.run(doc.documentElement, {
        rules: { 'color-contrast': { enabled: false } }
      });
      assert.deepEqual(enAxe.violations, [], `axe EN violations: ${JSON.stringify(enAxe.violations, null, 2)}`);
      assert.ok(enAxe.passes.some((p) => p.id === 'html-has-lang'));
      assert.equal(doc.querySelectorAll('main').length, 1);
      assert.equal(doc.querySelectorAll('h1').length, 1);

      doc.getElementById('lang-hi-btn').click();
      assert.equal(doc.documentElement.lang, 'hi');
      const hiAxe = await axe.run(doc.documentElement, {
        rules: { 'color-contrast': { enabled: false } }
      });
      assert.deepEqual(hiAxe.violations, [], `axe HI violations: ${JSON.stringify(hiAxe.violations, null, 2)}`);
    });
  });
});

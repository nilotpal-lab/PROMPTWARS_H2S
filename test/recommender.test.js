import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDeterministicPlan,
  generateFallbackChatReply,
  SAFETY_LIMITS
} from '../lib/recommender.js';
import { buildAirQualitySnapshot } from '../lib/aqi.js';

describe('lib/recommender.js — Bilingual Plan, Safety Guardrails & Chat Fallback', () => {
  it('generates complete 3-anchor English plan with 230V 4-filter CR gate, 4 myth-busters, and all 6 profiles', () => {
    const snapshot = buildAirQualitySnapshot({ presetId: 'delhi-severe' });
    const allProfiles = ['infant', 'school_child', 'elderly_cardiac', 'asthmatic', 'commuter', 'outdoor_worker'];
    const plan = generateDeterministicPlan({
      snapshot,
      profiles: allProfiles,
      lang: 'en',
      communityActions: ['compost_leaves', 'watchman_thermal_gear']
    });

    assert.equal(plan.source, 'deterministic');
    assert.equal(plan.lang, 'en');
    assert.ok(plan.headlinePlainEnglish.includes('NAQI'));
    assert.equal(plan.threeAnchorRoutine.length, 3);
    assert.deepEqual(
      plan.threeAnchorRoutine.map((a) => a.id),
      ['morning_shield', 'midday_flush', 'evening_lockdown']
    );

    assert.equal(plan.profileGuidance.length, 6);
    const infant = plan.profileGuidance.find((p) => p.profileId === 'infant');
    assert.match(infant.maskRule, /never place any mask/i);

    assert.ok(plan.iaqHacks.zero_cost.length >= 3);
    const crHack = plan.iaqHacks.diy.find((h) => /Corsi-Rosenthal/i.test(h.title));
    assert.ok(crHack);
    assert.match(crHack.detail, /230V/i);
    assert.match(crHack.detail, /FOUR|4/);
    assert.ok(plan.iaqHacks.diy.some((h) => /carbon/i.test(h.title) || /carbon/i.test(h.detail)));

    assert.equal(plan.mythBusters.length, 4);
    assert.deepEqual(
      plan.mythBusters.map((m) => m.id),
      ['houseplants', 'ozone_ionizers', 'washing_n95', 'ac_mesh_screens']
    );

    assert.equal(plan.medicalRedFlag.active, true);
    assert.match(plan.commuteAndCommunity.whatsappBrief, /500 households/i);
  });

  it('activates Medical Red-Flag when NAQI > 300 or sensitive profiles selected, and stays quiet otherwise', () => {
    const cleanSnapshot = buildAirQualitySnapshot({ presetId: 'coastal-moderate' });
    const quiet = generateDeterministicPlan({
      snapshot: cleanSnapshot,
      profiles: ['commuter'],
      lang: 'en'
    });
    assert.equal(quiet.medicalRedFlag.active, false);
    assert.equal(quiet.medicalRedFlag.severity, 'none');

    const sensitive = generateDeterministicPlan({
      snapshot: cleanSnapshot,
      profiles: ['asthmatic'],
      lang: 'en'
    });
    assert.equal(sensitive.medicalRedFlag.active, true);
    assert.equal(sensitive.medicalRedFlag.severity, 'elevated');
  });

  it('supports full Hindi (हिन्दी) output across headline, routine, myths, and chat fallback', () => {
    const planHi = generateDeterministicPlan({
      presetId: 'igp-very-poor',
      profiles: ['infant', 'elderly_cardiac'],
      lang: 'hi'
    });
    assert.equal(planHi.lang, 'hi');
    assert.match(planHi.headlinePlainEnglish, /[\u0900-\u097F]/);
    assert.match(planHi.threeAnchorRoutine[0].title, /[\u0900-\u097F]/);
    assert.match(planHi.profileGuidance[0].maskRule, /मास्क न पहनाएं/);
    assert.match(planHi.mythBusters[0].reality, /[\u0900-\u097F]/);

    const chatHi = generateFallbackChatReply({
      message: 'क्या मैं शिशु को मास्क पहनाऊं?',
      lang: 'hi'
    });
    assert.equal(chatHi.source, 'fallback');
    assert.match(chatHi.reply, /कभी कोई मास्क न पहनाएं/);
  });

  it('grounds fallback chat replies with live metrics and enforces safety invariants', () => {
    assert.equal(SAFETY_LIMITS.INFANT_MASK_FORBIDDEN, true);
    assert.equal(SAFETY_LIMITS.MIN_CR_FILTERS_230V, 4);

    const snapshot = buildAirQualitySnapshot({ presetId: 'delhi-severe' });
    const windowReply = generateFallbackChatReply({
      message: 'When should I open windows for fresh air?',
      snapshot,
      lang: 'en'
    });
    assert.equal(windowReply.source, 'fallback');
    assert.ok(windowReply.reply.includes(snapshot.ventilationWindow.label));
    assert.equal(windowReply.citedMetrics.naqi, snapshot.current.naqi);

    const infantReply = generateFallbackChatReply({
      message: 'Can my infant baby wear an N95 mask outside?',
      snapshot,
      lang: 'en'
    });
    assert.match(infantReply.reply, /NEVER put any mask on an infant/i);
  });
});
